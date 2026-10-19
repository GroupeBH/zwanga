/** Presentation cache only. Mutations still use the authenticated server contract. */
export const ENTRY_CACHE_MAX_AGE_MS = 30_000;
export const ENTRY_COVER_MAX_MS = 2_000;

export function freshEntryData<T>(read: {
  data?: T; isSuccess?: boolean; isError?: boolean; isFetching?: boolean;
  status?: string; fulfilledTimeStamp?: number;
}, now = Date.now()): T | undefined {
  const time = read.fulfilledTimeStamp;
  return read.isSuccess && !read.isError && !read.isFetching && read.status !== 'pending' &&
    typeof time === 'number' && Number.isFinite(time) && time <= now && now - time < ENTRY_CACHE_MAX_AGE_MS
    ? read.data : undefined;
}
