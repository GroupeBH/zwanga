import type { Trip } from '@/types';
import { getTripLocationCoordinate } from './tripCoordinates';

export function isApproximateArrival(trip?: Trip | null) {
  return !trip?.arrivalEstimateSource || trip.arrivalEstimateSource === 'approximate';
}

/** Pure display estimate, never used for pricing, payment or arrival detection. */
export function getTripArrivalPreview(trip?: Trip | null): Date | null {
  if (!trip) return null;
  const departure = Date.parse(trip.status !== 'upcoming' && trip.startedAt ? trip.startedAt : trip.departureTime);
  if (!Number.isFinite(departure)) return null;
  const arrival = Date.parse(trip.arrivalTime);
  if (Number.isFinite(arrival) && arrival > departure) return new Date(arrival);
  const seconds = trip.estimatedDurationSeconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
    return new Date(departure + seconds * 1000);
  }
  if (trip.arrivalEstimateSource === 'unavailable') return null;
  // Compatibility with older servers: a local, explicitly approximate preview only.
  const origin = getTripLocationCoordinate(trip.departure), destination = getTripLocationCoordinate(trip.arrival);
  if (!origin || !destination) return null;
  const rad = Math.PI / 180;
  const lat = (destination.latitude - origin.latitude) * rad, lng = (destination.longitude - origin.longitude) * rad;
  const a = Math.sin(lat / 2) ** 2 + Math.cos(origin.latitude * rad) * Math.cos(destination.latitude * rad) * Math.sin(lng / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
  const duration = Math.max(60, Math.round(km * 1.3 / 30 * 3600));
  return new Date(departure + duration * 1000);
}
