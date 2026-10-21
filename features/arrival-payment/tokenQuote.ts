import { ZWANGA_POINT_VALUE_CDF } from '@/constants/paymentFeatures';

const positive = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

/** Old ride quotes and today's token purchase price can legitimately differ. */
export function tokenQuote(currency: string, bookingValue?: unknown, walletValue?: unknown, walletCurrency?: string) {
  const normalized = currency.toUpperCase();
  const purchaseValue = (walletCurrency?.toUpperCase() === normalized ? positive(walletValue) : null)
    ?? (normalized === 'CDF' ? ZWANGA_POINT_VALUE_CDF : null);
  return { bookingValue: positive(bookingValue) ?? purchaseValue, purchaseValue };
}
