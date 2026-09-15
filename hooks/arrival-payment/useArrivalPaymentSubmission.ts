import {
  formatMoney,
  formatPoints,
  getPaymentMethodForChannel,
  getPaymentStatusMessage,
  createBookingCardPaymentRedirectUrls,
} from '../../features/arrival-payment/paymentModel';
import { PaymentChannel, StoredBookingPaymentState } from '../../features/arrival-payment/paymentTypes';
import { DRC_PAYMENT_PHONE_REGEX } from '../../features/arrival-payment/paymentPolicy';
import React, { useCallback } from 'react';
import { ELECTRONIC_PAYMENTS_ENABLED } from '@/constants/paymentFeatures';
import { useInitiateBookingPaymentMutation, useUpdateBookingPaymentModeMutation } from '@/store/api/bookingApi';
import { useGetMyWalletQuery, useInitiateWalletTopUpMutation } from '@/store/api/walletApi';
import type { Booking, BookingPaymentResponse, TripPaymentMode } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { openExternalUrlSafely } from '@/utils/safeExternalUrl';

interface Params {
  arrivalBooking: Booking | null;
  paymentAmount: number | null;
  isBusy: boolean;
  hasPendingProviderPayment: boolean;
  setPaymentError: React.Dispatch<React.SetStateAction<string>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  paymentAlreadySucceeded: boolean;
  showCompletionSummary: (sourceBooking: Booking, options?: { mode?: TripPaymentMode | null; channel?: PaymentChannel; paymentReference?: string | null; }) => Promise<void>;
  selectedMode: TripPaymentMode;
  selectedChannel: PaymentChannel;
  updatePaymentMode: ReturnType<typeof useUpdateBookingPaymentModeMutation>[0];
  requiredPoints: number | null;
  isWalletFetching: boolean;
  missingPoints: number;
  settleWithPoints: (bookingId: string) => Promise<boolean>;
  mobileMoneyPhone: string | undefined;
  initiateWalletTopUp: ReturnType<typeof useInitiateWalletTopUpMutation>[0];
  persistBookingState: (bookingId: string, patch: Partial<Record<keyof StoredBookingPaymentState, string | null>>) => void;
  refetchWallet: ReturnType<typeof useGetMyWalletQuery>['refetch'];
  moneyComplement: number;
  paymentCurrency: string;
  initiateBookingPayment: ReturnType<typeof useInitiateBookingPaymentMutation>[0];
  openCardPaymentUrl: (paymentUrl: string, orderNumber: string | null, returnUrl: string, channel: PaymentChannel) => Promise<boolean>;
  handleCompletedBookingPayment: (response: BookingPaymentResponse, options?: { mode?: TripPaymentMode | null; channel?: PaymentChannel; }) => Promise<boolean>;
}

