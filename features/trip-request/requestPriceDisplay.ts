import type { Trip } from '@/types';

/** Display adapter only. The API still stores a unit price; never treat it as a total. */
export function requestTotalPrice(pricePerSeat: unknown, seats: unknown): number | null {
  const numeric = (value: unknown) => typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
  const price = numeric(pricePerSeat), count = numeric(seats);
  if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(count) || count < 1) return null;
  const total = price * count;
  return Number.isFinite(total) && total <= Number.MAX_SAFE_INTEGER ? total : null;
}

export function requestPriceLabel(pricePerSeat: unknown, seats: unknown) {
  const total = requestTotalPrice(pricePerSeat, seats);
  return total === null ? 'Prix à préciser'
    : `${String(Math.round(total)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FC`;
}

/** A private trip's vehicle capacity is not the passenger's ordered seat count.
 * Only use its single known booking; incomplete/shared snapshots need the command detail. */
export function requestTripPriceLabel(trip: Pick<Trip, 'price' | 'passengers' | 'reservationSummary'>) {
  const passengers = trip.passengers?.filter(p => p.bookingStatus === 'accepted' || p.bookingStatus === 'completed');
  if (passengers?.length !== 1 || (trip.reservationSummary && trip.reservationSummary.acceptedCount > 1)) return 'Prix dans la commande';
  return requestTotalPrice(trip.price, passengers[0].seats) === null ? 'Prix dans la commande'
    : requestPriceLabel(trip.price, passengers[0].seats);
}

/** Convert a UI total to the unchanged API contract, without rounding it up. */
export function requestUnitPriceInput(total: string, seats: number, decimals = 2): string {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(total.trim()) || !Number.isSafeInteger(seats) || seats < 1) return '';
  const value = Number(total), scale = 10 ** decimals;
  const unit = Math.round(value / seats * scale) / scale;
  return value > 0 && Math.abs(unit * seats - value) < 0.000001 ? String(unit) : '';
}

export function requestTotalInputHint(total: string, seats: number, decimals = 2) {
  if (!total || requestUnitPriceInput(total, seats, decimals)) return '';
  if (!Number.isSafeInteger(seats) || seats < 1) return 'Indiquez d’abord le nombre de passagers.';
  const value = Number(total);
  if (!Number.isFinite(value) || value <= 0) return 'Indiquez un prix total positif.';
  const step = seats / 10 ** decimals;
  const lower = Math.floor(value / step) * step, upper = lower + step;
  const label = (amount: number) => Number(amount.toFixed(2)).toLocaleString('fr-FR');
  return lower > 0 ? `Choisissez un total de ${label(lower)} FC ou ${label(upper)} FC.`
    : `Choisissez un total d’au moins ${label(upper)} FC.`;
}
