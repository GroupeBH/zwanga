import type { Booking, Trip } from '@/types';
import { isActivePassengerBooking, ownsTrip, selectOngoingParticipation } from '@/features/activity/tripParticipation';

/** Startup/auth screens own their transition; they must not cancel ride recovery. */
export function isRideResumeEntryTransition(path: string) {
  return ['', '/index', '/auth', '/auth-entry', '/splash', '/onboarding', '/background-location-disclosure'].includes(path)
    || path.startsWith('/auth/');
}

/** Do not steal a payment, chat, edit form, emergency screen or explicit notification action. */
export function canResumeRideFromPath(path: string) {
  if (path === '/request/index') return false;
  return ['/', '/(tabs)', '/trips', '/messages', '/profile', '/discover', '/bookings', '/requests', '/my-requests',
    '/search', '/notifications', '/settings', '/favorite-locations'].includes(path) ||
    /^\/(trip\/(manage\/)?|request-details\/|request\/)[^/]+$/.test(path);
}
export const isRideNavigationPath = (path: string) => /^\/(trip|booking)\/navigate\/[^/]+$/.test(path);

export function findRideToResume(userId: string, trips?: readonly Trip[], bookings?: readonly Booking[]): RideToResume | null {
  const ride = selectOngoingParticipation(userId, trips, bookings);
  if (!ride) return null;
  return ride.role === 'passenger'
    ? { role: 'passenger', tripId: ride.trip.id, bookingId: ride.bookingId }
    : { role: 'driver', tripId: ride.trip.id, bookingId: null };
}
export type RideToResume = { role: 'driver'; tripId: string; bookingId: null }
  | { role: 'passenger'; tripId: string | null; bookingId: string };

/** Cache is a candidate only. The destination must be based on a fresh authenticated read. */
export async function verifyRideToResume(candidate: RideToResume, userId: string, read: {
  trip: (id: string) => Promise<Trip>; booking: (id: string) => Promise<Booking>;
}): Promise<`/trip/navigate/${string}` | `/booking/navigate/${string}` | null> {
  if (candidate.role === 'driver') {
    const trip = await read.trip(candidate.tripId);
    return trip.id === candidate.tripId && trip.status === 'ongoing' && ownsTrip(trip, userId)
      ? `/trip/navigate/${trip.id}` : null;
  }
  if (!candidate.bookingId) return null;
  const booking = await read.booking(candidate.bookingId);
  if (booking.id !== candidate.bookingId || (candidate.tripId && booking.tripId !== candidate.tripId) ||
    !isActivePassengerBooking(booking, userId)) return null;
  // A booking can be accepted before departure. A missing/pre-start nested trip
  // must not hide a trip that has since started (including request-created trips).
  const trip = booking.trip?.status === 'ongoing' ? booking.trip : await read.trip(booking.tripId);
  return trip.id === booking.tripId && trip.status === 'ongoing' && !ownsTrip(trip, userId)
    ? `/booking/navigate/${booking.id}` : null;
}
