import { formatCongolesePaymentPhone } from '../../features/subscription-payment/paymentModel';
import { PaymentStage, PaymentCheckOutcome, StoredPayment } from '../../features/subscription-payment/paymentTypes';
import { Spacing } from '@/constants/styles';
import type { PaymentHistoryItem, SubscriptionPaymentMethod } from '@/types';
import React, { useCallback, useEffect } from 'react';
import { AppState, Platform, ScrollView } from 'react-native';
import type { User } from '@/types';

interface Params {
  scrollRef: React.RefObject<ScrollView | null>;
  phoneFieldOffsetRef: React.RefObject<number>;
  prefilledPhoneRef: React.RefObject<boolean>;
  currentUser: User | null;
  setPhone: React.Dispatch<React.SetStateAction<string>>;
  mountedRef: React.RefObject<boolean>;
  pollingRunIdRef: React.RefObject<number>;
  storageKey: string | null;
  isPremiumActive: boolean;
  recentPendingPayment: PaymentHistoryItem | null;
  restoredKeyRef: React.RefObject<string | null>;
  restorePayment: () => Promise<StoredPayment | null>;
  checkPaymentByOrderNumber: (nextOrderNumber: string, options?: { checkingStage?: PaymentStage; pendingStage?: PaymentStage; pendingMessage?: string; suppressErrorDialog?: boolean; }) => Promise<PaymentCheckOutcome>;
  startAutoCheck: (nextOrderNumber: string, initialMessage?: string | null) => void;
  returnedPaymentStatus: string | undefined;
  orderNumber: string | null;
  handledPaymentStatusRef: React.RefObject<string | null>;
  setStage: React.Dispatch<React.SetStateAction<PaymentStage>>;
  setMessage: React.Dispatch<React.SetStateAction<string | null>>;
  isDriver: boolean;
  stage: PaymentStage;
  paymentMethod: SubscriptionPaymentMethod;
  isAutoChecking: boolean;
}

export function useSubscriptionPaymentLifecycle({
  scrollRef,
  phoneFieldOffsetRef,
  prefilledPhoneRef,
  currentUser,
  setPhone,
  mountedRef,
  pollingRunIdRef,
  storageKey,
  isPremiumActive,
  recentPendingPayment,
  restoredKeyRef,
  restorePayment,
  checkPaymentByOrderNumber,
  startAutoCheck,
  returnedPaymentStatus,
  orderNumber,
  handledPaymentStatusRef,
  setStage,
  setMessage,
  isDriver,
  stage,
  paymentMethod,
  isAutoChecking,
}: Params) {
  const scrollPhoneFieldIntoView = useCallback(() => {
    const reveal = () => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, phoneFieldOffsetRef.current - Spacing.lg),
        animated: true,
      });
    };

    if (Platform.OS === 'android') {
      setTimeout(reveal, 280);
      return;
    }

    requestAnimationFrame(reveal);
  }, []);

  useEffect(() => {
    if (prefilledPhoneRef.current || !currentUser?.phone) return;
    setPhone(formatCongolesePaymentPhone(currentUser.phone));
    prefilledPhoneRef.current = true;
  }, [currentUser?.phone]);

  useEffect(() => () => {
    mountedRef.current = false;
    pollingRunIdRef.current += 1;
  }, []);

  useEffect(() => {
    if (!storageKey || !currentUser?.id || isPremiumActive) return;
    const restoreKey = `${storageKey}:${recentPendingPayment?.orderNumber ?? 'none'}`;
    if (restoredKeyRef.current === restoreKey) return;
    restoredKeyRef.current = restoreKey;

    let cancelled = false;
    void (async () => {
      const restoredPayment = await restorePayment();
      if (cancelled || !restoredPayment?.orderNumber) return;
      const nextStage =
        restoredPayment.paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation';
      const outcome = await checkPaymentByOrderNumber(restoredPayment.orderNumber, {
        checkingStage: nextStage,
        pendingStage: nextStage,
        pendingMessage: "Référence retrouvée. Aucune nouvelle demande n'est envoyée.",
        suppressErrorDialog: true,
      });
      if (!cancelled && (outcome === 'pending' || outcome === 'error')) {
        startAutoCheck(
          restoredPayment.orderNumber,
          "Référence retrouvée. Aucune nouvelle demande n'est envoyée.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    checkPaymentByOrderNumber,
    currentUser?.id,
    isPremiumActive,
    recentPendingPayment?.orderNumber,
    restorePayment,
    startAutoCheck,
    storageKey,
  ]);

  useEffect(() => {
    if (!returnedPaymentStatus) return;
    const paymentStatusKey = `${String(returnedPaymentStatus)}:${orderNumber ?? 'pending'}`;
    if (handledPaymentStatusRef.current === paymentStatusKey) return;
    handledPaymentStatusRef.current = paymentStatusKey;

    const normalizedStatus = String(returnedPaymentStatus).toLowerCase();
    void (async () => {
      const restoredPayment = await restorePayment();
      const nextOrderNumber = orderNumber ?? restoredPayment?.orderNumber;
      if (!nextOrderNumber) {
        if (normalizedStatus === 'cancel' || normalizedStatus === 'decline') {
          setStage('failed');
          setMessage(
            normalizedStatus === 'cancel'
              ? 'Paiement carte annulé.'
              : 'Paiement carte refusé. Vérifiez votre carte ou essayez un autre moyen.',
          );
        } else {
          setMessage('Retour carte reçu. Actualisez le statut avant de relancer un paiement.');
        }
        return;
      }

      const pendingMessage =
        normalizedStatus === 'success'
          ? 'Retour carte reçu. Vérification FlexPay avant activation.'
          : 'Retour carte reçu. Vérification du statut avant toute nouvelle tentative.';
      const outcome = await checkPaymentByOrderNumber(nextOrderNumber, {
        checkingStage: 'zwanga_activation',
        pendingStage: 'zwanga_activation',
        pendingMessage,
        suppressErrorDialog: true,
      });
      if (outcome === 'pending' || outcome === 'error') startAutoCheck(nextOrderNumber, pendingMessage);
    })();
  }, [
    checkPaymentByOrderNumber,
    orderNumber,
    restorePayment,
    returnedPaymentStatus,
    startAutoCheck,
  ]);

  useEffect(() => {
    if (!isDriver) return undefined;
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (
        nextState !== 'active' ||
        !orderNumber ||
        stage === 'waiting_long' ||
        stage === 'failed' ||
        stage === 'success'
      ) {
        return;
      }
      const nextStage = paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation';
      void checkPaymentByOrderNumber(orderNumber, {
        checkingStage: nextStage,
        pendingStage: nextStage,
        pendingMessage: "Retour dans l'app detecté. Nous actualisons cette référence.",
        suppressErrorDialog: true,
      }).then((outcome) => {
        if (mountedRef.current && (outcome === 'pending' || outcome === 'error') && !isAutoChecking) {
          startAutoCheck(orderNumber, "Retour dans l'app detecté. Nous reprenons le suivi.");
        }
      });
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [checkPaymentByOrderNumber, isAutoChecking, isDriver, orderNumber, paymentMethod, stage, startAutoCheck]);

  return {
    scrollPhoneFieldIntoView,
  };
}
