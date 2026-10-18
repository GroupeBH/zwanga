import type { Booking } from '@/types';
import type { PassengerInterruptionFarePreview } from '@/types/interruptions';

export const MINIMUM_INTERRUPTION_FARE_CDF = 1500;

export function getInterruptionFareBase(booking: Pick<Booking, 'paymentAmount'>) {
  const raw = booking.paymentAmount;
  const value = raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim()) ? NaN : Number(raw);
  const initialAmount = Number.isFinite(value) && value >= 0 ? value : null;
  return {
    initialAmount,
    minimumAmount: initialAmount === null ? null : Math.min(MINIMUM_INTERRUPTION_FARE_CDF, initialAmount),
  };
}

export function isValidPassengerFarePreview(
  quote: PassengerInterruptionFarePreview | undefined, bookingId: string,
): quote is PassengerInterruptionFarePreview {
  return !!quote && quote.bookingId === bookingId && quote.currency === 'CDF' && quote.isEstimate === true &&
    [quote.passengerAmount, quote.originalPassengerAmount, quote.minimumAmount, quote.prepaidAmount,
      quote.plannedDistanceMeters, quote.travelledDistanceMeters, quote.travelledPercentage].every(Number.isFinite) &&
    quote.passengerAmount >= 0 && quote.passengerAmount <= quote.originalPassengerAmount &&
    quote.minimumAmount === Math.min(MINIMUM_INTERRUPTION_FARE_CDF, quote.originalPassengerAmount) &&
    quote.passengerAmount >= quote.minimumAmount && quote.prepaidAmount >= 0 && quote.prepaidAmount <= quote.originalPassengerAmount &&
    quote.plannedDistanceMeters > 0 && quote.travelledDistanceMeters >= 0 &&
    quote.travelledDistanceMeters <= quote.plannedDistanceMeters &&
    quote.travelledPercentage >= 0 && quote.travelledPercentage <= 100;
}
