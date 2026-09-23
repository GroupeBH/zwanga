import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

export type HistoryPage<T> = { data: T[]; total: number; nextCursor: string | null };
export type HistoryArgs = { before?: string; limit?: number };
export type HistoryBaseQuery = (args: string | FetchArgs) =>
  ReturnType<BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError>>;

/** Financial histories: keep old builds usable during rollout, without treating outages as empty data. */
export async function readHistoryPage<T extends { id: string; createdAt: string }>(
  baseQuery: HistoryBaseQuery, path: string, legacyPath: string, args: HistoryArgs,
  options: { filter?: string; matches?: (item: T) => boolean; time?: (item: T) => string } = {},
) {
  const legacyCursor = args.before?.startsWith('legacy:');
  if (!legacyCursor) {
    const result = await baseQuery({ url: path, params: { ...args, limit: args.limit ?? 25,
      ...(options.filter ? { filter: options.filter } : {}) } });
    if (!result.error) return { data: result.data as HistoryPage<T> };
    if (args.before || (result.error.status !== 404 && result.error.status !== 405)) return { error: result.error };
  }
  const legacy = await baseQuery(legacyPath);
  if (legacy.error) return { error: legacy.error };
  const items = (legacy.data as T[]).filter(options.matches ?? (() => true)).sort((a, b) =>
    Date.parse(options.time?.(b) ?? b.createdAt) - Date.parse(options.time?.(a) ?? a.createdAt) || b.id.localeCompare(a.id));
  const offset = legacyCursor ? Number(args.before!.slice(7)) || 0 : 0;
  const limit = args.limit ?? 25;
  return { data: { data: items.slice(offset, offset + limit), total: items.length,
    nextCursor: offset + limit < items.length ? `legacy:${offset + limit}` : null } };
}
