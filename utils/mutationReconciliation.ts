import { MUTATION_RECONCILIATION_DELAYS_MS } from '@/constants/network';
import { isAmbiguousTransportError } from '@/utils/errorHelpers';

const wait = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });

type ReconcileAmbiguousMutationOptions<T> = {
  error: unknown;
  loadSnapshot: () => Promise<T | null | undefined>;
  isApplied: (snapshot: T) => boolean;
  delaysMs?: readonly number[];
};

/**
 * Verifies the authoritative server state after an ambiguous transport error.
 * It never retries the mutation itself, which prevents duplicate side effects.
 */
export async function reconcileAmbiguousMutation<T>({
  error,
  loadSnapshot,
  isApplied,
  delaysMs = MUTATION_RECONCILIATION_DELAYS_MS,
}: ReconcileAmbiguousMutationOptions<T>): Promise<T | null> {
  if (!isAmbiguousTransportError(error)) {
    return null;
  }

  for (const delayMs of delaysMs) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    try {
      const snapshot = await loadSnapshot();
      if (snapshot != null && isApplied(snapshot)) {
        return snapshot;
      }
    } catch {
      // A failed verification is expected on an unstable connection. Continue
      // with the bounded schedule instead of retrying the mutation.
    }
  }

  return null;
}
