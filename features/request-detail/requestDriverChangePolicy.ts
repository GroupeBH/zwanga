import type { Booking, TripRequest } from '@/types';

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
    !Number(booking.cashReceivedAmount) && !booking.mixedPaymentAt && !Number(booking.mixedTokenQuantity) &&
    !['initiated', 'succeeded'].includes(booking.paymentStatus ?? '');
}

export function mapDriverSelectionPayload(request: TripRequest, markerId: string) {
  if (!['pending', 'offers_received'].includes(request.status) || request.selectedDriverId || request.tripId ||
      request.targetDriverPriorityUntil || !/^[a-f0-9]{64}$/.test(markerId) || !Number.isFinite(Date.parse(request.updatedAt))) return null;
  return { id: request.id, markerId, expectedUpdatedAt: request.updatedAt };
}
