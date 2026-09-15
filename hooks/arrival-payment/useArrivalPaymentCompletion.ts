import {
  normalizeAmount,
  getPaymentFailureMessage,
  isPaymentSucceeded,
  findBookingPaymentHistory,
  getLedgerEntryAmount,
  findBookingRewardEntry,
} from '../../features/arrival-payment/paymentModel';
import {
  PaymentChannel,
  StoredBookingPaymentState,
  PaymentCompletionSummary,
} from '../../features/arrival-payment/paymentTypes';
import React, { useCallback } from 'react';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetPaymentHistoryQuery } from '@/store/api/paymentApi';
import { useGetMyWalletQuery } from '@/store/api/walletApi';
import type { Booking, BookingPaymentResponse, PaymentHistoryItem, TripPaymentMode, WalletSummary } from '@/types';

interface Params {
  refetchBookings: ReturnType<typeof useGetMyBookingsQuery>['refetch'];
  refetchWallet: ReturnType<typeof useGetMyWalletQuery>['refetch'];
  refetchPaymentHistory: ReturnType<typeof useGetPaymentHistoryQuery>['refetch'];
  bookings: Booking[];
  wallet: WalletSummary | undefined;
  paymentHistory: PaymentHistoryItem[];
  setCompletionSummary: React.Dispatch<React.SetStateAction<PaymentCompletionSummary | null>>;
  persistBookingState: (bookingId: string, patch: Partial<Record<keyof StoredBookingPaymentState, string | null>>) => void;
  setPaymentError: React.Dispatch<React.SetStateAction<string>>;
}

export function useArrivalPaymentCompletion({
  refetchBookings,
  refetchWallet,
  refetchPaymentHistory,
  bookings,
  wallet,
  paymentHistory,
  setCompletionSummary,
  persistBookingState,
  setPaymentError,
}: Params) {
  const showCompletionSummary = useCallback(
    async (
      sourceBooking: Booking,
      options: {
        mode?: TripPaymentMode | null;
        channel?: PaymentChannel;
        paymentReference?: string | null;
      } = {},
    ) => {
      const [bookingsResult, walletResult, historyResult] = await Promise.allSettled([
        refetchBookings(),
        refetchWallet(),
        refetchPaymentHistory(),
      ]);

      const latestBookings =
        bookingsResult.status === 'fulfilled' && Array.isArray(bookingsResult.value.data)
          ? bookingsResult.value.data
          : bookings;
      const latestWallet =
        walletResult.status === 'fulfilled' && walletResult.value.data
          ? walletResult.value.data
          : wallet;
      const latestPaymentHistory =
        historyResult.status === 'fulfilled' && Array.isArray(historyResult.value.data)
          ? historyResult.value.data
          : paymentHistory;

      const latestBooking =
        latestBookings.find((booking) => booking.id === sourceBooking.id) ?? sourceBooking;
      const payment = findBookingPaymentHistory(latestPaymentHistory, latestBooking);
      const rewardEntry = findBookingRewardEntry(latestWallet, latestBooking);
      const earnedPoints = getLedgerEntryAmount(rewardEntry);
      const amount = normalizeAmount(latestBooking.paymentAmount) ?? normalizeAmount(payment?.amount) ?? 0;
      const currency = latestBooking.paymentCurrency ?? payment?.currency ?? 'CDF';
      const mode = latestBooking.paymentMode ?? options.mode ?? 'cash';
      const balance = normalizeAmount(latestWallet?.account.balance);
      const paymentHistoryId = payment?.id ?? null;

      setCompletionSummary({
        bookingId: latestBooking.id,
        mode,
        channel: options.channel,
        amount,
        currency,
        walletBalance: balance,
        earnedPoints,
        earnedPointsKnown: Boolean(rewardEntry),
        invoiceUrl: paymentHistoryId ? `/payment-history?paymentId=${paymentHistoryId}` : null,
        paymentHistoryId,
        paymentReference:
          latestBooking.paymentReference ?? payment?.reference ?? options.paymentReference ?? null,
        driverNotice:
          mode === 'cash'
            ? 'Le conducteur est informe que vous avez confirme le paiement en especes.'
            : 'Le conducteur est informe des que le paiement est confirme.',
      });
    },
    [
      bookings,
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
        persistBookingState(response.booking.id, {
          bookingPaymentOrderNumber: null,
          bookingPaymentUrl: null,
        });
        setPaymentError(getPaymentFailureMessage(response.payment.message));
        return true;
      }

      return false;
    },
    [persistBookingState, showCompletionSummary],
  );

  return {
    handleCompletedBookingPayment,
    showCompletionSummary,
  };
}
