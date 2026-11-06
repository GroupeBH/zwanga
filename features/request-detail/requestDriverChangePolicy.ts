import type { Booking, Trip, TripRequest } from '@/types';

/** UI only; the server rechecks boarding, financial records and selection under locks. */
export function canChangeRequestDriver(request: TripRequest | undefined, userId: string | undefined, booking?: Booking) {
  if (!request || !userId || request.passengerId !== userId || request.status !== 'driver_selected' ||
      !request.selectedDriverId || !request.selectedAt) return false;
  if (!booking) return true;
  return booking.passengerId === userId && booking.tripId === request.tripId &&
    ['pending', 'accepted'].includes(booking.status) && !booking.pickedUp && !booking.pickedUpAt &&
    !booking.pickedUpConfirmedByPassenger && !booking.pickedUpConfirmedAt && !booking.droppedOff &&
    !booking.droppedOffAt && !booking.droppedOffConfirmedByPassenger && !booking.paidAt &&
    !booking.paymentTransactionId && !booking.paymentReference && !booking.cashReceivedAt &&
    !Number(booking.cashReceivedAmount) && !booking.mixedPaymentAt && !Number(booking.mixedTokenQuantity) && !Number(booking.mixedTokenAmount) &&
    !['initiated', 'succeeded'].includes(booking.paymentStatus ?? '');
}

export function canWithdrawRequestDriver(request: TripRequest | undefined, userId: string | undefined,
  trip?: Trip, bookings?: Booking[]) {
  if (!request || !userId || request.selectedDriverId !== userId || request.passengerId === userId ||
      !canChangeRequestDriver(request, request.passengerId)) return false;
  if (!request.tripId) return true;
  if (!trip || trip.id !== request.tripId || trip.driverId !== userId ||
      !['upcoming', 'ongoing'].includes(trip.status) || !bookings) return false;
  const own = bookings.filter(booking => booking.tripId === trip.id && booking.passengerId === request.passengerId &&
    !['cancelled', 'rejected', 'expired'].includes(booking.status));
  return own.length > 0 && own.every(booking => canChangeRequestDriver(request, request.passengerId, booking));
}

export function mapDriverSelectionPayload(request: TripRequest, markerId: string) {
  if (!['pending', 'offers_received'].includes(request.status) || request.selectedDriverId || request.tripId ||
      request.targetDriverPriorityUntil || !/^[a-f0-9]{64}$/.test(markerId) || !Number.isFinite(Date.parse(request.updatedAt))) return null;
  return { id: request.id, markerId, expectedUpdatedAt: request.updatedAt };
}
