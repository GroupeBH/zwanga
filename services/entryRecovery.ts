import { DEFAULT_API_TIMEOUT_MS } from '@/constants/network';

// Budget shared by successive detail reads within each entry phase.
export const ENTRY_LOAD_TIMEOUT_MS = DEFAULT_API_TIMEOUT_MS + 5000;
export type EntryStage = 'profile' | 'activity' | 'trips' | 'bookings' | 'requests'
  | 'trip-detail' | 'booking-detail' | 'request-detail' | 'dispatch-detail' | 'navigation';
const reported = new Map<string, number>();

/** Do not infer a timeout from duration alone: native fetch can also return AbortError. */
function failureDetails(error: unknown) {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  if (value.status === 'TIMEOUT_ERROR' || value.name === 'TimeoutError') return { failure: 'timeout' };
  if (value.name === 'AbortError' || (value.status === 'FETCH_ERROR' && typeof value.error === 'string' &&
    /^AbortError(?:[:\s]|$)/.test(value.error))) return { failure: 'aborted' };
  if (value.status === 'FETCH_ERROR') return { failure: 'network' };
  if (typeof value.status === 'number' && Number.isInteger(value.status) && value.status >= 100 && value.status <= 599)
    return { failure: 'http', httpStatus: value.status };
  if (value.status === 'PARSING_ERROR' || value.status === 'CUSTOM_ERROR') return { failure: 'invalid-response' };
  return { failure: 'unknown' };
}

/** Static labels, HTTP status and elapsed time only; never payloads or raw errors. */
export function reportEntryFailure(stage: EntryStage, reason: 'read' | 'timeout' | 'navigation', startedAt: number, error?: unknown) {
  const code = `${stage}:${reason}`;
  if (Date.now() - (reported.get(code) ?? -Infinity) < 60_000) return;
  reported.set(code, Date.now());
  console.warn('[AppEntry]', code, {
    elapsedMs: Math.max(0, Math.min(300_000, Date.now() - startedAt)),
    ...(reason === 'read' ? failureDetails(error) : {}),
  });
}

type ReadHandle<T> = { unwrap: () => Promise<T> };

/** Cancel the entry wait, never the shared RTK GET: another screen can subscribe
 * AFTER start(). HTTP keeps its own deadline. An invalidated waiter cannot launch
 * another GET or navigate from its eventual result.
 */
export async function readEntryQuery<T>(options: {
  stage: EntryStage; signal?: AbortSignal; current: () => boolean;
  running?: () => PromiseLike<unknown> | undefined;
  reuse?: () => T | undefined;
  start: () => ReadHandle<T>;
}): Promise<T> {
  const startedAt = Date.now();
  let cancelled = false;
  let rejectWait: (error: Error) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => { rejectWait = reject; });
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    rejectWait(new Error('ENTRY_READ_CANCELLED'));
  };
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    reportEntryFailure(options.stage, 'timeout', startedAt);
    cancel();
  }, ENTRY_LOAD_TIMEOUT_MS);
  const valid = () => !cancelled && !options.signal?.aborted && options.current();
  try {
    return await Promise.race([interrupted, (async () => {
      if (!valid()) throw new Error('STALE_ENTRY_READ');
      const cached = options.reuse?.();
      if (cached !== undefined) return cached;
      const running = options.running?.();
      if (running) await Promise.race([running, interrupted]);
      if (!valid()) throw new Error('STALE_ENTRY_READ');
      // A healthy shared detail just completed. Do not immediately GET it again.
      const shared = options.reuse?.();
      if (shared !== undefined) return shared;
      const handle = options.start();
      const result = await Promise.race([handle.unwrap(), interrupted]);
      if (!valid()) throw new Error('STALE_ENTRY_READ');
      return result;
    })()]);
  } catch (error) {
    if (valid()) reportEntryFailure(options.stage, 'read', startedAt, error);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
