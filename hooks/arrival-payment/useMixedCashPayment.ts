import { useEffect, useRef, useState } from 'react';
import { usePayTokensCashMutation } from '@/store/api/bookingApi';
import { useBookingPaymentOptionsQuery } from '@/store/api/driverFinanceApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { roundMoney } from '@/features/arrival-payment/paymentModel';
import { serializeMixedCashReceipt } from '@/features/arrival-payment/mixedCashReceipt';
import type { useArrivalPaymentState } from './useArrivalPaymentState';
import type { useArrivalPaymentCompletion } from './useArrivalPaymentCompletion';

type Intent = { bookingId: string; expectedAmount: number; expectedTokenAmount: number; tokenQuantity: number; currency: string };
function readIntent(raw: string | undefined, bookingId: string | undefined): Intent | null {
  try {
    const value = raw ? JSON.parse(raw) as Intent : null;
    return value && value.bookingId === bookingId && value.currency === 'CDF' &&
      [value.expectedAmount, value.expectedTokenAmount, value.tokenQuantity].every(n => Number.isFinite(n) && n > 0) &&
      value.expectedTokenAmount < value.expectedAmount ? value : null;
  } catch { return null; }
}
type State = ReturnType<typeof useArrivalPaymentState>;
const UNCERTAIN = 'Confirmation du paiement jetons + espèces indisponible. Ne payez pas le montant total. Reprenez la vérification pour retrouver le même règlement.';

/** No provider polling or automatic collection: every write follows an explicit tap. */
export function useMixedCashPayment(state: State, completion: ReturnType<typeof useArrivalPaymentCompletion>) {
  const [pay, { isLoading }] = usePayTokensCashMutation();
  const [choice, setChoice] = useState<{ id: string; cash: boolean } | null>(null);
  const [message, setMessage] = useState(UNCERTAIN);
  const busy = useRef(false);
  const bookingId = state.arrivalBooking?.id;
  const latestId = useRef(bookingId);
  latestId.current = bookingId;
  const stored = state.activeStoredState?.mixedCashIntent;
  const confirmed = Boolean(state.arrivalBooking?.mixedPaymentAt);
  const { currentData: options } = useBookingPaymentOptionsQuery(bookingId ?? '', {
    skip: !bookingId || state.paymentAlreadySucceeded || confirmed, refetchOnMountOrArgChange: true,
  });
  const supported = Boolean(options?.mixedCashSupported && !state.isBeforeArrival && state.pointsUsed > 0 && state.missingPoints > 0);
  const cashSelected = Boolean(stored || (supported && choice?.id === bookingId && choice?.cash));
  const savedIntent = readIntent(stored, bookingId);
  const displayedPoints = savedIntent?.tokenQuantity ?? state.pointsUsed;
  const displayedTokenAmount = savedIntent?.expectedTokenAmount ?? state.amountCoveredByPoints;
  const cashRemainder = roundMoney(Math.max(0, (savedIntent?.expectedAmount ?? state.paymentAmount ?? 0) - displayedTokenAmount));
  const persist = state.persistBookingState;
  useEffect(() => {
    if (bookingId && confirmed && stored) persist(bookingId, { mixedCashIntent: null });
  }, [bookingId, confirmed, stored, persist]);

  const submit = async () => {
    if (busy.current || !bookingId || !state.isSessionCurrent() || state.hasPendingProviderPayment || state.isBusy) return;
    if (!stored && (!supported || state.isWalletFetching || !cashSelected)) return;
    let intent: Intent;
    try {
      if (stored && !savedIntent) throw new Error('invalid');
      intent = savedIntent ?? {
        bookingId, expectedAmount: state.paymentAmount!, expectedTokenAmount: state.amountCoveredByPoints,
        tokenQuantity: state.pointsUsed, currency: state.paymentCurrency,
      };
      if (intent.bookingId !== bookingId || intent.currency !== 'CDF' ||
          !Number.isFinite(intent.expectedAmount) || intent.expectedAmount <= 0 ||
          !Number.isFinite(intent.tokenQuantity) || intent.tokenQuantity <= 0) throw new Error('invalid');
    } catch {
      setMessage('Le règlement sauvegardé doit être vérifié. Fermez cette fenêtre et actualisez vos trajets.');
      return;
    }
    busy.current = true;
    state.setPaymentError('');
    setMessage(UNCERTAIN);
    persist(bookingId, { mixedCashIntent: JSON.stringify(intent) });
    try {
      const booking = await pay(intent).unwrap();
      if (booking.id !== bookingId || !booking.mixedPaymentAt || booking.paymentMode !== 'cash' ||
          Number(booking.mixedTokenQuantity) !== intent.tokenQuantity ||
          Number(booking.mixedTokenAmount) !== intent.expectedTokenAmount ||
          roundMoney(Number(booking.paymentAmount) + Number(booking.mixedTokenAmount)) !== intent.expectedAmount)
        throw new Error('Unconfirmed mixed payment response');
      persist(bookingId, { mixedCashIntent: null, mixedCashReceipt: serializeMixedCashReceipt(booking) });
      if (state.isSessionCurrent() && latestId.current === bookingId)
        await completion.showCompletionSummary(booking, { mode: 'cash' });
    } catch (failure) {
      const status = (failure as { status?: unknown })?.status;
      // Definitive business rejection: no debit was committed. Timeouts/5xx keep
      // the original amounts pinned; retry is idempotent on the server booking.
      const rejected = typeof status === 'number' && [400, 409, 422].includes(status);
      if (rejected) persist(bookingId, { mixedCashIntent: null });
      if (state.isSessionCurrent() && latestId.current === bookingId) {
        if (rejected) {
          state.setPaymentError(getApiErrorMessage(failure, 'Le règlement mixte n’a pas été enregistré. Actualisez puis réessayez.'));
          void state.refetchWallet();
          void state.refetchBookings();
        } else setMessage(UNCERTAIN);
      }
    } finally { busy.current = false; }
  };
  return { supported, cashSelected, cashRemainder, displayedPoints, displayedTokenAmount, submit, isLoading,
    pending: Boolean(stored && !confirmed), message,
    selectCash: (cash: boolean) => {
      if (bookingId && !busy.current && !stored && !state.hasPendingProviderPayment && !state.isBusy)
        setChoice({ id: bookingId, cash });
    },
  };
}
