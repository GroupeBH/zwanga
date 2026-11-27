import type { TripPaymentOptions } from '@/store/api/driverFinanceApi';

/** A published cash option or an explicit arrival-only exception from the server. */
export const canChooseCash = (options?: TripPaymentOptions) => Boolean(options &&
  (options.acceptedPaymentModes.includes('cash') || options.cashFallbackAvailable === true) &&
  options.availablePaymentModes.includes('cash'));
