import {
  normalizeAmount,
  getPaymentStatusMessage,
  getCardPaymentResultFromUrl,
} from '../../features/arrival-payment/paymentModel';
import { PaymentChannel } from '../../features/arrival-payment/paymentTypes';
import React, { useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import {
  useGetMyBookingsQuery,
  useLazyCheckBookingPaymentStatusQuery,
  useUpdateBookingPaymentModeMutation,
} from '@/store/api/bookingApi';
import { useGetMyWalletQuery } from '@/store/api/walletApi';
import type { Booking, BookingPaymentResponse, TripPaymentMode } from '@/types';

interface Params {
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  setPaymentError: React.Dispatch<React.SetStateAction<string>>;
  checkBookingPaymentStatus: ReturnType<typeof useLazyCheckBookingPaymentStatusQuery>[0];
  handleCompletedBookingPayment: (response: BookingPaymentResponse, options?: { mode?: TripPaymentMode | null; channel?: PaymentChannel; }) => Promise<boolean>;
  updatePaymentMode: ReturnType<typeof useUpdateBookingPaymentModeMutation>[0];
  refetchBookings: ReturnType<typeof useGetMyBookingsQuery>['refetch'];
  refetchWallet: ReturnType<typeof useGetMyWalletQuery>['refetch'];
  showCompletionSummary: (sourceBooking: Booking, options?: { mode?: TripPaymentMode | null; channel?: PaymentChannel; paymentReference?: string | null; }) => Promise<void>;
}

export function useArrivalPaymentProvider({
  setStatusMessage,
  setPaymentError,
  checkBookingPaymentStatus,
  handleCompletedBookingPayment,
  updatePaymentMode,
  refetchBookings,
  refetchWallet,
  showCompletionSummary,
}: Params) {
  const openCardPaymentUrl = useCallback(
    async (
      paymentUrl: string,
      orderNumber: string | null,
      returnUrl: string,
      channel: PaymentChannel,
    ) => {
      setStatusMessage('Page carte ouverte. Finalisez le paiement; nous verifierons le retour.');

      const result = await WebBrowser.openAuthSessionAsync(paymentUrl, returnUrl);
      if (result.type !== 'success') {
        if (orderNumber) {
          setStatusMessage("Vérification du paiement par carte en cours…");
          return false;
        }

        setPaymentError("La page de paiement par carte a été fermée avant la confirmation.");
        return true;
      }

      const paymentResult = getCardPaymentResultFromUrl(result.url);
      if (paymentResult === 'cancel' || paymentResult === 'decline') {
        setPaymentError(
          paymentResult === 'cancel'
            ? "Paiement par carte annulé. Vous pouvez réessayer."
            : "Paiement par carte refusé. Vérifiez votre carte ou choisissez un autre moyen de paiement.",
        );
        return true;
      }

      if (!orderNumber) {
        setStatusMessage("Le résultat du paiement par carte a été reçu. Zwanga finalisera la confirmation automatiquement.");
        return false;
      }

      const statusResponse = await checkBookingPaymentStatus(orderNumber).unwrap();
      const finished = await handleCompletedBookingPayment(statusResponse, {
        mode: 'electronic',
        channel,
      });

      if (!finished) {
        setStatusMessage(
          getPaymentStatusMessage(
            statusResponse.payment.message,
            "Paiement par carte en cours de validation. Nous continuons la vérification.",
          ),
        );
      }

      return finished;
    },
    [checkBookingPaymentStatus, handleCompletedBookingPayment],
  );

  const settleWithPoints = useCallback(
    async (bookingId: string) => {
      const updatedBooking = await updatePaymentMode({
        bookingId,
        paymentMode: 'points',
      }).unwrap();

      await Promise.all([refetchBookings(), refetchWallet()]);
      if (
        updatedBooking.paymentStatus === 'succeeded' ||
        updatedBooking.paymentStatus === 'not_required' ||
        normalizeAmount(updatedBooking.paymentAmount) === 0
      ) {
        await showCompletionSummary(updatedBooking, { mode: 'points' });
        return true;
      }

      setStatusMessage('Les jetons sont en cours de vérification. Le modal restera ouvert.');
      return false;
    },
    [refetchBookings, refetchWallet, showCompletionSummary, updatePaymentMode],
  );

  return {
    settleWithPoints,
    openCardPaymentUrl,
  };
}
