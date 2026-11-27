import { useEffect, useState } from 'react';
import type { TripRequest } from '@/types';
import { useAppSelector } from '@/store/hooks';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useGetRequestPickupSummaryQuery } from '@/store/api/requestPickupApi';
import { homeRequestPickupPresentation } from '@/features/home/homeRequestPickup';

/** Same participant-only summary and freshness checks as the accepted Home pickup. */
export function useConfirmedRequestPickup(request: TripRequest, active: boolean) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const enabled = useDisplayReadsEnabled(active && request.passengerId === userId && request.status === 'driver_selected');
  const query = useGetRequestPickupSummaryQuery(request.id, displayReadOptions(enabled, 30_000));
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [enabled, request.id, query.fulfilledTimeStamp]);
  const pickup = enabled && !query.isError
    ? homeRequestPickupPresentation(query.currentData, request, userId, Math.max(now, Date.now())) : null;
  return { pickup, enabled, loading: enabled && !pickup && query.isFetching };
}
