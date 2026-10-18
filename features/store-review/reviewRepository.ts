import type { ReviewCompletion } from './reviewEligibility';
import { parseReviewHistory, recordReviewCompletions, reserveReviewAttempt, reviewIsDue } from './reviewPolicy';

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export type NativeReview = { isAvailableAsync(): Promise<boolean>; requestReview(): Promise<void> };
export const reviewStorageKey = (userId: string) => `ZWANGA_STORE_REVIEW_V1:${encodeURIComponent(userId)}`;

/** Serialises account writes and reservations; the production instance is shared across remounts. */
export function createReviewRepository(storage: Storage, now: () => number = Date.now) {
  const queues = new Map<string, Promise<unknown>>();
  let nativeRequestInFlight = false;
  function locked<T>(userId: string, work: () => Promise<T>): Promise<T> {
    const previous = queues.get(userId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    queues.set(userId, next);
    const clear = () => { if (queues.get(userId) === next) queues.delete(userId); };
    void next.then(clear, clear);
    return next;
  }
  return {
    observe(userId: string, initializedAt: number, completions: ReviewCompletion[]) {
      return locked(userId, async () => {
        const key = reviewStorageKey(userId);
        const raw = await storage.getItem(key);
        const previous = parseReviewHistory(raw, initializedAt);
        const next = recordReviewCompletions(previous, completions, now());
        if (raw === null || next !== previous) await storage.setItem(key, JSON.stringify(next));
        return reviewIsDue(next, now());
      });
    },
    requestIfDue(userId: string, initializedAt: number,
      loadNative: () => Promise<NativeReview | null>, isSafe: () => boolean) {
      return locked(userId, async () => {
        if (!isSafe() || nativeRequestInFlight) return false;
        const native = await loadNative();
        if (!native || !isSafe() || !await native.isAvailableAsync() || !isSafe()) return false;
        const key = reviewStorageKey(userId);
        const history = parseReviewHistory(await storage.getItem(key), initializedAt);
        if (!isSafe() || nativeRequestInFlight || !reviewIsDue(history, now())) return false;
        nativeRequestInFlight = true;
        try {
          // Persist BEFORE the native call. A crash, an OS refusal or an invisible prompt
          // must not cause repeated solicitations at each foreground/remount.
          await storage.setItem(key, JSON.stringify(reserveReviewAttempt(history, now())));
          if (!isSafe()) return false; // Conservatively consumes this reservation; no late modal.
          await native.requestReview();
          return true; // Attempt made, NOT proof of a displayed window or a published review.
        } finally { nativeRequestInFlight = false; }
      });
    },
  };
}
