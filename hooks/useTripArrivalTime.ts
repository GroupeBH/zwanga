import { useMemo } from 'react';
import type { Trip } from '@/types';
import { getTripArrivalPreview } from '@/utils/tripArrivalPreview';

/** List cards are presentation-only: no network request, GPS subscription or timer. */
export function useTripArrivalTime(trip: Trip | null | undefined): Date | null {
  return useMemo(() => getTripArrivalPreview(trip), [trip]);
}

