import { createBookingCardPaymentRedirectUrls } from '../../features/arrival-payment/paymentModel';
import {
  PaymentChannel,
  StoredBookingPaymentState,
  PaymentCompletionSummary,
} from '../../features/arrival-payment/paymentTypes';
import React, { useCallback, useRef } from 'react';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { Booking } from '@/types';
import type { Router } from 'expo-router';

interface Params {
  isAppActive?: boolean;
  isSessionCurrent?: () => boolean;
  completionSummary: PaymentCompletionSummary | null;
  acknowledgeBooking: (bookingId: string) => void;
  setCompletionSummary: React.Dispatch<React.SetStateAction<PaymentCompletionSummary | null>>;
  router: Router;
  pendingInvoicePaymentIdRef: React.RefObject<string | null | undefined>;
  setIsClosingForInvoice: React.Dispatch<React.SetStateAction<boolean>>;
  arrivalBooking: Booking | null;
  activeStoredState: StoredBookingPaymentState | undefined;
  isBusy: boolean;
  setPaymentError: React.Dispatch<React.SetStateAction<string>>;
  openCardPaymentUrl: (paymentUrl: string, orderNumber: string | null, returnUrl: string, channel: PaymentChannel) => Promise<boolean>;
}

export function useArrivalPaymentNavigation({
  isAppActive = true,
  isSessionCurrent,
  completionSummary,
  acknowledgeBooking,
  setCompletionSummary,
  router,
  pendingInvoicePaymentIdRef,
  setIsClosingForInvoice,
  arrivalBooking,
  activeStoredState,
  isBusy,
  setPaymentError,
  openCardPaymentUrl,
}: Params) {
  const pendingRatingTripId = useRef<string | null>(null);
  const handleDismissSummary = useCallback(() => {
    if (!completionSummary) return;
    acknowledgeBooking(completionSummary.bookingId);
    setCompletionSummary(null);
  }, [acknowledgeBooking, completionSummary, setCompletionSummary]);

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
    const ratingTripId = pendingRatingTripId.current;
    if (ratingTripId) {
      pendingRatingTripId.current = null;
      try {
        if (isAppActive && (!isSessionCurrent || isSessionCurrent())) {
          router.push({ pathname: '/rate/[id]', params: { id: ratingTripId } });
        }
      } finally { setIsClosingForInvoice(false); }
      return;
    }
    const paymentHistoryId = pendingInvoicePaymentIdRef.current;
    if (paymentHistoryId === undefined) return;

    pendingInvoicePaymentIdRef.current = undefined;
    // The in-app sheet is already removed; no native presentation or animation to await.
    try { navigateToInvoice(paymentHistoryId); }
    finally { setIsClosingForInvoice(false); }
  }, [isAppActive, isSessionCurrent, router, navigateToInvoice, pendingInvoicePaymentIdRef, setIsClosingForInvoice]);

  const handleRateDriver = useCallback(() => {
    if (!completionSummary?.canRateDriver || !completionSummary.tripId || isBusy || !isAppActive ||
      (isSessionCurrent && !isSessionCurrent()) || pendingRatingTripId.current || pendingInvoicePaymentIdRef.current !== undefined) return;
    pendingRatingTripId.current = completionSummary.tripId;
    // Reuse the sheet exit barrier: navigation happens only after its removal.
    setIsClosingForInvoice(true);
    acknowledgeBooking(completionSummary.bookingId);
    setCompletionSummary(null);
  }, [acknowledgeBooking, completionSummary, isAppActive, isBusy, isSessionCurrent,
    pendingInvoicePaymentIdRef, setCompletionSummary, setIsClosingForInvoice]);

  const handleOpenInvoice = useCallback(() => {
    if (!completionSummary || pendingRatingTripId.current || pendingInvoicePaymentIdRef.current !== undefined) return;
    const paymentHistoryId = completionSummary.paymentHistoryId;

    pendingInvoicePaymentIdRef.current = paymentHistoryId ?? null;
    setIsClosingForInvoice(true);

    acknowledgeBooking(completionSummary.bookingId);
    setCompletionSummary(null);

  }, [acknowledgeBooking, completionSummary, pendingInvoicePaymentIdRef, setCompletionSummary, setIsClosingForInvoice]);

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
    handleRateDriver,
    handleModalDismiss,
    handleDismissSummary,
    handleOpenInvoice,
    handleResumeCardPayment,
  };
}
