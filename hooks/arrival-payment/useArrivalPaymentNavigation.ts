import { createBookingCardPaymentRedirectUrls } from '../../features/arrival-payment/paymentModel';
import {
  PaymentChannel,
  StoredBookingPaymentState,
  PaymentCompletionSummary,
} from '../../features/arrival-payment/paymentTypes';
import React, { useCallback } from 'react';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { Booking } from '@/types';
import type { Router } from 'expo-router';

interface Params {
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
    const paymentHistoryId = pendingInvoicePaymentIdRef.current;
    if (paymentHistoryId === undefined) return;

    pendingInvoicePaymentIdRef.current = undefined;
    // The in-app sheet is already removed; no native presentation or animation to await.
    try { navigateToInvoice(paymentHistoryId); }
    finally { setIsClosingForInvoice(false); }
  }, [navigateToInvoice, pendingInvoicePaymentIdRef, setIsClosingForInvoice]);

  const handleOpenInvoice = useCallback(() => {
    if (!completionSummary) return;
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
    handleModalDismiss,
    handleDismissSummary,
    handleOpenInvoice,
    handleResumeCardPayment,
  };
}
