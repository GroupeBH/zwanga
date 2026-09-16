import { createBookingCardPaymentRedirectUrls } from '../../features/arrival-payment/paymentModel';
import {
  PaymentChannel,
  StoredBookingPaymentState,
  PaymentCompletionSummary,
} from '../../features/arrival-payment/paymentTypes';
import React, { useCallback } from 'react';
import { InteractionManager, Platform } from 'react-native';
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
  }, [acknowledgeBooking, completionSummary]);

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
    InteractionManager.runAfterInteractions(() => {
      navigateToInvoice(paymentHistoryId);
      setIsClosingForInvoice(false);
    });
  }, [navigateToInvoice]);

  const handleOpenInvoice = useCallback(() => {
    if (!completionSummary) return;
    const paymentHistoryId = completionSummary.paymentHistoryId;

    if (Platform.OS === 'ios') {
      pendingInvoicePaymentIdRef.current = paymentHistoryId ?? null;
      setIsClosingForInvoice(true);
    }

    acknowledgeBooking(completionSummary.bookingId);
    setCompletionSummary(null);

    if (Platform.OS !== 'ios') {
      navigateToInvoice(paymentHistoryId);
    }
  }, [acknowledgeBooking, completionSummary, navigateToInvoice]);

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
    await openCardPaymentUrl(
      activeStoredState.bookingPaymentUrl,
      activeStoredState.bookingPaymentOrderNumber,
      redirectUrls.returnUrl,
      activeStoredState.bookingPaymentChannel ?? 'card',
    );
  }, [
    activeStoredState?.bookingPaymentChannel,
    activeStoredState?.bookingPaymentOrderNumber,
    activeStoredState?.bookingPaymentUrl,
    arrivalBooking,
    isBusy,
    openCardPaymentUrl,
  ]);

  return {
    handleModalDismiss,
    handleDismissSummary,
    handleOpenInvoice,
    handleResumeCardPayment,
  };
}
