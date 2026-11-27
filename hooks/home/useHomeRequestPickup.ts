import { useEffect, useMemo, useState } from 'react';
import type { Booking, Trip, TripRequest } from '@/types';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useGetRequestPickupSummaryQuery } from '@/store/api/requestPickupApi';
import { homePickupRegion, homeRequestPickupPresentation, selectHomeRequestPickup } from '@/features/home/homeRequestPickup';

export function useHomeRequestPickup({ requests, bookings, userId, refreshedTrip, occupiedTrip, active }: {
  requests: readonly TripRequest[]; bookings?: readonly Booking[]; userId?: string;
  refreshedTrip?: Trip; occupiedTrip?: Trip | null; active: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  const request = useMemo(() => selectHomeRequestPickup(requests, bookings, userId, refreshedTrip, occupiedTrip, Math.max(now, Date.now())),
    [requests, bookings, userId, refreshedTrip, occupiedTrip, now]);
  const enabled = useDisplayReadsEnabled(active && !!request && !!userId);
  // Reuse the participant-only endpoint; never subscribe to public nearby-driver GPS.
  const query = useGetRequestPickupSummaryQuery(request?.id ?? '', displayReadOptions(enabled, 30_000));
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [enabled, request?.id, query.fulfilledTimeStamp]);
  const status = query.error && 'status' in query.error ? query.error.status : null;
  const unavailable = query.originalArgs === request?.id && query.isError && [401, 403, 404, 410].includes(Number(status));
  const homeRequestPickup = request && !unavailable ? request : null;
  const pickupModel = homeRequestPickup && enabled && !query.isError
    ? homeRequestPickupPresentation(query.currentData, homeRequestPickup, userId, Math.max(now, Date.now())) : null;
  const pickupRegion = useMemo(() => homePickupRegion([pickupModel?.driverPosition ?? null, pickupModel?.pickupPosition ?? null]),
    [pickupModel?.driverPosition, pickupModel?.pickupPosition]);
  return { homeRequestPickup, pickupModel, pickupRegion, pickupOnline: enabled,
    pickupLoading: query.isFetching };
}
