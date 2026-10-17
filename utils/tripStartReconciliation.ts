import type { Trip } from '@/types';
import { getErrorMessageText, getErrorStatus } from './errors/errorParsing';
import { reconcileAmbiguousMutation } from './mutationReconciliation';

/** Recognize this transition only, not arbitrary authorization or business errors. */
export function isTripStartStateConflict(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status !== 400 && status !== 409) return false;
  const data = (error as { data?: { code?: string } })?.data;
  if (data?.code === 'TRIP_START_STATE_CHANGED') return true;
  const message = getErrorMessageText(error);
  return message.includes('Le statut du trajet a changé.')
    || /^Impossible de démarrer le trajet\. Statut actuel : (active|ongoing)\.?$/i.test(message);
}

/** Refresh a start conflict once; never replay a mutation or invent an ongoing status. */
export async function reconcileTripMutation({ error, tripId, expectedStatuses, refetch }: {
  error: unknown; tripId: string; expectedStatuses: readonly string[];
  refetch: () => Promise<{ data?: Trip; error?: unknown }>;
}): Promise<Trip | null> {
  const loadSnapshot = async () => {
    const result = await refetch();
    // RTK Query can retain stale data alongside a failed read.
    return result.error || result.data?.id !== tripId ? null : result.data ?? null;
  };
  const isApplied = (trip: Trip) => expectedStatuses.includes(trip.status);
  if (expectedStatuses.includes('ongoing') && isTripStartStateConflict(error)) {
    try {
      const trip = await loadSnapshot();
      return trip && isApplied(trip) ? trip : null;
    } catch { return null; }
  }
  return reconcileAmbiguousMutation({ error, loadSnapshot, isApplied });
}
