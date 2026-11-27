import type { Booking, Trip } from '@/types';

export type PassengerRideStage = 'waiting' | 'pickup' | 'dropoff';
export type PassengerRideNotice = { bookingId: string; tripId: string; stage: 'pickup' | 'dropoff'; title: string; message: string };

/** Server facts only: GPS proximity and a locally queued declaration are not confirmations. */
export function passengerRideStage(booking: Booking): PassengerRideStage {
  if (booking.droppedOff || booking.droppedOffAt) return 'dropoff';
  if (booking.pickedUp || booking.pickedUpAt) return 'pickup';
  return 'waiting';
}

export function passengerNavigationStatus(booking?: Booking, trip?: Trip) {
  if (!booking || !trip) return 'loading';
  if (trip.status === 'completed' || booking.status === 'completed' || passengerRideStage(booking) === 'dropoff') return 'completed';
  if (booking.droppedOffConfirmedByPassenger) return 'awaiting_dropoff_confirmation';
  if (passengerRideStage(booking) === 'pickup') return 'in_transit';
  if (trip.status !== 'ongoing') return 'not_started';
  return 'waiting_pickup';
}

export function isPassengerRideMonitored(booking: Booking, userId: string) {
  return booking.passengerId === userId && booking.status === 'accepted' &&
    passengerRideStage(booking) !== 'dropoff' && booking.trip?.status !== 'cancelled' && booking.trip?.status !== 'completed' &&
    (booking.trip?.status === 'ongoing' || passengerRideStage(booking) === 'pickup' ||
      (booking.trip?.status === 'upcoming' && !!booking.trip.tripRequestId && !booking.trip.isExpired));
}

export function passengerProgressNotice(booking: Booking): PassengerRideNotice | null {
  const stage = passengerRideStage(booking);
  if (stage === 'waiting') return null;
  const byDriver = (stage === 'pickup' ? booking.pickupDetectionMethod : booking.dropoffDetectionMethod) === 'manual_driver_confirmation';
  return { bookingId: booking.id, tripId: booking.tripId, stage,
    title: stage === 'pickup' ? 'Embarquement confirmé' : 'Arrivée confirmée',
    message: stage === 'pickup'
      ? `${byDriver ? 'Le conducteur a confirmé votre embarquement. ' : ''}Vous êtes en route vers votre destination.`
      : `${byDriver ? 'Le conducteur a confirmé votre dépose. ' : ''}Vous êtes arrivé à destination.` };
}

/** Shared by all passenger screens for this session; a refresh cannot replay or reverse a stage. */
export function createPassengerProgressTracker(userId: string) {
  const states = new Map<string, { tripId: string; rank: number; updatedAt: number }>();
  const rank = (booking: Booking) => ({ waiting: 0, pickup: 1, dropoff: 2 })[passengerRideStage(booking)];
  return {
    observe(booking: Booking): PassengerRideNotice | null {
      if (booking.passengerId !== userId || ['cancelled', 'rejected', 'no_show'].includes(booking.status)) return null;
      const previous = states.get(booking.id);
      if (!previous && booking.status !== 'accepted') return null;
      const next = { tripId: booking.tripId, rank: rank(booking), updatedAt: Date.parse(booking.updatedAt) || 0 };
      if (previous && (previous.tripId !== next.tripId || previous.updatedAt > next.updatedAt || previous.rank > next.rank)) return null;
      states.set(booking.id, next);
      while (states.size > 64) states.delete(states.keys().next().value!);
      // A history loaded at login is not a new action. Only observed transitions notify.
      return previous && next.rank > previous.rank ? passengerProgressNotice(booking) : null;
    },
  };
}
