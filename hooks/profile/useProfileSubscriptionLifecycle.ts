import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import {
  AppState
} from 'react-native';
import type { useProfileData } from './useProfileData';
import type { useProfileSubscriptionMonitor } from './useProfileSubscriptionMonitor';
import type { useProfileSubscriptionRecovery } from './useProfileSubscriptionRecovery';
import type { useProfileSubscriptionState } from './useProfileSubscriptionState';
import type { useProfileSubscriptionStorage } from './useProfileSubscriptionStorage';

type Props = Pick<ReturnType<typeof useProfileSubscriptionStorage>,
  | 'clearStoredSubscriptionPayment'
  | 'readStoredSubscriptionPayment'
  | 'subscriptionPaymentStorageKey'
> & Pick<ReturnType<typeof useProfileData>,
  | 'currentUser'
  | 'isDriver'
  | 'isPremiumActive'
  | 'paymentHistoryLoaded'
  | 'recentPendingSubscriptionOrderNumber'
> & Pick<ReturnType<typeof useProfileSubscriptionState>,
  | 'isSubscriptionCardPayment'
  | 'isSubscriptionPaymentAutoChecking'
  | 'restoredSubscriptionPaymentKeyRef'
  | 'setIsRestoringSubscriptionPayment'
  | 'setSubscriptionModalStep'
  | 'setSubscriptionPaymentMessage'
  | 'setSubscriptionPaymentOrderNumber'
  | 'subscriptionPaymentMountedRef'
  | 'subscriptionPaymentOrderNumber'
> & Pick<ReturnType<typeof useProfileSubscriptionRecovery>,
  | 'applyStoredSubscriptionPayment'
  | 'refreshSubscriptionFromBackend'
> & Pick<ReturnType<typeof useProfileSubscriptionMonitor>,
  | 'checkSubscriptionPaymentByOrderNumber'
  | 'startSubscriptionPaymentAutoCheck'
>;

