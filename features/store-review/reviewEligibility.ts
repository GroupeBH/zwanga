import type { Booking, Trip } from '@/types';

export type ReviewRole = 'passenger' | 'driver';
export type ReviewCompletion = { role: ReviewRole; tripId: string; completedAt: number };

const timestamp = (value?: string | null) => value ? Date.parse(value) : NaN;
const isInterrupted = (request?: { status: string } | null) =>
  Boolean(request && !['cancelled', 'rejected'].includes(request.status));

/** Completion is a business fact, never inferred from a rating or a dismissed payment dialog. */
export function isSuccessfulBooking(booking: Booking): boolean {
  if (booking.status !== 'completed' || !booking.pickedUp || !booking.droppedOff
    || !Number.isFinite(timestamp(booking.droppedOffAt)) || booking.interruptionFareLocked
    || isInterrupted(booking.interruptionRequest) || isInterrupted(booking.tripInterruptionRequest)) return false;
  const amount = booking.paymentAmount;
  // Cash 'not_required' only means no platform collection. It is NOT proof of payment.
  const free = amount !== null && amount !== undefined && String(amount).trim() !== ''
    && Number(amount) === 0 && booking.paymentStatus === 'not_required';
  const paid = ['electronic', 'points'].includes(booking.paymentMode ?? '')
    && booking.paymentStatus === 'succeeded';
  const cashReceived = booking.paymentMode === 'cash' && booking.paymentStatus === 'not_required'
    && Number.isFinite(timestamp(booking.cashReceivedAt)) && Boolean(booking.cashReceivedByDriverId)
    && Number(booking.cashReceivedAmount) > 0 && Number(booking.cashReceivedAmount) === Number(amount);
  return free || paid || cashReceived;
}

export function passengerReviewCompletion(booking: Booking, userId: string): ReviewCompletion | null {
  if (booking.passengerId !== userId || !isSuccessfulBooking(booking)) return null;
  return { role: 'passenger', tripId: booking.tripId, completedAt: timestamp(booking.droppedOffAt) };
}

export function driverReviewCompletion(trip: Trip, bookings: Booking[]): ReviewCompletion | null {
  if (trip.status !== 'completed' || !Number.isFinite(timestamp(trip.completedAt))
    || isInterrupted(trip.interruptionRequest)) return null;
  const passengers = bookings.filter(booking =>
    !(['cancelled', 'rejected', 'expired'].includes(booking.status) && !booking.pickedUp));
  if (!passengers.length || passengers.some(booking => booking.tripId !== trip.id || !isSuccessfulBooking(booking))) return null;
  return { role: 'driver', tripId: trip.id, completedAt: timestamp(trip.completedAt) };
}
