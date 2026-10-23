/** Native reads cannot be cancelled. Ignore late results, but never overlap native writes. */
export const LOCATION_NATIVE_WAIT_MS = 8000;
const mutations = new Map<string, Promise<unknown>>();

export function readLocationNative<T>(operation: Promise<T>, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error('LOCATION_NATIVE_TIMEOUT'));
    }, LOCATION_NATIVE_WAIT_MS);
    operation.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/** A timed-out native write retains its lock until completion and optional compensation.
 * Callers fail promptly instead of poisoning their JS queue; a retry never starts a
 * competing native mutation. A permanently stuck bridge requires native recovery.
 */
export async function mutateLocationNative<T>(key: string, operation: () => Promise<T>,
  cleanupLate?: () => Promise<unknown>): Promise<T> {
  while (mutations.has(key)) await readLocationNative(mutations.get(key)!.catch(() => undefined));
  let expired = false;
  const pending = Promise.resolve().then(operation).finally(async () => {
    if (expired) await cleanupLate?.();
  });
  mutations.set(key, pending);
  const release = () => { if (mutations.get(key) === pending) mutations.delete(key); };
  void pending.then(release, release);
  return readLocationNative(pending, () => { expired = true; });
}
