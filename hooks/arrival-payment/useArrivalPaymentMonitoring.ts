import { useCallback, useEffect, useRef, useState } from 'react';
import { isPaymentChannel, normalizePaymentPhone, getPaymentFailureMessage } from '@/features/arrival-payment/paymentModel';
import { ARRIVAL_PAYMENT_CHECK_TIMEOUT_MS, ARRIVAL_PAYMENT_MONITOR_WINDOW_MS, ARRIVAL_PAYMENT_STATUS_REFRESH_MS } from '@/features/arrival-payment/paymentPolicy';
import type { useArrivalPaymentState } from './useArrivalPaymentState';
import type { useArrivalPaymentProvider } from './useArrivalPaymentProvider';
import type { useArrivalPaymentCompletion } from './useArrivalPaymentCompletion';

type Params = { state: ReturnType<typeof useArrivalPaymentState>;
  provider: ReturnType<typeof useArrivalPaymentProvider>;
  completion: ReturnType<typeof useArrivalPaymentCompletion> };
export type PaymentVerification = { phase: 'idle' | 'checking' | 'waiting' | 'paused' | 'complete'; message: string };
const IDLE: PaymentVerification = { phase: 'idle', message: '' };
const UNAVAILABLE = 'Vérification indisponible. Ne payez pas une seconde fois. Vérifiez à nouveau ou fermez cette fenêtre.';
const PENDING = 'Le paiement attend une confirmation. Ne payez pas une seconde fois. Vous pouvez fermer cette fenêtre et reprendre plus tard.';

export function useArrivalPaymentMonitoring({ state, provider, completion }: Params) {
  const latest = useRef({ state, provider, completion });
  latest.current = { state, provider, completion };
  const bookingId = state.arrivalBooking?.id;
  const walletOrder = state.activeStoredState?.walletTopUpOrderNumber;
  const bookingOrder = state.activeStoredState?.bookingPaymentOrderNumber;
  const requiredActionAt = state.activeStoredState?.requiredActionAt;
  const persistBookingState = state.persistBookingState;
  const hasBlockingOverlay = Boolean(state.completionSummary || state.interruptionChoice);
  const serverPaymentSucceeded = state.arrivalBooking?.paymentStatus === 'succeeded';
  const orderKey = JSON.stringify([bookingId, walletOrder, bookingOrder]);
  const [progress, setProgress] = useState<{ key: string; value: PaymentVerification }>({ key: '', value: IDLE });
  const pausedOrder = useRef<string | null>(null);
  const retry = useRef<() => void>(() => {});
  const retryVerification = useCallback(() => retry.current(), []);

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
    if (!state.isAuthenticated || !state.isAppActive || !state.isResumeReady || state.isPaymentDeferred ||
        hasBlockingOverlay || !bookingId || (!walletOrder && !bookingOrder)) return;
    let cancelled = false;
    let inFlight = false;
    let stopped = false;
    let deadline = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelRead: (() => void) | undefined;
    const setChecking = state.setIsCheckingPayment;
    const publish = (value: PaymentVerification) => {
      if (cancelled) return;
      setChecking(value.phase === 'checking');
      setProgress({ key: orderKey, value });
    };
    const pause = (message: string) => {
      stopped = true;
      pausedOrder.current = orderKey;
      publish({ phase: 'paused', message });
    };
    // Bound even a read waiting on token refresh. Never abort a payment mutation.
    const read = <T,>(request: { unwrap(): Promise<T>; abort?: () => void; unsubscribe?: () => void }): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Payment status read timed out'));
          request.abort?.();
        }, Math.min(ARRIVAL_PAYMENT_CHECK_TIMEOUT_MS, Math.max(1, deadline - Date.now())));
        cancelRead = () => {
          clearTimeout(timeout);
          reject(new Error('Payment status read cancelled'));
          request.abort?.();
        };
        void request.unwrap().then(resolve, reject).finally(() => clearTimeout(timeout));
      }).finally(() => { request.unsubscribe?.(); cancelRead = undefined; });

    const check = async () => {
      if (cancelled || stopped || inFlight) return;
      if (Date.now() >= deadline) { pause(PENDING); return; }
      inFlight = true;
      publish({ phase: 'checking', message: 'Vérification du paiement en cours…' });
      let finished = false;
      try {
        const booking = latest.current.state.arrivalBooking;
        if (booking?.id !== bookingId) return;
        if (booking.paymentStatus === 'succeeded') {
          latest.current.state.persistBookingState(bookingId, { walletTopUpOrderNumber: null,
            bookingPaymentOrderNumber: null, bookingPaymentUrl: null });
          await latest.current.completion.showCompletionSummary(booking);
          finished = true;
        } else if (walletOrder) {
          const response = await read(latest.current.state.checkWalletTopUpStatus(walletOrder));
          if (cancelled) return;
          if (response.payment.status === 'succeeded') {
            latest.current.state.setStatusMessage('Recharge confirmée. Paiement de la course en cours…');
            finished = await latest.current.provider.settleWithPoints(bookingId);
            if (!cancelled && finished) latest.current.state.persistBookingState(bookingId, { walletTopUpOrderNumber: null });
            // A confirmed top-up must not trigger automatic repeated settlement mutations.
            if (!cancelled && !finished) pause(PENDING);
          } else if (response.payment.status === 'failed' || response.payment.status === 'cancelled') {
            latest.current.state.setStatusMessage('');
            latest.current.state.persistBookingState(bookingId, { walletTopUpOrderNumber: null });
            latest.current.state.setPaymentError(getPaymentFailureMessage(response.payment.message));
            latest.current.state.reportPaymentFailure(bookingId);
            finished = true;
          }
        } else if (bookingOrder) {
          const response = await read(latest.current.state.checkBookingPaymentStatus(bookingOrder));
          if (cancelled) return;
          finished = await latest.current.completion.handleCompletedBookingPayment(response, {
            mode: 'electronic', channel: latest.current.state.activeStoredState?.bookingPaymentChannel,
          });
        }
        if (cancelled || stopped) return;
        if (finished) {
          stopped = true;
          publish({ phase: 'complete', message: '' });
        } else if (Date.now() >= deadline) pause(PENDING);
        else {
          publish({ phase: 'waiting', message: PENDING });
          // Delay from response completion, not a fixed interval during slow reads.
          timer = setTimeout(() => void check(), Math.min(ARRIVAL_PAYMENT_STATUS_REFRESH_MS, deadline - Date.now()));
        }
      } catch {
        if (!cancelled) {
          latest.current.state.setStatusMessage('');
          pause(UNAVAILABLE); // An unavailable status is not a failed or cancelled payment.
        }
      } finally {
        inFlight = false;
        if (!cancelled) setChecking(false);
      }
    };
    const start = () => {
      if (cancelled || inFlight) return;
      clearTimeout(timer);
      stopped = false;
      pausedOrder.current = null;
      deadline = Date.now() + ARRIVAL_PAYMENT_MONITOR_WINDOW_MS;
      latest.current.state.setStatusMessage('');
      latest.current.state.setPaymentError('');
      void check();
    };
    retry.current = start;
    if (pausedOrder.current !== orderKey || serverPaymentSucceeded) start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelRead?.();
      retry.current = () => {};
      setChecking(false);
    };
  }, [state.isAuthenticated, state.isAppActive, state.isResumeReady, state.isPaymentDeferred,
    hasBlockingOverlay, serverPaymentSucceeded, bookingId, walletOrder, bookingOrder,
    orderKey, state.setIsCheckingPayment]);

  return { verification: progress.key === orderKey ? progress.value : IDLE, retryVerification };
}
