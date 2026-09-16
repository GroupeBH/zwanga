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
    if (booking.tripId !== trip.id || !['accepted', 'boarding_uncertain'].includes(booking.status) ||
        booking.droppedOff || booking.droppedOffConfirmedByPassenger || booking.droppedOffAt || booking.droppedOffConfirmedAt || !booking.passengerId) continue;
    const passenger = trip.passengers?.find(person => person.id === booking.passengerId &&
      (!person.bookingId || person.bookingId === booking.id));
    if (!contacts.has(booking.passengerId)) contacts.set(booking.passengerId, {
      id: booking.passengerId,
      name: booking.passengerName || passenger?.name || 'Passager',
      phone: usablePhone(booking.passengerPhone) ?? usablePhone(passenger?.phone),
      detail: booking.pickedUp || booking.pickedUpConfirmedByPassenger || booking.pickedUpAt || booking.pickedUpConfirmedAt ? 'À bord' : 'À prendre en charge',
    });
  }
  return [...contacts.values()];
}
