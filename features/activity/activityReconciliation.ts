import type { AccountActivity, ActivityCategory } from '@/store/api/accountActivityApi';

export const ACTIVITY_CATEGORIES: ActivityCategory[] = ['trips', 'bookings', 'requests'];

/** One in-flight read per category; unchanged, healthy caches need no further read.
 * Failed reads retain the last applied revision and retry on the next snapshot.
 */
export function createActivityReconciliation(options: {
  load: (category: ActivityCategory) => Promise<unknown>;
  hasCachedItems: (category: ActivityCategory) => boolean;
  hasFailedRead?: (category: ActivityCategory) => boolean;
}) {
  let cancelled = false;
  const applied = new Map<ActivityCategory, string>();
  const desired = new Map<ActivityCategory, AccountActivity[ActivityCategory]>();
  const running = new Map<ActivityCategory, Promise<void>>();

  const drain = (category: ActivityCategory): Promise<void> => {
    const existing = running.get(category);
    if (existing) return existing;
    const job = Promise.resolve().then(async () => {
      while (!cancelled) {
        const next = desired.get(category);
        const failedRead = options.hasFailedRead?.(category) ?? false;
        if (!next || (applied.get(category) === next.revision && !failedRead)) return;
        // Initial empty account: the existing one-time queries need no redundant refetch.
        const initiallyEmpty = !applied.has(category) && next.count === 0
          && !options.hasCachedItems(category) && !failedRead;
        try {
          if (!initiallyEmpty) await options.load(category);
        } catch { return; } // Never replace last known ride/payment state with empty on failure.
        if (cancelled) return;
        applied.set(category, next.revision);
        // Retry a failed bootstrap only once per snapshot, never in a tight loop.
        if (desired.get(category)?.revision === next.revision) return;
      }
    }).finally(() => running.delete(category));
    running.set(category, job);
    return job;
  };
  return {
    apply(snapshot: AccountActivity) {
      if (cancelled) return Promise.resolve();
      ACTIVITY_CATEGORIES.forEach(key => desired.set(key, snapshot[key]));
      return Promise.all(ACTIVITY_CATEGORIES.map(drain)).then(() => undefined);
    },
    dispose() { cancelled = true; desired.clear(); },
  };
}
