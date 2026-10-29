import { ARRIVAL_PAYMENT_CHECK_TIMEOUT_MS } from './paymentPolicy';

/** Bound the UI wait, not the financial operation. A timeout is NOT a refusal.
 * Never abort a shared RTK query or an already submitted financial mutation. */
export async function readPaymentResult<T>(request: { unwrap(): Promise<T>; unsubscribe?: () => void }): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request.unwrap(), new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('PAYMENT_RESULT_TIMEOUT')), ARRIVAL_PAYMENT_CHECK_TIMEOUT_MS);
    })]);
  } finally {
    clearTimeout(timer);
    request.unsubscribe?.();
  }
}
