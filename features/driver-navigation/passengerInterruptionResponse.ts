import type { Booking } from '@/types';
import { isPendingTripInterruption } from '@/utils/tripInterruption';

export function canRespondToPassengerInterruption(booking: Booking): boolean {
  return booking.status === 'accepted' && !booking.droppedOff && !booking.droppedOffAt &&
    !booking.droppedOffConfirmedByPassenger && !booking.droppedOffConfirmedAt &&
    Boolean(booking.interruptionRequest?.id) && isPendingTripInterruption(booking.interruptionRequest?.status);
}

/** A server acknowledgement, never an optimistic completion or a fare calculation. */
export function isPassengerInterruptionResponse(
  response: Booking | undefined, source: Booking, decision: 'confirm' | 'reject',
): response is Booking {
  if (!response || response.id !== source.id || response.tripId !== source.tripId ||
      response.passengerId !== source.passengerId) return false;
  // The backend omits closed interruption requests from its booking response.
  const request = response.interruptionRequest;
  if (request && (request.id !== source.interruptionRequest?.id || request.bookingId !== source.id ||
      request.tripId !== source.tripId || request.passengerId !== source.passengerId)) return false;
  return decision === 'confirm'
    ? response.status === 'completed' && (!request || ['confirmed', 'completed'].includes(request.status))
    : response.status === 'accepted' && !response.droppedOff && !response.droppedOffConfirmedByPassenger &&
      (!request || request.status === 'rejected');
}
