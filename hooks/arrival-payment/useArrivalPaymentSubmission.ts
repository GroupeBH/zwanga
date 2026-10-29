import {
  formatMoney,
  formatPoints,
  getPaymentMethodForChannel,
  getPaymentStatusMessage,
  createBookingCardPaymentRedirectUrls,
  hasPassengerArrived,
  getPaymentFailureMessage,
  normalizeAmount,
} from '../../features/arrival-payment/paymentModel';
import { PaymentChannel, StoredBookingPaymentState } from '../../features/arrival-payment/paymentTypes';
import { DRC_PAYMENT_PHONE_REGEX } from '../../features/arrival-payment/paymentPolicy';
import React, { useCallback, useRef, useState } from 'react';
import { ELECTRONIC_PAYMENTS_ENABLED } from '@/constants/paymentFeatures';
import { useInitiateBookingPaymentMutation, useUpdateBookingPaymentModeMutation } from '@/store/api/bookingApi';
import { useGetMyWalletQuery, useInitiateWalletTopUpMutation } from '@/store/api/walletApi';
import type { Booking, BookingPaymentResponse, TripPaymentMode } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { openExternalUrlSafely } from '@/utils/safeExternalUrl';
import { acknowledgeWalletTopUpIntent } from '@/features/wallet/topUpIntent';

interface Params {
  userId?: string;
  pendingTopUp?: string;
  payTokensCash?: () => Promise<void>;
  acknowledgeCash?: (bookingId: string) => void;
  isSessionCurrent: () => boolean;
  arrivalBooking: Booking | null;
  paymentAmount: number | null;
  isBusy: boolean;
  hasPendingProviderPayment: boolean;
  setPaymentError: React.Dispatch<React.SetStateAction<string>>;
  reportPaymentFailure: (bookingId: string) => void;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  paymentAlreadySucceeded: boolean;
  showCompletionSummary: (sourceBooking: Booking, options?: { mode?: TripPaymentMode | null; channel?: PaymentChannel; paymentReference?: string | null; }) => Promise<void>;
  selectedMode: TripPaymentMode | null;
  selectedChannel: PaymentChannel;
  updatePaymentMode: ReturnType<typeof useUpdateBookingPaymentModeMutation>[0];
  requiredPoints: number | null;
  isWalletFetching: boolean;
  missingPoints: number;
  settleWithPoints: (bookingId: string) => Promise<boolean>;
  mobileMoneyPhone: string | undefined;
  initiateWalletTopUp: ReturnType<typeof useInitiateWalletTopUpMutation>[0];
  persistBookingState: (bookingId: string, patch: Partial<Record<keyof StoredBookingPaymentState, string | null>>) => void | Promise<boolean>;
  refetchWallet: ReturnType<typeof useGetMyWalletQuery>['refetch'];
  moneyComplement: number;
  paymentCurrency: string;
  initiateBookingPayment: ReturnType<typeof useInitiateBookingPaymentMutation>[0];
  openCardPaymentUrl: (paymentUrl: string, orderNumber: string | null, returnUrl: string, channel: PaymentChannel) => Promise<boolean>;
  handleCompletedBookingPayment: (response: BookingPaymentResponse, options?: { mode?: TripPaymentMode | null; channel?: PaymentChannel; }) => Promise<boolean>;
}

