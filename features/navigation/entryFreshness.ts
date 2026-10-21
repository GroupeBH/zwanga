/** Presentation cache only. Mutations still use the authenticated server contract. */
export const ENTRY_CACHE_MAX_AGE_MS = 30_000;
export const ENTRY_COVER_MAX_MS = 2_000;

type EntryRead = { startedTimeStamp?: number; fulfilledTimeStamp?: number };
/** A response finishing after entry can still belong to a pre-entry request. */
export function isEntryReadFresh(read: EntryRead, since: number) {
  const { startedTimeStamp: start, fulfilledTimeStamp: end } = read;
  return typeof start === 'number' && Number.isFinite(start) && start >= since &&
    typeof end === 'number' && Number.isFinite(end) && end >= start;
}

export function freshEntryData<T>(read: {
  data?: T; isSuccess?: boolean; isError?: boolean; isFetching?: boolean;
  status?: string; startedTimeStamp?: number; fulfilledTimeStamp?: number;
}, now = Date.now(), since = now - ENTRY_CACHE_MAX_AGE_MS): T | undefined {
  const time = read.fulfilledTimeStamp;
  return read.isSuccess && !read.isError && !read.isFetching && read.status !== 'pending' &&
    isEntryReadFresh(read, since) && typeof time === 'number' && time <= now && now - time < ENTRY_CACHE_MAX_AGE_MS
    ? read.data : undefined;
}