export function useProfileSubscriptionLifecycle({
  applyStoredSubscriptionPayment,
  checkSubscriptionPaymentByOrderNumber,
  clearStoredSubscriptionPayment,
  currentUser,
  isDriver,
  isPremiumActive,
  isSubscriptionCardPayment,
  isSubscriptionPaymentAutoChecking,
  paymentHistoryLoaded,
  readStoredSubscriptionPayment,
  recentPendingSubscriptionOrderNumber,
  refreshSubscriptionFromBackend,
  restoredSubscriptionPaymentKeyRef,
  setIsRestoringSubscriptionPayment,
  setSubscriptionModalStep,
  setSubscriptionPaymentMessage,
  setSubscriptionPaymentOrderNumber,
  startSubscriptionPaymentAutoCheck,
  subscriptionPaymentMountedRef,
  subscriptionPaymentOrderNumber,
  subscriptionPaymentStorageKey,
}: Props) {
  const router = useRouter();
  const isFocused = useIsFocused();

  const { openSubscription, paymentStatus } = useLocalSearchParams<{
    openDriverOnboarding?: string;
    openSubscription?: string;
    paymentStatus?: string;
  }>();

  const openedSubscriptionParamRef = useRef(false);

  const handledPaymentStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!subscriptionPaymentStorageKey || !currentUser?.id) {
      restoredSubscriptionPaymentKeyRef.current = null;
      return;
    }

    if (!paymentHistoryLoaded) {
      return;
    }

    if (isPremiumActive) {
      restoredSubscriptionPaymentKeyRef.current = null;
      void clearStoredSubscriptionPayment();
      return;
    }

    if (restoredSubscriptionPaymentKeyRef.current === subscriptionPaymentStorageKey) {
      return;
    }

    restoredSubscriptionPaymentKeyRef.current = subscriptionPaymentStorageKey;
    let cancelled = false;
    setIsRestoringSubscriptionPayment(true);

    void (async () => {
      const storedPayment = await readStoredSubscriptionPayment();
      if (!storedPayment || cancelled) {
        return;
      }

      applyStoredSubscriptionPayment(storedPayment);
      await refreshSubscriptionFromBackend({
        pendingMessage:
          "Paiement précédent retrouvé. Nous actualisons l'abonnement depuis Zwanga. Évitez de relancer un paiement.",
      });
    })().finally(() => {
      if (!cancelled) {
        setIsRestoringSubscriptionPayment(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [applyStoredSubscriptionPayment, clearStoredSubscriptionPayment, currentUser?.id, refreshSubscriptionFromBackend, isPremiumActive, readStoredSubscriptionPayment, paymentHistoryLoaded, subscriptionPaymentStorageKey, restoredSubscriptionPaymentKeyRef, setIsRestoringSubscriptionPayment]);

  useEffect(() => {
    if (
      !paymentHistoryLoaded ||
      isPremiumActive ||
      isSubscriptionPaymentAutoChecking ||
      !subscriptionPaymentOrderNumber
    ) {
      return;
    }

    if (subscriptionPaymentOrderNumber === recentPendingSubscriptionOrderNumber) {
      return;
    }

    void clearStoredSubscriptionPayment();
    setSubscriptionPaymentOrderNumber(null);
    setSubscriptionPaymentMessage(null);
    setSubscriptionModalStep('method');
  }, [clearStoredSubscriptionPayment, isPremiumActive, isSubscriptionPaymentAutoChecking, paymentHistoryLoaded, recentPendingSubscriptionOrderNumber, setSubscriptionModalStep, setSubscriptionPaymentMessage, setSubscriptionPaymentOrderNumber, subscriptionPaymentOrderNumber]);

  useEffect(() => {
    // Route focus (not AppState) lets a visible profile reconcile on foreground,
    // while a hidden one only listens if an actual payment is still pending.
    if (!isDriver || (!isFocused && !subscriptionPaymentOrderNumber)) {
      return undefined;
    }

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      if (subscriptionPaymentOrderNumber) {
        const pendingMessage = 'Retour dans l’app détecté. Nous actualisons cette référence sans relancer de paiement.';
        void checkSubscriptionPaymentByOrderNumber(subscriptionPaymentOrderNumber, {
          checkingStage: isSubscriptionCardPayment ? 'zwanga_activation' : 'operator_confirmation',
          pendingStage: isSubscriptionCardPayment ? 'zwanga_activation' : 'operator_confirmation',
          pendingMessage,
          suppressErrorDialog: true,
          silentErrorMessage:
            'Retour dans l’app détecté. La vérification prend plus de temps que prévu ; nous gardons la référence.',
        }).then((outcome) => {
          if (
            subscriptionPaymentMountedRef.current &&
            (outcome === 'pending' || outcome === 'error') &&
            !isSubscriptionPaymentAutoChecking
          ) {
            startSubscriptionPaymentAutoCheck(subscriptionPaymentOrderNumber, pendingMessage);
          }
        });
        return;
      }

      void refreshSubscriptionFromBackend();
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [checkSubscriptionPaymentByOrderNumber, isDriver, isFocused, isSubscriptionCardPayment, isSubscriptionPaymentAutoChecking, refreshSubscriptionFromBackend, startSubscriptionPaymentAutoCheck, subscriptionPaymentMountedRef, subscriptionPaymentOrderNumber]);

  useEffect(() => {
    if (openedSubscriptionParamRef.current || !openSubscription || !currentUser) {
      return;
    }

    openedSubscriptionParamRef.current = true;
    if (isDriver) {
      router.replace(
        paymentStatus
          ? {
            pathname: '/subscriptions/payment',
            params: { paymentStatus: String(paymentStatus) },
          }
          : ({ pathname: '/subscriptions/payment' } as any),
      );
    }
  }, [currentUser, isDriver, openSubscription, paymentStatus, router]);

  useEffect(() => {
    const paymentStatusKey = paymentStatus ? `screen:${String(paymentStatus)}` : null;
    if (!paymentStatusKey || handledPaymentStatusRef.current === paymentStatusKey) {
      return;
    }

    handledPaymentStatusRef.current = paymentStatusKey;
    router.replace({
      pathname: '/subscriptions/payment',
      params: { paymentStatus: String(paymentStatus) },
    } as any);
  }, [paymentStatus, router]);
}
