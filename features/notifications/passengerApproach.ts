import type { Booking, Trip } from '@/types';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { calculateDistanceMeters } from '@/utils/navigation/routeProgress';
import { pickupVehicleReminder } from '@/features/navigation/pickupAwareness';

export const APPROACH_FIX_MAX_AGE_MS = 15000;
type Coordinate = { latitude: number; longitude: number };
export type ApproachFix = { coordinates: [number, number] | null; updatedAt?: string | null; accuracy?: number | null };
export type ApproachState = {
  closed?: boolean;
  fix?: { coordinate: Coordinate; time: number; distance: number; accuracy?: number };
  candidate?: { band: number; since: number };
  band?: number;
};

/** The rendezvous belongs to this reservation, not the phone's moving position. */
export function passengerApproachContext(userId?: string, trip?: Trip | null, booking?: Booking | null) {
  if (!userId || !trip || !booking || trip.status !== 'ongoing' || booking.status !== 'accepted' ||
    booking.passengerId !== userId || booking.tripId !== trip.id || !trip.driverId || trip.driverId === userId ||
    booking.pickedUp || booking.pickedUpConfirmedByPassenger || booking.droppedOff || booking.droppedOffConfirmedByPassenger) return null;
  const pickup = normalizeTripMapCoordinate(booking.passengerOriginCoordinates?.latitude, booking.passengerOriginCoordinates?.longitude) ??
    normalizeTripMapCoordinate(trip.departure?.lat, trip.departure?.lng);
  if (!pickup) return null;
  return { key: `approach:${userId}:${booking.id}:${trip.id}:${trip.driverId}:${pickup.latitude}:${pickup.longitude}`,
    tripId: trip.id, bookingId: booking.id, pickup };
}

/** Two distinct, fresh fixes inside a threshold; no progression from polling the same fix. */
export function observePassengerApproach(state: ApproachState, pickup: Coordinate, sample: ApproachFix, now: number) {
  const coordinate = sample.coordinates && normalizeTripMapCoordinate(sample.coordinates[1], sample.coordinates[0]);
  const time = sample.updatedAt ? Date.parse(sample.updatedAt) : NaN;
  if (state.closed || !coordinate || !Number.isFinite(time) || time > now + 5000 || now - time > APPROACH_FIX_MAX_AGE_MS ||
    (state.fix && time <= state.fix.time)) return;
  if (sample.accuracy != null && (!Number.isFinite(sample.accuracy) || sample.accuracy < 0)) return;
  const previous = state.fix;
  // Reject implausible jumps before they can announce a close vehicle.
  if (previous && time - previous.time <= APPROACH_FIX_MAX_AGE_MS &&
    calculateDistanceMeters(previous.coordinate, coordinate) > Math.max(30, (time - previous.time) / 1000 * 60)) return;
  const distance = calculateDistanceMeters(coordinate, pickup);
  state.fix = { coordinate, time, distance, accuracy: sample.accuracy ?? undefined };
  const band = [10, 50, 100].find(limit => distance <= limit && (sample.accuracy == null || sample.accuracy <= limit / 2));
  if (!band || (state.band && band >= state.band)) { state.candidate = undefined; return; }
  if (!previous || time - previous.time > APPROACH_FIX_MAX_AGE_MS || state.candidate?.band !== band) {
    state.candidate = { band, since: time }; return;
  }
  if (time - state.candidate.since >= 1000) { state.band = band; state.candidate = undefined; }
}

export function passengerApproachMessage(state: ApproachState, key: string, trip: Trip, now: number) {
  if (state.closed) return null;
  if (!state.band) return { key: `${key}:started`, text: 'Votre conducteur est en route. Attendez-le au point de rendez-vous.' };
  const fix = state.fix;
  if (!fix || now - fix.time > APPROACH_FIX_MAX_AGE_MS || fix.time > now + 5000 || fix.distance > state.band ||
    (fix.accuracy !== undefined && fix.accuracy > state.band / 2)) return null;
  return { key: `${key}:${state.band}`, text: `Votre conducteur est à moins de ${state.band} mètres environ du point de rendez-vous. ` +
    (state.band === 10 ? pickupVehicleReminder(trip) : 'Préparez-vous à le rejoindre.') };
}
