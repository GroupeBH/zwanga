import { AppState } from 'react-native';
import { getBookingSnapshot, getTripSnapshot } from './passengerTrackingReads';
import { getActiveTrackingSession } from './passengerTaskLifecycle';
import type { PassengerTrackingSession } from './passengerTrackingTypes';
import { getTokenSessionVersion } from '../tokenSession';
import { getAccessToken } from '../tokenStorage';
import { getUserIdFromToken } from '@/utils/jwt';
import { boundedRideAudio } from '../rideAudioDiagnostics';
import { announceBackgroundApproach } from '../foregroundRideAnnouncement';
import { passengerApproachState } from '../passengerApproachSession';
import { observePassengerApproach, passengerApproachContext, passengerApproachMessage } from '@/features/notifications/passengerApproach';

let flight = false;
let last: { bookingId: string; version: number; at: number } | undefined;

/** Best effort on GPS wakeups only. No timer, new GPS lease, socket or push.
 * The OS can delay wakeups; never synthesize distance from the passenger's GPS. */
export async function checkBackgroundPassengerApproach(tracking: PassengerTrackingSession) {
  const version = getTokenSessionVersion(), started = Date.now();
  const current = () => version === getTokenSessionVersion() && AppState.currentState === 'background' && Date.now() - started < 12000;
  if (!current() || flight || (last?.bookingId === tracking.bookingId && last.version === version && started - last.at < 5000)) return;
  flight = true; last = { bookingId: tracking.bookingId, version, at: started };
  try {
    const token = await boundedRideAudio(getAccessToken(), 1500);
    const userId = token && getUserIdFromToken(token);
    if (!userId || !current()) return;
    // Authentication refresh is owned by GPS delivery, not duplicated by optional speech.
    const bookingResult = await getBookingSnapshot(tracking.bookingId, 3000, false);
    if (!current() || bookingResult.error || !bookingResult.data) return;
    const booking = bookingResult.data;
    if (booking.passengerId !== userId || booking.status !== 'accepted' || booking.pickedUp ||
        booking.pickedUpAt || booking.pickedUpConfirmedByPassenger || booking.pickedUpConfirmedAt ||
        booking.droppedOff || booking.droppedOffAt || booking.droppedOffConfirmedByPassenger || booking.droppedOffConfirmedAt) return;
    const tripId = booking.tripId;
    if (!tripId || (tracking.tripId && tracking.tripId !== tripId)) return;
    const tripResult = await getTripSnapshot(tripId, 3000, false);
    if (!current() || tripResult.error || !tripResult.data) return;
    const active = await boundedRideAudio(getActiveTrackingSession(), 1500);
    if (!current() || active?.bookingId !== tracking.bookingId || (active.tripId && active.tripId !== tripId)) return;
    const trip = tripResult.data, context = passengerApproachContext(userId, trip, booking);
    if (!context) return;
    const state = passengerApproachState(context.key);
    if (trip.currentLocation?.coordinates) observePassengerApproach(state, context.pickup, {
      coordinates: trip.currentLocation.coordinates as [number, number], updatedAt: trip.lastLocationUpdateAt,
    }, Date.now());
    const message = passengerApproachMessage(state, context.key, trip, Date.now());
    if (message) await announceBackgroundApproach(userId, message, () => current() && !state.closed);
  } catch { /* Optional speech must never fail GPS delivery or replay a stale position. */ }
  finally { flight = false; }
}
