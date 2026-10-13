import type { Booking } from '@/types';

export type BookingFareBreakdown = {
  grossAmount: number;
  subsidyAmount: number;
  passengerAmount: number;
};

function moneyCents(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(cents) ? cents : null;
}

/** Presentation only. Never infer a promotion or recalculate what the server charges. */
export function getBookingFareBreakdown(
  booking: Pick<Booking, 'paymentAmount' | 'grossPaymentAmount' | 'firstTripSubsidyApplied' | 'zwangaSubsidyAmount'> | null,
  passengerAmount = booking?.paymentAmount,
): BookingFareBreakdown | null {
  if (booking?.firstTripSubsidyApplied !== true) return null;
  const gross = moneyCents(booking.grossPaymentAmount);
  const subsidy = moneyCents(booking.zwangaSubsidyAmount);
  const passenger = moneyCents(passengerAmount);
  // Missing/stale fields must never invent a discount or disguise an adjusted fare.
  if (gross === null || subsidy === null || passenger === null || subsidy <= 0 ||
    gross !== passenger + subsidy) return null;
  return { grossAmount: gross / 100, subsidyAmount: subsidy / 100, passengerAmount: passenger / 100 };
}
