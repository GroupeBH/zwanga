import { createBookingCardPaymentRedirectUrls } from '../../features/arrival-payment/paymentModel';
import {
  PaymentChannel,
  StoredBookingPaymentState,
  PaymentCompletionSummary,
} from '../../features/arrival-payment/paymentTypes';
import React, { useCallback, useEffect, useRef } from 'react';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { Booking } from '@/types';
import type { Router } from 'expo-router';

interface Params {
  completionSummary: PaymentCompletionSummary | null;
  acknowledgeBooking: (bookingId: string, beforeArrival?: boolean, cashReceivedAt?: string) => void;
  setCompletionSummary: React.Dispatch<React.SetStateAction<PaymentCompletionSummary | null>>;
  router: Router;
  setIsClosingForNavigation: React.Dispatch<React.SetStateAction<boolean>>;
  isSessionCurrent: () => boolean;
  arrivalBooking: Booking | null;
  activeStoredState: StoredBookingPaymentState | undefined;
  isBusy: boolean;
  setPaymentError: React.Dispatch<React.SetStateAction<string>>;
  openCardPaymentUrl: (paymentUrl: string, orderNumber: string | null, returnUrl: string, channel: PaymentChannel) => Promise<boolean>;
}

export function useArrivalPaymentNavigation({
  completionSummary,
  acknowledgeBooking,
  setCompletionSummary,
  router,
  setIsClosingForNavigation,
  isSessionCurrent,
  arrivalBooking,
  activeStoredState,
  isBusy,
  setPaymentError,
  openCardPaymentUrl,
}: Params) {
  const pendingNavigation = useRef<{ kind: 'invoice'; id: string | null } | { kind: 'rating'; id: string } | null>(null);
  useEffect(() => () => { pendingNavigation.current = null; }, []);
  const handleDismissSummary = useCallback(() => {
    if (!completionSummary || pendingNavigation.current || !isSessionCurrent()) return;
    acknowledgeBooking(completionSummary.bookingId, completionSummary.beforeArrival, completionSummary.cashReceivedAt);
    setCompletionSummary(null);
  }, [acknowledgeBooking, completionSummary, isSessionCurrent, setCompletionSummary]);

  const navigateToInvoice = useCallback(
    (paymentHistoryId?: string | null) => {
      router.push(
        paymentHistoryId
          ? ({
              pathname: '/payment-history',
              params: { paymentId: paymentHistoryId },
            } as any)
          : ('/payment-history' as any),
      );
    },
    [router],
  );

  const handleModalDismiss = useCallback(() => {
    const target = pendingNavigation.current;
    if (!target) return;
    pendingNavigation.current = null;
    // The in-app sheet is already removed; no native presentation or animation to await.
    try {
      if (!isSessionCurrent()) return;
      if (target.kind === 'rating') router.push({ pathname: '/rate/[id]', params: { id: target.id } });
      else navigateToInvoice(target.id);
    } finally { setIsClosingForNavigation(false); }
  }, [isSessionCurrent, navigateToInvoice, router, setIsClosingForNavigation]);

  const handleOpenInvoice = useCallback(() => {
    if (!completionSummary || pendingNavigation.current || !isSessionCurrent()) return;
    const paymentHistoryId = completionSummary.paymentHistoryId;

    pendingNavigation.current = { kind: 'invoice', id: paymentHistoryId ?? null };
    setIsClosingForNavigation(true);

    acknowledgeBooking(completionSummary.bookingId, completionSummary.beforeArrival, completionSummary.cashReceivedAt);
    setCompletionSummary(null);

  }, [acknowledgeBooking, completionSummary, isSessionCurrent, setCompletionSummary, setIsClosingForNavigation]);

  const handleRateDriver = useCallback(() => {
    if (!completionSummary?.ratingTripId || completionSummary.beforeArrival || pendingNavigation.current || !isSessionCurrent()) return;
    pendingNavigation.current = { kind: 'rating', id: completionSummary.ratingTripId };
    setIsClosingForNavigation(true);
    acknowledgeBooking(completionSummary.bookingId, false, completionSummary.cashReceivedAt);
    setCompletionSummary(null);
  }, [acknowledgeBooking, completionSummary, isSessionCurrent, setCompletionSummary, setIsClosingForNavigation]);

  const handleResumeCardPayment = useCallback(async () => {
    if (
      !arrivalBooking ||
      !activeStoredState?.bookingPaymentUrl ||
      !activeStoredState.bookingPaymentOrderNumber ||
      isBusy
    ) {
      return;
    }

    setPaymentError('');
    const redirectUrls = createBookingCardPaymentRedirectUrls(arrivalBooking.id);
    try {
      await openCardPaymentUrl(activeStoredState.bookingPaymentUrl, activeStoredState.bookingPaymentOrderNumber,
        redirectUrls.returnUrl, activeStoredState.bookingPaymentChannel ?? 'card');
    } catch (error) {
      setPaymentError(getApiErrorMessage(error, 'La page de paiement ne peut pas être ouverte. Réessayez dans un instant.'));
    }
  }, [
    activeStoredState?.bookingPaymentChannel,
    activeStoredState?.bookingPaymentOrderNumber,
    activeStoredState?.bookingPaymentUrl,
    arrivalBooking,
    isBusy,
    setPaymentError,
    openCardPaymentUrl,
  ]);

  return {
    handleModalDismiss,
    handleDismissSummary,
    handleOpenInvoice,
    handleRateDriver,
    handleResumeCardPayment,
  };
}
