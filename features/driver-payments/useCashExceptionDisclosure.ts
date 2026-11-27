import { useState } from 'react';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useBookingPaymentOptionsQuery } from '@/store/api/driverFinanceApi';

/** A fresh server quote and explicit consent; never a receipt or a debit. */
export function useCashExceptionDisclosure(bookingId: string, active: boolean) {
  const enabled = useDisplayReadsEnabled(active);
  const options = useBookingPaymentOptionsQuery(bookingId, displayReadOptions(enabled));
  const known = Boolean(enabled && !options.isError && !options.isFetching && options.currentData);
  const exception = known ? options.currentData?.cashException : undefined;
  const quote = exception ? `${bookingId}:${exception.occurrence}:${exception.penaltyAmount}:${exception.alreadyCountedForTrip}:${exception.message}` : null;
  const [acknowledgedQuote, setAcknowledgedQuote] = useState<string | null>(null);
  const acknowledged = quote !== null && acknowledgedQuote === quote;
  const refresh = () => {
    setAcknowledgedQuote(null);
    if (enabled) void options.refetch();
  };
  return {
    known, unavailable: options.isError || !enabled, exception, acknowledged, refresh,
    canConfirm: known && (!exception?.requiresDriverAcknowledgment || (exception.occurrence != null && acknowledged)),
    toggle: () => setAcknowledgedQuote(value => value === quote ? null : quote),
  };
}
