import { useEffect, useRef } from 'react';
import { isPaymentChannel, normalizePaymentPhone, getPaymentFailureMessage, getPaymentStatusMessage } from '@/features/arrival-payment/paymentModel';
import { ARRIVAL_PAYMENT_STATUS_REFRESH_MS } from '@/features/arrival-payment/paymentPolicy';
import type { useArrivalPaymentState } from './useArrivalPaymentState';
import type { useArrivalPaymentProvider } from './useArrivalPaymentProvider';
import type { useArrivalPaymentCompletion } from './useArrivalPaymentCompletion';

type Params = { state: ReturnType<typeof useArrivalPaymentState>;
  provider: ReturnType<typeof useArrivalPaymentProvider>;
  completion: ReturnType<typeof useArrivalPaymentCompletion> };

export function useArrivalPaymentMonitoring({ state, provider, completion }: Params) {
  const latest = useRef({ state, provider, completion });
  latest.current = { state, provider, completion };
  const bookingId = state.arrivalBooking?.id;
  const walletOrder = state.activeStoredState?.walletTopUpOrderNumber;
  const bookingOrder = state.activeStoredState?.bookingPaymentOrderNumber;
  const requiredActionAt = state.activeStoredState?.requiredActionAt;
  const persistBookingState = state.persistBookingState;

  useEffect(() => {
    const current = latest.current.state;
    if (current.activeBookingIdRef.current === (bookingId ?? null)) return;
    current.activeBookingIdRef.current = bookingId ?? null;
    const channel = current.activeStoredState?.bookingPaymentChannel;
    current.setSelectedChannel(isPaymentChannel(channel) ? channel : 'mpesa');
    current.setPaymentPhone(normalizePaymentPhone(current.user?.phone));
    current.setStatusMessage('');
    current.setPaymentError('');
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId || requiredActionAt) return;
    persistBookingState(bookingId, { requiredActionAt: new Date().toISOString() });
  }, [bookingId, requiredActionAt, persistBookingState]);

  useEffect(() => {
    if (!state.isAuthenticated || !state.isAppActive || !state.isResumeReady || !bookingId || (!walletOrder && !bookingOrder)) return;
    let cancelled = false;
    let inFlight = false;
    let request: { abort?: () => void } | undefined;
    const setChecking = state.setIsCheckingPayment;
    const check = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      setChecking(true);
      try {
        const booking = latest.current.state.arrivalBooking;
        if (booking?.id === bookingId && booking.paymentStatus === 'succeeded') {
          latest.current.state.persistBookingState(bookingId, { walletTopUpOrderNumber: null,
            bookingPaymentOrderNumber: null, bookingPaymentUrl: null });
          await latest.current.completion.showCompletionSummary(booking);
          return;
        }
        if (walletOrder) {
          const pending = latest.current.state.checkWalletTopUpStatus(walletOrder);
          request = pending;
          const response = await pending.unwrap();
          if (cancelled) return;
          if (response.payment.status === 'succeeded') {
            latest.current.state.setStatusMessage('Recharge confirmée. Paiement de la course en cours…');
            const settled = await latest.current.provider.settleWithPoints(bookingId);
            if (!cancelled && settled) latest.current.state.persistBookingState(bookingId, { walletTopUpOrderNumber: null });
          } else if (response.payment.status === 'failed' || response.payment.status === 'cancelled') {
            latest.current.state.persistBookingState(bookingId, { walletTopUpOrderNumber: null });
            latest.current.state.setPaymentError(getPaymentFailureMessage(response.payment.message));
          } else latest.current.state.setStatusMessage(getPaymentStatusMessage(response.payment.message,
            'Confirmez le complément Mobile Money sur votre téléphone.'));
        } else if (bookingOrder) {
          const pending = latest.current.state.checkBookingPaymentStatus(bookingOrder);
          request = pending;
          const response = await pending.unwrap();
          if (cancelled) return;
          const finished = await latest.current.completion.handleCompletedBookingPayment(response, {
            mode: 'electronic', channel: latest.current.state.activeStoredState?.bookingPaymentChannel,
          });
          if (!cancelled && !finished) latest.current.state.setStatusMessage(getPaymentStatusMessage(response.payment.message,
            'Confirmez le paiement Mobile Money sur votre téléphone.'));
        }
      } catch {
        if (!cancelled) latest.current.state.setStatusMessage('La vérification reprendra dès que la connexion le permettra. Ne payez pas une seconde fois.');
      } finally {
        inFlight = false;
        request = undefined;
        if (!cancelled) setChecking(false);
      }
    };
    void check();
    const timer = setInterval(() => void check(), ARRIVAL_PAYMENT_STATUS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      request?.abort?.(); // Read-only status request, never abort/replay a financial mutation.
      setChecking(false); // Also unlock when iOS suspends an in-flight check.
    };
  }, [state.isAuthenticated, state.isAppActive, state.isResumeReady, bookingId, walletOrder, bookingOrder, state.setIsCheckingPayment]);
}
