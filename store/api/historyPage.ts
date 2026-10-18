import type { FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
export type HistoryPage<T> = { data: T[]; nextCursor: string | null };
export type HistoryArgs = { search?: string };
type Read = (args: string | FetchArgs) => { data?: unknown; error?: FetchBaseQueryError }
  | PromiseLike<{ data?: unknown; error?: FetchBaseQueryError }>;

export async function readHistoryPage<S, T extends { id: string }>(
  baseQuery: Read, url: string, pageParam: string | null, search: string | undefined,
  map: (record: S) => T, legacyFilter: (record: T) => boolean, timestamp: (record: T) => string,
) {
  const response = await baseQuery({ url: `${url}/history`, params: { before: pageParam ?? undefined, limit: 30, search } });
  if (response.error?.status === 404 && !pageParam) {
    // Older servers stay usable during rolling deployment, without dropping old records.
    const legacy = await baseQuery(url);
    if (legacy.error) return { error: legacy.error };
    const data = (legacy.data as S[]).map(map).filter(legacyFilter)
      .sort((a, b) => Date.parse(timestamp(b)) - Date.parse(timestamp(a)) || b.id.localeCompare(a.id));
    return { data: { data, nextCursor: null } as HistoryPage<T> };
  }
  if (response.error) return { error: response.error };
  const page = response.data as HistoryPage<S>;
  return { data: { ...page, data: page.data.map(map) } as HistoryPage<T> };
}
