export const LOCATION_PERMISSION_READ_TIMEOUT_MS = 8_000;

/** Bound bridge/storage waits, not the user's time in the OS permission dialog.
 * Cancellation releases UI only; native promises must still settle on their own. */
export function waitForLocationPermission<T>(promise: Promise<T>, signal: AbortSignal,
  timeout: number | null = LOCATION_PERMISSION_READ_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (operation: () => void) => {
      if (done) return;
      done = true; clearTimeout(timer); signal.removeEventListener('abort', abort); operation();
    };
    const abort = () => finish(() => reject(new Error('LOCATION_PERMISSION_CANCELLED')));
    promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    if (timeout !== null) timer = setTimeout(() => finish(() => reject(new Error('LOCATION_PERMISSION_TIMEOUT'))), timeout);
  });
}

let promptPending = false;
/** No overlapping native dialogs, even if a cancelled UI was unmounted. */
export async function requestLocationPermission<T>(request: () => Promise<T>): Promise<T> {
  if (promptPending) throw new Error('LOCATION_PERMISSION_PROMPT_PENDING');
  promptPending = true;
  try { return await request(); } finally { promptPending = false; }
}
