import type { Trip } from '@/types';
import { calculateDistanceMeters } from '@/utils/navigation/routeProgress';
import { getTripLocationCoordinate, normalizeTripMapCoordinate, type MapCoordinate } from '@/utils/tripCoordinates';

export const HOME_DEPARTURE_DISTANCE_BAND_METERS = 500;
export const HOME_SUGGESTION_RADIUS_KM = 5;
export const HOME_SUGGESTION_WINDOW_MS = 24 * 60 * 60 * 1000;
export const HOME_SUGGESTION_TIERS = [
  { radiusKm: HOME_SUGGESTION_RADIUS_KM, windowMs: HOME_SUGGESTION_WINDOW_MS },
  { radiusKm: 10, windowMs: 2 * HOME_SUGGESTION_WINDOW_MS },
  { radiusKm: 25, windowMs: 7 * HOME_SUGGESTION_WINDOW_MS },
] as const;
export const HOME_GENERAL_SUGGESTION_TIER = HOME_SUGGESTION_TIERS.length;

function suggestionTier(trip: Trip, distance: number | null, departureTime: number, now: number) {
  if (trip.status !== 'upcoming' || !(trip.availableSeats > 0) || !Number.isFinite(departureTime) || departureTime < now) return -1;
  const nearbyTier = distance === null ? -1 : HOME_SUGGESTION_TIERS.findIndex(
    tier => distance < tier.radiusKm * 1000 && departureTime <= now + tier.windowMs,
  );
  // Proximity is a preference, never a requirement to show an available departure.
  return nearbyTier >= 0 ? nearbyTier : HOME_GENERAL_SUGGESTION_TIER;
}

/** -1 means unavailable, 0 means nearby and soon, the last tier is unrestricted. */
export function getHomeTripSuggestionTier(trip: Trip, origin: MapCoordinate | null | undefined, now = Date.now()) {
  const coordinate = origin ? normalizeTripMapCoordinate(origin.latitude, origin.longitude) : null;
  const departure = getTripLocationCoordinate(trip.departure);
  return suggestionTier(trip, coordinate && departure ? calculateDistanceMeters(coordinate, departure) : null,
    Date.parse(trip.departureTime), now);
}

/** Rank departures locally, without a routing request or mutating the RTK Query cache. */
export function rankHomeTripsByProximity(
  trips: readonly Trip[],
  origin: MapCoordinate | null | undefined,
  bookedTripIds: ReadonlySet<string>,
  now = Date.now(),
  homeSuggestionsOnly = false,
) {
  const coordinate = origin ? normalizeTripMapCoordinate(origin.latitude, origin.longitude) : null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;

  // Each distance and date is computed once, not for every comparator invocation.
  const candidates = trips.map(trip => {
    const departure = getTripLocationCoordinate(trip.departure);
    const timestamp = Date.parse(trip.departureTime);
    const departureTime = Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
    const distance = coordinate && departure ? calculateDistanceMeters(coordinate, departure) : null;
    return {
      trip,
      booked: bookedTripIds.has(trip.id),
      distance,
      tier: suggestionTier(trip, distance, timestamp, now),
      departureTime,
      today: departureTime >= todayStart && departureTime < tomorrowStart,
    };
  });
  // Existing bookings do not prevent discovery from widening. Use only the first
  // non-empty tier; never pad a nearby list with distant departures.
  const bestTier = candidates.reduce((best, item) => !item.booked && item.tier >= 0 ? Math.min(best, item.tier) : best, Infinity);
  const visible = candidates.filter(item => !homeSuggestionsOnly || item.booked || (item.tier >= 0 && item.tier === bestTier));
  return visible.sort((left, right) => {
    // Existing reservations remain easy to find, ahead of new suggestions.
    if (left.booked !== right.booked) return left.booked ? -1 : 1;
    if (left.booked && right.booked && (left.trip.status === 'ongoing') !== (right.trip.status === 'ongoing')) {
      return left.trip.status === 'ongoing' ? -1 : 1;
    }
    if (homeSuggestionsOnly && !left.booked && !right.booked
      && left.tier === HOME_GENERAL_SUGGESTION_TIER && right.tier === HOME_GENERAL_SUGGESTION_TIER
      && left.departureTime !== right.departureTime) return left.departureTime - right.departureTime;
    if (left.distance !== null && right.distance === null) return -1;
    if (left.distance === null && right.distance !== null) return 1;
    if (left.distance !== null && right.distance !== null && left.distance !== right.distance) {
      const distanceBand = Math.floor(left.distance / HOME_DEPARTURE_DISTANCE_BAND_METERS)
        - Math.floor(right.distance / HOME_DEPARTURE_DISTANCE_BAND_METERS);
      if (distanceBand) return distanceBand;
    }
    // Within the same nearby zone, prefer the earliest departure, not a few metres gained.
    if (left.today !== right.today) return left.today ? -1 : 1;
    return left.departureTime - right.departureTime
      || (left.distance ?? 0) - (right.distance ?? 0) || left.trip.id.localeCompare(right.trip.id);
  }).map(({ trip }) => trip);
}
