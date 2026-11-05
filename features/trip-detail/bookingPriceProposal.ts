import type { Booking } from '@/types';

export const bookingProposalError = (text: string, listedPrice: number, seats: number): string | null => {
  if (!text.trim()) return null;
  const amount = Number(text);
  if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(amount) || amount < 1 ||
      amount >= listedPrice || !Number.isFinite(listedPrice) || !Number.isSafeInteger(seats) ||
      seats < 1 || amount * seats > 99_999_999) {
    return 'Indiquez un prix par place en FC, supérieur à zéro et inférieur au prix affiché.';
  }
  return null;
};

export const bookingProposalPrice = (booking: Pick<Booking, 'proposedPricePerSeat'>): number | null => {
  const value = Number(booking.proposedPricePerSeat);
  return Number.isSafeInteger(value) && value > 0 && value <= 99_999_999 ? value : null;
};

export function bookingAcceptanceArgument(booking: Booking): string | { id: string; acceptedPricePerSeat: number } {
  const price = bookingProposalPrice(booking);
  return price === null ? booking.id : { id: booking.id, acceptedPricePerSeat: price };
}

export function bookingFareLabel(booking: Booking, listedPrice = 0): string {
  const proposed = bookingProposalPrice(booking);
  const pending = booking.status === 'pending' && proposed !== null;
  const gross = Number(booking.grossPaymentAmount);
  const total = pending ? proposed * booking.numberOfSeats :
    booking.grossPaymentAmount != null && Number.isFinite(gross) ? gross : listedPrice * booking.numberOfSeats;
  return `${pending ? 'Proposition : ' : ''}${total.toLocaleString('fr-FR')} FC${pending ? ' au total' : ''}`;
}

export function bookingPassengerTotal(booking: Booking, listedPrice = 0): number {
  const proposed = bookingProposalPrice(booking);
  if (booking.status === 'pending' && proposed !== null) return proposed * booking.numberOfSeats;
  const amount = Number(booking.paymentAmount);
  if (booking.paymentAmount != null && Number.isFinite(amount) && amount >= 0) {
    return amount + (booking.mixedPaymentAt ? Number(booking.mixedTokenAmount) || 0 : 0);
  }
  return listedPrice * booking.numberOfSeats;
}
