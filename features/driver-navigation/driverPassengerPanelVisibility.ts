import type { LocationObject } from 'expo-location';
import type { Waypoint } from './navigationModel';
import { calculateDistanceMeters, isValidCoordinate, LOCATION_FRESHNESS_MS } from '@/utils/navigation/routeProgress';

export const PASSENGER_ARRIVAL_PANEL_METERS = 500;

/** Presentation only: never confirms boarding/arrival or advances a waypoint. */
export function passengerPanelApproach(tripId: string, stop: Waypoint | undefined, fix: LocationObject | null, now = Date.now()) {
  // A local declaration or passenger-only vote is not a completed pickup.
  if (!tripId || !stop || stop.completed || stop.type !== 'dropoff' ||
    stop.booking?.tripId !== tripId || stop.booking.status !== 'accepted' ||
    !stop.booking.pickedUp || stop.booking.droppedOff) return null;
  const destination = { latitude: stop.location.lat, longitude: stop.location.lng };
  if (!fix || !isValidCoordinate(fix.coords) || !isValidCoordinate(destination) ||
    !Number.isFinite(fix.timestamp) || now < fix.timestamp || now - fix.timestamp >= LOCATION_FRESHNESS_MS ||
    typeof fix.coords.accuracy !== 'number' || !Number.isFinite(fix.coords.accuracy) ||
    fix.coords.accuracy < 0 || fix.coords.accuracy > 100) return null;
  const distance = calculateDistanceMeters(fix.coords, destination);
  if (!Number.isFinite(distance)) return null;
  return {
    key: `${tripId}:${stop.id}:${destination.latitude}:${destination.longitude}`,
    // Avoid excluding the exact boundary through floating-point roundoff.
    near: distance <= PASSENGER_ARRIVAL_PANEL_METERS + 0.000001,
    expiresAt: fix.timestamp + LOCATION_FRESHNESS_MS,
  };
}
