import type { Booking, InterruptionFareQuote } from "@/types";

export function getPassengerInterruptionChoice(
  booking: Booking,
  passengerId?: string,
  includeWaiting = false,
) {
  const request =
    booking.tripInterruptionRequest ?? booking.trip?.interruptionRequest;
  if (
    !passengerId ||
    booking.passengerId !== passengerId ||
    booking.status !== "accepted" ||
    !(booking.pickedUp || booking.pickedUpConfirmedByPassenger) ||
    booking.droppedOff ||
    booking.droppedOffConfirmedByPassenger ||
    request?.status !== "confirmed"
  )
    return null;
  const confirmation = request.confirmations.find(
    (item) => item.bookingId === booking.id && item.passengerId === passengerId,
  );
  if (
    !confirmation ||
    confirmation.status !== "confirmed" ||
    confirmation.decision === "stop" ||
    (!includeWaiting && confirmation.decision === "wait")
  )
    return null;
  return {
    tripId: booking.tripId,
    bookingId: booking.id,
    requestId: request.id,
  };
}

export function isMatchingInterruptionQuote(
  quote: InterruptionFareQuote | undefined,
  bookingId: string,
  requestId: string,
) {
  return (
    !!quote &&
    quote.bookingId === bookingId &&
    quote.requestId === requestId &&
    !!quote.id &&
    quote.currency === "CDF" &&
    Number.isFinite(quote.passengerAmount) &&
    quote.passengerAmount >= 0 &&
    Number.isFinite(quote.originalPassengerAmount) &&
    quote.passengerAmount <= quote.originalPassengerAmount &&
    Number.isFinite(quote.travelledPercentage) &&
    quote.travelledPercentage >= 0 &&
    quote.travelledPercentage <= 100
  );
}
