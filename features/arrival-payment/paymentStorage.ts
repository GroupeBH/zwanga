export const PAYMENT_STORAGE_TIMEOUT_MS = 8000;
export const PAYMENT_STORAGE_ERROR = 'La sauvegarde du paiement est indisponible. Ne payez pas une seconde fois. Réessayez ou reprenez plus tard.';

/** A deadline releases the UI, not the underlying native operation. */
export function waitForPaymentStorage<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(PAYMENT_STORAGE_ERROR)), PAYMENT_STORAGE_TIMEOUT_MS);
    void operation.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

const operations = new Map<string, Promise<unknown>>();
/** Never overlap native writes, even after their caller has timed out. */
export async function serializePaymentStorage<T>(key: string, run: () => Promise<T>): Promise<T> {
  while (operations.has(key)) await waitForPaymentStorage(operations.get(key)!.catch(() => undefined));
  const task = Promise.resolve().then(run);
  operations.set(key, task);
  const release = () => { if (operations.get(key) === task) operations.delete(key); };
  void task.then(release, release);
  return waitForPaymentStorage(task);
}
