type Abortable<T> = PromiseLike<T> & { abort: () => void };
type Read = { promise: Promise<unknown>; abort: () => void; users: number; settled: boolean; abandoned: boolean };
const pending = new Map<string, Read>();
const cancelled = () => Object.assign(new Error('Recherche annulée'), { name: 'AbortError' });

/** All Places utility consumers lease the same RTK read. Cancel only after the last leaves. */
export function sharedPlaceRead<T>(key: string, start: () => Abortable<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(cancelled());
  let read = pending.get(key);
  if (read?.abandoned) {
    // Wait for the abort to settle before dispatching the same RTK cache key again.
    return read.promise.then(() => sharedPlaceRead(key, start, signal), () => sharedPlaceRead(key, start, signal));
  }
  if (!read) {
    const request = start();
    const entry: Read = { promise: Promise.resolve(request), abort: () => request.abort(), users: 0, settled: false, abandoned: false };
    const finish = () => { entry.settled = true; if (pending.get(key) === entry) pending.delete(key); };
    entry.promise = entry.promise.then(value => { finish(); return value; }, error => { finish(); throw error; });
    pending.set(key, entry);
    read = entry;
  }
  const entry = read;
  entry.users++;
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const release = () => {
      if (done) return false;
      done = true;
      signal?.removeEventListener('abort', abort);
      entry.users--;
      if (!entry.users && !entry.settled) { entry.abandoned = true; entry.abort(); }
      return true;
    };
    const abort = () => { if (release()) reject(cancelled()); };
    signal?.addEventListener('abort', abort, { once: true });
    entry.promise.then(value => { if (release()) resolve(value as T); }, error => { if (release()) reject(error); });
    if (signal?.aborted) abort();
  });
}
