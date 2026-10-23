import { useRef, useState } from 'react';
import { useSwitchTokenPaymentToCashMutation } from '@/store/api/bookingApi';
import { isTokenCashFallback, tokenCashFallbackReceipt } from '@/features/arrival-payment/tokenCashFallback';
import type { useArrivalPaymentState } from './useArrivalPaymentState';
import type { useArrivalPaymentCompletion } from './useArrivalPaymentCompletion';

export function useTokenCashFallback(state: ReturnType<typeof useArrivalPaymentState>,
  completion: ReturnType<typeof useArrivalPaymentCompletion>) {
  const [switchToCash] = useSwitchTokenPaymentToCashMutation();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null);
  const busy = useRef(false), latest = useRef(state.arrivalBooking?.id);
  latest.current = state.arrivalBooking?.id;
  const stored = state.activeStoredState;
  const canSwitch = Boolean(state.arrivalBooking && !state.isBeforeArrival &&
    !state.paymentAlreadySucceeded &&
    !state.arrivalBooking.mixedPaymentAt && !state.arrivalBooking.tokenCashFallbackAt &&
    !stored?.bookingPaymentOrderNumber && !stored?.mixedCashIntent &&
    (stored?.walletTopUpIntent || stored?.walletTopUpOrderNumber));
  const run = async () => {
    const id = state.arrivalBooking?.id;
    if (!id || !canSwitch || busy.current || state.isMutatingPayment || state.isStorageLoading ||
        state.storageError || !state.isSessionCurrent()) return;
    busy.current = true; setWorkingId(id); setNotice(null);
    const current = () => state.isSessionCurrent() && latest.current === id;
    try {
      const result = await switchToCash(id).unwrap();
      if (result.id !== id || !isTokenCashFallback(result)) throw new Error('Unconfirmed cash choice');
      // A late result is recorded for the ORIGINAL account, never a new one.
      // Retain provider references: the top-up remains reconcilable, not cancelled.
      await state.persistBookingState(id, { tokenCashFallbackReceipt: tokenCashFallbackReceipt(result) });
      if (current()) await completion.showCompletionSummary(result, { mode: 'cash' });
    } catch (error) {
      if (current()) {
        const status = (error as { status?: number })?.status;
        setNotice({ id, text: status === 409
          ? 'Le paiement a changé. Vérifiez son état avant de remettre les espèces.'
          : status === 404 ? 'Le passage aux espèces n’est pas encore disponible sur le serveur. Réessayez plus tard ou contactez l’aide.'
          : 'Le passage aux espèces n’est pas confirmé. Réessayez avant de remettre l’argent au conducteur.' });
        void Promise.resolve().then(() => state.refetchBookings()).catch(() => undefined);
      }
    } finally { busy.current = false; if (state.isSessionCurrent()) setWorkingId(null); }
  };
  return { run, canSwitch, isWorking: Boolean(workingId && workingId === state.arrivalBooking?.id),
    message: notice?.id === state.arrivalBooking?.id ? notice?.text : undefined };
}
