import type { Booking } from '../../../types';

export const bookingListTag = { type: 'Booking' as const, id: 'LIST' };
export const tripListTag = { type: 'Trip' as const, id: 'LIST' };
export const myTripsListTag = { type: 'MyTrips' as const, id: 'LIST' };
export const walletTag = { type: 'Wallet' as const, id: 'ME' };
export const driverSettlementTag = { type: 'DriverSettlement' as const, id: 'ME' };
export const paymentHistoryTag = { type: 'PaymentHistory' as const, id: 'ME' };

export const asAcceptedBooking = (booking: Booking, acceptedAt: string): Booking => ({
  ...booking,
  status: 'accepted',
  acceptedAt: booking.acceptedAt ?? acceptedAt,
  updatedAt: booking.updatedAt ?? acceptedAt,
});

export const mergeAcceptedBooking = (
  currentBooking: Booking,
  acceptedBooking: Booking,
  acceptedAt: string,
): Booking => ({
  ...currentBooking,
  ...acceptedBooking,
  status: 'accepted',
  acceptedAt: acceptedBooking.acceptedAt ?? currentBooking.acceptedAt ?? acceptedAt,
  updatedAt: acceptedBooking.updatedAt ?? currentBooking.updatedAt ?? acceptedAt,
  trip: acceptedBooking.trip ?? currentBooking.trip,
});

export const patchAcceptedBookingInList = (
  bookings: Booking[],
  acceptedBooking: Booking,
  acceptedAt: string,
) => {
  const bookingIndex = bookings.findIndex((booking) => booking.id === acceptedBooking.id);
  if (bookingIndex === -1) return;
  bookings[bookingIndex] = mergeAcceptedBooking(bookings[bookingIndex], acceptedBooking, acceptedAt);
};