export function useArrivalPaymentSubmission({
  arrivalBooking,
  paymentAmount,
  isBusy,
  hasPendingProviderPayment,
  setPaymentError,
  setStatusMessage,
  paymentAlreadySucceeded,
  showCompletionSummary,
  selectedMode,
  selectedChannel,
  updatePaymentMode,
  requiredPoints,
  isWalletFetching,
  missingPoints,
  settleWithPoints,
  mobileMoneyPhone,
  initiateWalletTopUp,
  persistBookingState,
  refetchWallet,
  moneyComplement,
  paymentCurrency,
  initiateBookingPayment,
  openCardPaymentUrl,
  handleCompletedBookingPayment,
}: Params) {
  const handlePayment = useCallback(async () => {
    if (!arrivalBooking || paymentAmount === null || isBusy || hasPendingProviderPayment) return;

    setPaymentError('');
    setStatusMessage('');

    if (paymentAlreadySucceeded) {
      await showCompletionSummary(arrivalBooking, {
        mode: arrivalBooking.paymentMode ?? selectedMode,
        channel: selectedMode === 'electronic' ? selectedChannel : undefined,
      });
      return;
    }

    try {
      if (selectedMode === 'cash') {
        const updatedBooking = await updatePaymentMode({
          bookingId: arrivalBooking.id,
          paymentMode: 'cash',
        }).unwrap();
        await showCompletionSummary(updatedBooking, { mode: 'cash' });
        return;
      }

      if (selectedMode === 'points') {
        if (requiredPoints === null || isWalletFetching) return;

        if (missingPoints <= 0) {
          await settleWithPoints(arrivalBooking.id);
          return;
        }

        const phone = mobileMoneyPhone;
        if (!phone || !DRC_PAYMENT_PHONE_REGEX.test(phone)) {
          setPaymentError(
            'Un numéro congolais valide est nécessaire dans votre profil pour payer le complément.',
          );
          return;
        }

        setStatusMessage(
          `Recharge de ${formatPoints(missingPoints)} pour compléter le paiement...`,
        );
        const response = await initiateWalletTopUp({
          amount: missingPoints,
          method: 'mobile_money',
          phone,
        }).unwrap();

        if (response.payment.status !== 'succeeded' && response.payment.orderNumber) {
          persistBookingState(arrivalBooking.id, {
            walletTopUpOrderNumber: response.payment.orderNumber,
          });
        }
        if (response.payment.paymentUrl) {
          await openExternalUrlSafely(response.payment.paymentUrl, {
            logLabel: 'PassengerArrivalPointsComplement',
          });
        }

        if (response.payment.status === 'succeeded') {
          await refetchWallet();
          await settleWithPoints(arrivalBooking.id);
          return;
        }

        setStatusMessage(
          getPaymentStatusMessage(
            response.payment.message,
            `Confirmez le complément de ${formatMoney(moneyComplement, paymentCurrency)} sur votre téléphone.`,
          ),
        );
        return;
      }

      if (!ELECTRONIC_PAYMENTS_ENABLED) return;
      const method = getPaymentMethodForChannel(selectedChannel);
      const phone = method === 'mobile_money' ? mobileMoneyPhone : undefined;
      if (method === 'mobile_money' && (!phone || !DRC_PAYMENT_PHONE_REGEX.test(phone))) {
        setPaymentError(
          'Un numéro congolais valide est nécessaire pour Mobile Money. Exemple : +243891234567.',
        );
        return;
      }
      if (arrivalBooking.paymentMode !== 'electronic') {
        await updatePaymentMode({
          bookingId: arrivalBooking.id,
          paymentMode: 'electronic',
        }).unwrap();
      }

      const cardRedirectUrls =
        method === 'card' ? createBookingCardPaymentRedirectUrls(arrivalBooking.id) : null;
      const response = await initiateBookingPayment({
        bookingId: arrivalBooking.id,
        method,
        phone,
        ...(cardRedirectUrls
          ? {
              approveUrl: cardRedirectUrls.approveUrl,
              cancelUrl: cardRedirectUrls.cancelUrl,
              declineUrl: cardRedirectUrls.declineUrl,
            }
          : {}),
      }).unwrap();

      if (response.payment.status !== 'succeeded' && response.payment.orderNumber) {
        persistBookingState(arrivalBooking.id, {
          bookingPaymentOrderNumber: response.payment.orderNumber,
          bookingPaymentMethod: method,
          bookingPaymentChannel: selectedChannel,
          bookingPaymentUrl: response.payment.paymentUrl,
        });
      }
      if (response.payment.paymentUrl) {
        if (method === 'card' && cardRedirectUrls) {
          const finished = await openCardPaymentUrl(
            response.payment.paymentUrl,
            response.payment.orderNumber,
            cardRedirectUrls.returnUrl,
            selectedChannel,
          );
          if (finished) return;
        } else {
          await openExternalUrlSafely(response.payment.paymentUrl, {
            logLabel: 'PassengerArrivalPayment',
          });
        }
      }

      const finished = await handleCompletedBookingPayment(response, {
        mode: 'electronic',
        channel: selectedChannel,
      });
      if (finished) {
        return;
      }

      setStatusMessage(
        getPaymentStatusMessage(
          response.payment.message,
          method === 'card'
            ? 'Paiement carte en cours de validation.'
            : 'Confirmez le paiement Mobile Money sur votre téléphone.',
        ),
      );
    } catch (error: any) {
      setPaymentError(getApiErrorMessage(error, "Le paiement n'a pas pu être effectué."));
    }
  }, [
    arrivalBooking,
    handleCompletedBookingPayment,
    initiateBookingPayment,
    initiateWalletTopUp,
    hasPendingProviderPayment,
    isBusy,
    isWalletFetching,
    missingPoints,
    mobileMoneyPhone,
    moneyComplement,
    openCardPaymentUrl,
    paymentAlreadySucceeded,
    paymentAmount,
    paymentCurrency,
    persistBookingState,
    refetchWallet,
    requiredPoints,
    selectedChannel,
    selectedMode,
    settleWithPoints,
    showCompletionSummary,
    updatePaymentMode,
  ]);

  return {
    handlePayment,
  };
}