export function useArrivalPaymentSubmission({
  userId,
  pendingTopUp,
  payTokensCash,
  acknowledgeCash,
  isSessionCurrent,
  arrivalBooking,
  paymentAmount,
  isBusy,
  hasPendingProviderPayment,
  setPaymentError,
  reportPaymentFailure,
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
  moneyComplement,
  paymentCurrency,
  initiateBookingPayment,
  openCardPaymentUrl,
  handleCompletedBookingPayment,
}: Params) {
  const submissionInFlight = useRef(false);
  const [submissionKind, setSubmissionKind] = useState<'payment' | 'cash' | null>(null);
  const isSubmitting = submissionKind !== null;
  const submitPayment = useCallback(async (recoverTopUp = false, modeOverride?: 'cash') => {
    const mode = modeOverride ?? selectedMode;
    if (!isSessionCurrent() || !arrivalBooking || !mode || paymentAmount === null || isBusy ||
        (hasPendingProviderPayment && !(recoverTopUp && pendingTopUp))) return;
    if (!hasPassengerArrived(arrivalBooking) && mode === 'cash' && !recoverTopUp) return;

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
      if (mode === 'cash' && !recoverTopUp) {
        // Continuing an existing cash booking is not a change of mode or a cash receipt.
        // In particular the server rejects changing a mode after the driver received cash.
        if (arrivalBooking.paymentMode === 'cash') {
          if (acknowledgeCash) acknowledgeCash(arrivalBooking.id);
          else await showCompletionSummary(arrivalBooking, { mode: 'cash' });
          return;
        }
        const updatedBooking = await updatePaymentMode({
          bookingId: arrivalBooking.id,
          paymentMode: 'cash',
        }).unwrap();
        if (!isSessionCurrent()) return;
        if (updatedBooking?.id !== arrivalBooking.id || updatedBooking.paymentMode !== 'cash' ||
            normalizeAmount(updatedBooking.paymentAmount) === null) {
          setPaymentError('Le passage au paiement cash n’a pas été confirmé. Actualisez la réservation avant de réessayer.');
          return;
        }
        // If the server changed the displayed fare, show the authoritative amount before closing.
        if (acknowledgeCash && normalizeAmount(updatedBooking.paymentAmount) === paymentAmount) acknowledgeCash(updatedBooking.id);
        else await showCompletionSummary(updatedBooking, { mode: 'cash' });
        return;
      }

      if (selectedMode === 'points' || recoverTopUp) {
        if (!recoverTopUp && (requiredPoints === null || isWalletFetching)) return;

        if (!recoverTopUp && payTokensCash && missingPoints > 0) {
          await payTokensCash();
          return;
        }

        if (!recoverTopUp && missingPoints <= 0) {
          await settleWithPoints(arrivalBooking.id);
          return;
        }

        const intent: { amount: number; phone?: string } = recoverTopUp && pendingTopUp
          ? JSON.parse(pendingTopUp) : { amount: missingPoints, phone: mobileMoneyPhone };
        if (!Number.isFinite(intent.amount) || intent.amount <= 0) throw new Error('Recharge à vérifier. Contactez le support avant de payer à nouveau.');
        const phone = intent.phone;
        if (!phone || !DRC_PAYMENT_PHONE_REGEX.test(phone)) {
          setPaymentError(
            'Un numéro congolais valide est nécessaire dans votre profil pour payer le complément.',
          );
          return;
        }

        setStatusMessage(
          `Vérification du complément de ${formatPoints(intent.amount)}…`,
        );
        const saved = await persistBookingState(arrivalBooking.id, { walletTopUpIntent: JSON.stringify(intent),
          ...(recoverTopUp ? {} : { walletTopUpConfirmedAt: null }) });
        if (saved === false || !isSessionCurrent()) return;
        const response = await initiateWalletTopUp({
          intentScope: `booking:${arrivalBooking.id}`,
          amount: intent.amount,
          method: 'mobile_money',
          phone,
        }).unwrap();

        if (response.payment.status === 'failed' || response.payment.status === 'cancelled') {
          await acknowledgeWalletTopUpIntent(userId, `booking:${arrivalBooking.id}`, response);
          persistBookingState(arrivalBooking.id, { walletTopUpIntent: null });
          if (isSessionCurrent()) {
            setStatusMessage('');
            setPaymentError(getPaymentFailureMessage(response.payment.message));
            reportPaymentFailure(arrivalBooking.id);
          }
          return;
        }
        if (response.payment.status !== 'succeeded' && response.payment.orderNumber) {
          persistBookingState(arrivalBooking.id, {
            walletTopUpOrderNumber: response.payment.orderNumber,
            walletTopUpIntent: null,
          });
        }
        if (!isSessionCurrent()) return;
        if (response.payment.paymentUrl) {
          await openExternalUrlSafely(response.payment.paymentUrl, {
            logLabel: 'PassengerArrivalPointsComplement',
          });
        }

        if (response.payment.status === 'succeeded') {
          await persistBookingState(arrivalBooking.id, { walletTopUpConfirmedAt: new Date().toISOString() });
          if (!isSessionCurrent()) return;
          if (await settleWithPoints(arrivalBooking.id)) {
            await acknowledgeWalletTopUpIntent(userId, `booking:${arrivalBooking.id}`, response);
            persistBookingState(arrivalBooking.id, { walletTopUpIntent: null });
          }
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

      if (!isSessionCurrent()) return;
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

      if (response.payment.status === 'failed' || response.payment.status === 'cancelled') {
        await handleCompletedBookingPayment(response, { mode: 'electronic', channel: selectedChannel });
        return;
      }
      if (response.payment.status !== 'succeeded' && response.payment.orderNumber) {
        persistBookingState(arrivalBooking.id, {
          bookingPaymentOrderNumber: response.payment.orderNumber,
          bookingPaymentMethod: method,
          bookingPaymentChannel: selectedChannel,
          bookingPaymentUrl: response.payment.paymentUrl,
        });
      }
      if (!isSessionCurrent()) return;
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
      if (isSessionCurrent()) setPaymentError(getApiErrorMessage(error, mode === 'cash'
        ? 'Impossible d’enregistrer le paiement cash. Vérifiez votre connexion, puis réessayez.'
        : "Le paiement n'a pas pu être effectué."));
    }
  }, [
    userId,
    pendingTopUp,
    payTokensCash,
    acknowledgeCash,
    isSessionCurrent,
    setPaymentError,
    reportPaymentFailure,
    setStatusMessage,
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
    requiredPoints,
    selectedChannel,
    selectedMode,
    settleWithPoints,
    showCompletionSummary,
    updatePaymentMode,
  ]);

  const runPayment = useCallback(async (recoverTopUp = false, modeOverride?: 'cash') => {
    if (submissionInFlight.current) return;
    submissionInFlight.current = true;
    setSubmissionKind(modeOverride === 'cash' ? 'cash' : 'payment');
    try { await submitPayment(recoverTopUp, modeOverride); }
    finally { submissionInFlight.current = false; if (isSessionCurrent()) setSubmissionKind(null); }
  }, [isSessionCurrent, submitPayment]);
  const handlePayment = useCallback(() => runPayment(), [runPayment]);
  const payCash = useCallback(() => runPayment(false, 'cash'), [runPayment]);
  const retryTopUp = useCallback(() => { void runPayment(true); }, [runPayment]);

  return {
    handlePayment,
    payCash,
    isSubmittingCash: submissionKind === 'cash',
    retryTopUp,
    isSubmitting,
  };
}
