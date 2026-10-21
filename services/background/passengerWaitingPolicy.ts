import { PASSENGER_TRIP_STATUS_CHECK_INTERVAL_MS } from '@/constants/rideProgress';

/** Preserve rapid readiness checks near departure; reduce GPS/network work further away. */
export function passengerWaitingInterval(departureTimeMs?: number | null, now = Date.now()) {
  return typeof departureTimeMs === 'number' && Number.isFinite(departureTimeMs) &&
    departureTimeMs - now > 15 * 60_000 ? 180_000 : PASSENGER_TRIP_STATUS_CHECK_INTERVAL_MS;
}
