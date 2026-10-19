import type { ActivityCategory } from '@/store/api/accountActivityApi';
import { getTokenSessionVersion } from '@/services/tokenSession';

export interface ReconciledActivity {
  userId: string;
  reads: Partial<Record<ActivityCategory, { revision: string; fulfilledTimeStamp: number }>>;
}

let owner: object | null = null;
let snapshot: ReconciledActivity | null = null;
let snapshotVersion = getTokenSessionVersion();
let retained: { version: number; snapshot: ReconciledActivity } | null = null;
const listeners = new Set<() => void>();
export const getActivityReadiness = () => snapshotVersion === getTokenSessionVersion() ? snapshot : null;
export const subscribeActivityReadiness = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
function publish(next: ReconciledActivity | null) {
  snapshot = next;
  listeners.forEach(listener => listener());
}

/** In-memory receipts, scoped to the sole reconciliation owner and foreground.
 * A new owner invalidates late results from the previous account/lifecycle. */
export function beginActivityReadiness(userId: string) {
  const token = {};
  const version = getTokenSessionVersion();
  const previous = retained?.version === version && retained.snapshot.userId === userId ? retained.snapshot.reads : {};
  retained = null;
  owner = token;
  snapshotVersion = version;
  publish({ userId, reads: previous });
  return {
    record(category: ActivityCategory, revision: string, fulfilledTimeStamp: number | undefined) {
      if (owner !== token || !snapshot || version !== getTokenSessionVersion() || !Number.isFinite(fulfilledTimeStamp)) return;
      const previous = snapshot.reads[category];
      if (previous?.revision === revision && previous.fulfilledTimeStamp === fulfilledTimeStamp) return;
      publish({ userId, reads: { ...snapshot.reads, [category]: { revision, fulfilledTimeStamp: fulfilledTimeStamp! } } });
    },
    dispose() {
      if (owner !== token) return;
      // One in-memory receipt set, not a persisted route or profile. Reuse requires
      // the same account/session AND exact list timestamp/revision at the next entry.
      retained = snapshot && version === getTokenSessionVersion() ? { version, snapshot } : null;
      owner = null;
      publish(null);
    },
  };
}
