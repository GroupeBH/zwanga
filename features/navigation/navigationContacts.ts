import type { Booking, Trip } from '@/types';

export interface NavigationContact {
  id: string;
  name: string;
  phone: string | null;
  detail: string;
}
export interface NavigationContactContext {
  role: 'driver' | 'passenger';
  trip?: Trip;
  booking?: Booking;
  bookings?: Booking[];
  userId?: string;
}

const usablePhone = (value?: string | null) => {
  const phone = value?.trim();
  const digits = phone?.replace(/\D/g, '') ?? '';
  return digits.length >= 6 && digits.length <= 15 ? phone! : null;
};

export function isNavigationParticipant({ role, trip, booking, userId }: NavigationContactContext) {
  if (!trip || !userId) return false;
  return role === 'driver' ? trip.driverId === userId :
    booking?.passengerId === userId && booking.tripId === trip.id;
}

/** A contact belongs to the reservation holder, even when they booked several seats. */
export function getDriverBookingContact(trip: Trip | undefined, booking: Booking | undefined,
  userId: string | undefined, includeFinished = false): NavigationContact | null {
  if (!trip || !booking || !userId || trip.driverId !== userId || booking.tripId !== trip.id ||
      !booking.passengerId || !['pending', 'accepted', 'boarding_uncertain'].includes(booking.status)) return null;
  if (booking.status === 'pending' && ['completed', 'cancelled'].includes(trip.status)) return null;
  const droppedOff = booking.droppedOff || booking.droppedOffConfirmedByPassenger ||
    booking.droppedOffAt || booking.droppedOffConfirmedAt;
  if (!includeFinished && droppedOff) return null;
  const passenger = trip.passengers?.find(person => person.id === booking.passengerId &&
    (!person.bookingId || person.bookingId === booking.id));
  return {
    id: booking.passengerId,
    name: booking.passengerName || passenger?.name || 'Passager',
    phone: usablePhone(booking.passengerPhone) ?? usablePhone(passenger?.phone),
    detail: booking.status === 'pending' ? 'Réservation en attente · Pas encore acceptée' :
      droppedOff || trip.status === 'completed' ? 'Trajet terminé' :
      booking.pickedUp || booking.pickedUpConfirmedByPassenger || booking.pickedUpAt || booking.pickedUpConfirmedAt
        ? 'À bord' : 'À prendre en charge',
  };
}

/** Only reuse participant details already authorized and returned by the booking API. */
export function getNavigationContacts(context: NavigationContactContext): NavigationContact[] {
  const { role, trip, bookings = [] } = context;
  if (!trip || !isNavigationParticipant(context)) return [];
  if (role === 'passenger') return [{
    id: trip.driverId,
    name: trip.driverName || [trip.driver?.firstName, trip.driver?.lastName].filter(Boolean).join(' ') || 'Votre conducteur',
    phone: usablePhone(trip.driver?.phone),
    detail: 'Votre conducteur',
  }];
  const contacts = new Map<string, NavigationContact>();
  for (const booking of bookings) {
    const person = getDriverBookingContact(trip, booking, context.userId);
    if (person && !contacts.has(person.id)) contacts.set(person.id, person);
  }
  return [...contacts.values()];
}
