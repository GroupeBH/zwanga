import { useEffect, useRef, useState } from 'react';
import { getPickupArrivalEstimate, isAwaitingPassengerPickup, isFreshPickupLocation,
  PICKUP_LOCATION_MAX_AGE_MS, PICKUP_ROUTE_MAX_AGE_MS, PICKUP_ROUTE_REFRESH_MS,
} from '@/features/passenger-navigation/pickupArrivalEstimate';

type Params = Omit<Parameters<typeof getPickupArrivalEstimate>[0], 'now'> & {
  isScreenActive: boolean;
  fetchRoute: () => Promise<void>;
};

export function usePassengerPickupEstimate(params: Params) {
  const [, expireEstimate] = useState(0);
  const current = useRef(params);
  current.current = params;
  const awaitingPickup = isAwaitingPassengerPickup(params.booking, params.trip);
  const active = params.isScreenActive && params.online && awaitingPickup && params.trip?.status === 'ongoing' &&
    params.trip.interruptionRequest?.status !== 'confirmed';
  const now = Date.now();

  // One local expiry timer, no second GPS stream or second location poller.
  useEffect(() => {
    if (!active) return;
    const expiries = [
      params.locationTimestamp === undefined ? NaN : params.locationTimestamp + PICKUP_LOCATION_MAX_AGE_MS,
      params.routeInfo?.fetchedAt === undefined ? NaN : params.routeInfo.fetchedAt + PICKUP_ROUTE_MAX_AGE_MS,
    ].filter(time => Number.isFinite(time) && time > Date.now());
    if (!expiries.length) return;
    const timer = setTimeout(() => expireEstimate(value => value + 1), Math.min(...expiries) - Date.now() + 1);
    return () => clearTimeout(timer);
  }, [active, params.locationTimestamp, params.routeInfo?.fetchedAt, now]);

  // Reuse the existing guarded directions request, at most once per minute here.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const latest = current.current;
      if (!latest.hasDriverLocation || !isFreshPickupLocation(latest.locationTimestamp, Date.now())) return;
      void latest.fetchRoute();
    }, PICKUP_ROUTE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, params.booking?.id, params.routeSignature]);

  return getPickupArrivalEstimate({ ...params, now });
}
