import type { LocationObject } from 'expo-location';
import type { Booking, Trip } from '@/types';
import type { Waypoint } from './navigationModel';
import { passengerPanelApproach } from './driverPassengerPanelVisibility';

export function driverPaymentReminder(trip: Trip | undefined, driverId: string | undefined,
  bookings: Booking[] | undefined, stop: Waypoint | undefined, fix: LocationObject | null, now = Date.now()) {
  if (!driverId || trip?.driverId !== driverId || trip.status !== 'ongoing') return null;
  const arrived = bookings?.find(row => row.tripId === trip.id && row.status === 'completed' && row.droppedOff &&
    ['electronic', 'points'].includes(row.paymentMode ?? '') && row.paymentStatus !== 'succeeded' && Number(row.paymentAmount) > 0 && !row.interruptionFareLocked);
  if (arrived) return arrived;
  const booking = bookings?.find(row => row.id === stop?.booking?.id && row.tripId === trip.id);
  if (!booking || !['electronic', 'points'].includes(booking.paymentMode ?? '') ||
    booking.paymentStatus === 'succeeded' || !(Number(booking.paymentAmount) > 0) || booking.interruptionFareLocked) return null;
  const approach = passengerPanelApproach(trip.id, stop ? { ...stop, booking } : undefined, fix, now);
  return approach?.near ? booking : null;
}

export function requestCashToCollect(trip: Trip | undefined, driverId: string | undefined, bookings: Booking[] | undefined) {
  if (!driverId || trip?.driverId !== driverId || !trip.tripRequestId || trip.status !== 'ongoing') return null;
  return bookings?.find(booking => booking.tripId === trip.id && booking.status === 'completed' && booking.droppedOff &&
    booking.paymentMode === 'cash' && Number(booking.paymentAmount) > 0 && !booking.cashReceivedAt) ?? null;
}
