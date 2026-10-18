import { normalizeAmount, getPaymentFailureMessage, isPaymentSucceeded } from '../../features/arrival-payment/paymentModel';
import { buildPaymentCompletionSummary, type CompletionOptions } from '@/features/arrival-payment/buildPaymentCompletionSummary';
import {
  PaymentChannel,
  StoredBookingPaymentState,
  PaymentCompletionSummary,
} from '../../features/arrival-payment/paymentTypes';
import React, { useCallback } from 'react';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetBookingPaymentHistoryQuery } from '@/store/api/paymentApi';
import { useGetMyWalletQuery } from '@/store/api/walletApi';
import type { Booking, BookingPaymentResponse, PaymentHistoryItem, TripPaymentMode, WalletSummary } from '@/types';

interface Params {
  isSessionCurrent: () => boolean;
  refetchBookings: ReturnType<typeof useGetMyBookingsQuery>['refetch'];
  refetchWallet: ReturnType<typeof useGetMyWalletQuery>['refetch'];
  refetchPaymentHistory: ReturnType<typeof useGetBookingPaymentHistoryQuery>['refetch'];
  bookings: Booking[];
  wallet: WalletSummary | undefined;
  paymentHistory: PaymentHistoryItem[];
  setCompletionSummary: React.Dispatch<React.SetStateAction<PaymentCompletionSummary | null>>;
  persistBookingState: (bookingId: string, patch: Partial<Record<keyof StoredBookingPaymentState, string | null>>) => void;
  setPaymentError: React.Dispatch<React.SetStateAction<string>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  reportPaymentFailure: (bookingId: string) => void;
}

export function useArrivalPaymentCompletion({
  isSessionCurrent,
  refetchBookings,
  refetchWallet,
  refetchPaymentHistory,
  wallet,
  paymentHistory,
  setCompletionSummary,
  persistBookingState,
  setPaymentError,
  setStatusMessage,
  reportPaymentFailure,
}: Params) {
  const showCompletionSummary = useCallback(
    async (
      sourceBooking: Booking,
      options: CompletionOptions = {},
    ) => {
      if (!isSessionCurrent()) return;
      const summary = buildPaymentCompletionSummary(sourceBooking, wallet, paymentHistory, options);
      if (!summary) { setPaymentError('Choisissez le mode de paiement pour cette réservation.'); return; }
      if (sourceBooking.paymentStatus === 'succeeded' || normalizeAmount(sourceBooking.paymentAmount) === 0 ||
          (sourceBooking.paymentMode === 'cash' && sourceBooking.cashReceivedAt)) {
        persistBookingState(sourceBooking.id, { settledAt: new Date().toISOString(), requiredActionAt: null });
      }
      setCompletionSummary(summary);
      // Confirmation is usable immediately, even if these reads time out.
      void Promise.allSettled([
        Promise.resolve().then(() => refetchBookings()),
        Promise.resolve().then(() => refetchWallet()),
        Promise.resolve().then(() => refetchPaymentHistory()),
      ]).then(([, walletResult, historyResult]) => {
        if (!isSessionCurrent()) return;
        const freshWallet = walletResult.status === 'fulfilled' ? walletResult.value.data ?? wallet : wallet;
        const freshHistory = historyResult.status === 'fulfilled' ? historyResult.value.data ?? paymentHistory : paymentHistory;
        const enriched = buildPaymentCompletionSummary(sourceBooking, freshWallet, freshHistory, options);
        setCompletionSummary(current => current === summary ? enriched : current);
      });
    },
    [
      isSessionCurrent,
      persistBookingState,
      setCompletionSummary,
      setPaymentError,
      paymentHistory,
      refetchBookings,
      refetchPaymentHistory,
      refetchWallet,
      wallet,
    ],
  );

  const handleCompletedBookingPayment = useCallback(
    async (
      response: BookingPaymentResponse,
      options: { mode?: TripPaymentMode | null; channel?: PaymentChannel } = {},
    ) => {
      if (!isSessionCurrent()) return true;
      if (isPaymentSucceeded(response) || normalizeAmount(response.payment.amount) === 0) {
        persistBookingState(response.booking.id, {
          bookingPaymentOrderNumber: null,
          bookingPaymentUrl: null,
        });
        await showCompletionSummary(response.booking, {
          mode: options.mode ?? response.booking.paymentMode,
          channel: options.channel,
          paymentReference: response.payment.reference,
        });
        return true;
      }

      if (response.payment.status === 'failed' || response.payment.status === 'cancelled') {
        setStatusMessage('');
        persistBookingState(response.booking.id, {
          bookingPaymentOrderNumber: null,
          bookingPaymentUrl: null,
        });
        setPaymentError(getPaymentFailureMessage(response.payment.message));
        reportPaymentFailure(response.booking.id);
        return true;
      }

      return false;
    },
    [isSessionCurrent, persistBookingState, showCompletionSummary, setPaymentError, setStatusMessage, reportPaymentFailure],
  );

  return {
    handleCompletedBookingPayment,
    showCompletionSummary,
  };
}
