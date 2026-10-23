import { useRef, useState } from 'react';
import { useRecoverWalletTopUpMutation } from '@/store/api/walletApi';
import { acknowledgeWalletTopUpIntent } from '@/features/wallet/topUpIntent';
import type { useArrivalPaymentState } from './useArrivalPaymentState';
import type { useArrivalPaymentProvider } from './useArrivalPaymentProvider';
import type { useArrivalPaymentCompletion } from './useArrivalPaymentCompletion';

const WAIT = 'Votre opérateur n’a pas encore confirmé le résultat. Ne payez pas en espèces maintenant. Réessayez dans un moment ou contactez l’aide.';
type State = ReturnType<typeof useArrivalPaymentState>;

/** Explicit user recovery. Never forgets an uncertain attempt or initiates a new debit. */
export function useArrivalPaymentRecovery(state: State, provider: ReturnType<typeof useArrivalPaymentProvider>,
  completion: ReturnType<typeof useArrivalPaymentCompletion>) {
  const [recover] = useRecoverWalletTopUpMutation();
  const [workingId, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; message: string } | null>(null);
  const busy = useRef(false), latestId = useRef(state.arrivalBooking?.id);
  latestId.current = state.arrivalBooking?.id;
  const run = async () => {
    const id = state.arrivalBooking?.id, stored = state.activeStoredState;
    if (!id || state.arrivalBooking?.tokenCashFallbackAt || busy.current || state.isBusy || !state.isSessionCurrent() || state.storageError || stored?.mixedCashIntent) return;
    const current = () => state.isSessionCurrent() && latestId.current === id;
    busy.current = true; setWorking(id); setNotice(null);
    try {
      if (stored?.walletTopUpIntent || stored?.walletTopUpOrderNumber) {
        const request = stored.walletTopUpIntent ? recover({ intentScope: `booking:${id}` })
          : state.checkWalletTopUpStatus(stored.walletTopUpOrderNumber!);
        let response;
        try { response = await request.unwrap(); }
        finally { if ('unsubscribe' in request) request.unsubscribe(); }
        if (!current()) return;
        const status = response.payment.status;
        if (status === 'failed' || status === 'cancelled' || status === 'succeeded') {
          if (status === 'succeeded' && !await provider.settleWithPoints(id)) {
            setNotice({ id, message: 'Le paiement est reçu. Nous devons encore confirmer le règlement du trajet. Ne payez pas une seconde fois.' });
            return;
          }
          await acknowledgeWalletTopUpIntent(state.user?.id, `booking:${id}`, response);
          if (!current()) return;
          await state.persistBookingState(id, { walletTopUpIntent: null, walletTopUpOrderNumber: null });
          if (current() && status !== 'succeeded') state.reportPaymentFailure(id);
          return;
        }
        if (response.payment.orderNumber) await state.persistBookingState(id, {
          walletTopUpIntent: null, walletTopUpOrderNumber: response.payment.orderNumber,
        });
      } else if (stored?.bookingPaymentOrderNumber) {
        const request = state.checkBookingPaymentStatus(stored.bookingPaymentOrderNumber);
        let response;
        try { response = await request.unwrap(); } finally { request.unsubscribe?.(); }
        if (!current()) return;
        if (await completion.handleCompletedBookingPayment(response)) return;
      } else {
        state.setSelectedMode(null);
        return;
      }
      if (current()) setNotice({ id, message: WAIT });
    } catch {
      if (current()) setNotice({ id, message: 'Nous n’arrivons pas à joindre le service de paiement. Ne payez pas une seconde fois. Réessayez ou contactez l’aide.' });
    } finally { busy.current = false; if (state.isSessionCurrent()) setWorking(null); }
  };
  return { run, isWorking: Boolean(workingId && workingId === state.arrivalBooking?.id),
    message: notice?.id === state.arrivalBooking?.id ? notice?.message : undefined };
}
