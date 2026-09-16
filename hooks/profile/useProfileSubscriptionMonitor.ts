import { useDialog } from '@/components/ui/DialogProvider';
import {
  getApiMessage,
  getSubscriptionPaymentFailureMessage,
  getSubscriptionPaymentStatusMessage,
  isSubscriptionPaymentComplete,
  isSubscriptionPaymentFailed,
  SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_INITIAL_DELAY_MS,
  SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_INTERVAL_MS,
  SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_MAX_ATTEMPTS,
  SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_TIMEOUT_MS,
  SubscriptionPaymentCheckOutcome,
  SubscriptionPaymentStage,
  wait
} from '@/features/profile/profileModel';
import {
  useLazyCheckSubscriptionPaymentStatusQuery
} from '@/store/api/subscriptionApi';
import type {
  SubscriptionPaymentResponse
} from '@/types';
import { useCallback } from 'react';
import type { useProfileData } from './useProfileData';
import type { useProfileSubscriptionState } from './useProfileSubscriptionState';
import type { useProfileSubscriptionStorage } from './useProfileSubscriptionStorage';

type Props = Pick<ReturnType<typeof useProfileSubscriptionState>,
  | 'isSubscriptionCardPayment'
  | 'setIsSubscriptionPaymentAutoChecking'
  | 'setSubscriptionModalStep'
  | 'setSubscriptionModalVisible'
  | 'setSubscriptionPaymentAutoCheckAttempt'
  | 'setSubscriptionPaymentMessage'
  | 'setSubscriptionPaymentOrderNumber'
  | 'setSubscriptionPaymentStage'
  | 'subscriptionPaymentMountedRef'
  | 'subscriptionPaymentOrderNumber'
  | 'subscriptionPaymentPollingRunIdRef'
> & Pick<ReturnType<typeof useProfileSubscriptionStorage>,
  | 'clearStoredSubscriptionPayment'
> & Pick<ReturnType<typeof useProfileData>,
  | 'refetchPremiumOverview'
  | 'refetchProfile'
>;

export function useProfileSubscriptionMonitor({
  clearStoredSubscriptionPayment,
  isSubscriptionCardPayment,
  refetchPremiumOverview,
  refetchProfile,
  setIsSubscriptionPaymentAutoChecking,
  setSubscriptionModalStep,
  setSubscriptionModalVisible,
  setSubscriptionPaymentAutoCheckAttempt,
  setSubscriptionPaymentMessage,
  setSubscriptionPaymentOrderNumber,
  setSubscriptionPaymentStage,
  subscriptionPaymentMountedRef,
  subscriptionPaymentOrderNumber,
  subscriptionPaymentPollingRunIdRef,
}: Props) {
  const { showDialog } = useDialog();

  const [checkSubscriptionPaymentStatus, { isFetching: isCheckingSubscriptionPayment }] =
    useLazyCheckSubscriptionPaymentStatusQuery();

  const stopSubscriptionPaymentAutoCheck = useCallback(() => {
    subscriptionPaymentPollingRunIdRef.current += 1;
    if (subscriptionPaymentMountedRef.current) {
      setIsSubscriptionPaymentAutoChecking(false);
    }
  }, [setIsSubscriptionPaymentAutoChecking, subscriptionPaymentMountedRef, subscriptionPaymentPollingRunIdRef]);

  const finishSubscriptionPayment = useCallback(
    async (response: SubscriptionPaymentResponse) => {
      if (!isSubscriptionPaymentComplete(response)) {
        return false;
      }

      stopSubscriptionPaymentAutoCheck();
      await clearStoredSubscriptionPayment();
      await Promise.allSettled([Promise.resolve(refetchPremiumOverview()), Promise.resolve(refetchProfile())]);
      setSubscriptionPaymentStage('success');
      setSubscriptionPaymentAutoCheckAttempt(0);
      setSubscriptionModalVisible(false);
      setSubscriptionModalStep('method');
      setSubscriptionPaymentOrderNumber(null);
      setSubscriptionPaymentMessage(null);
      setSubscriptionPaymentStage('idle');
      showDialog({
        variant: 'success',
        title: 'Abonnement actif',
        message: 'Votre abonnement conducteur est actif. Vous pouvez publier plus de 5 trajets par jour.',
      });
      return true;
    },
    [clearStoredSubscriptionPayment, refetchPremiumOverview, refetchProfile, setSubscriptionModalStep, setSubscriptionModalVisible, setSubscriptionPaymentAutoCheckAttempt, setSubscriptionPaymentMessage, setSubscriptionPaymentOrderNumber, setSubscriptionPaymentStage, showDialog, stopSubscriptionPaymentAutoCheck],
  );

  const checkSubscriptionPaymentByOrderNumber = useCallback(
    async (
      orderNumber: string,
      options?: {
        checkingStage?: SubscriptionPaymentStage;
        pendingMessage?: string;
        pendingStage?: SubscriptionPaymentStage;
        suppressErrorDialog?: boolean;
        silentErrorMessage?: string;
      },
    ) => {
      try {
        setSubscriptionPaymentOrderNumber(orderNumber);
        setSubscriptionPaymentStage(options?.checkingStage ?? 'zwanga_activation');
        const response = await checkSubscriptionPaymentStatus(orderNumber).unwrap();
        if (await finishSubscriptionPayment(response)) {
          return 'success' as SubscriptionPaymentCheckOutcome;
        }

        if (isSubscriptionPaymentFailed(response)) {
          stopSubscriptionPaymentAutoCheck();
          await clearStoredSubscriptionPayment();
          setSubscriptionPaymentOrderNumber(null);
          setSubscriptionPaymentStage('failed');
          setSubscriptionPaymentMessage(getSubscriptionPaymentFailureMessage(response.payment.message));
          return 'failed' as SubscriptionPaymentCheckOutcome;
        }

        setSubscriptionPaymentStage(options?.pendingStage ?? 'operator_confirmation');
        setSubscriptionPaymentMessage(
          getSubscriptionPaymentStatusMessage(
            response.payment.message,
            options?.pendingMessage ||
            'Paiement en attente chez FlexPay. Confirmez sur votre téléphone ou terminez la page de paiement par carte ; nous continuons la vérification.',
          ),
        );
        return 'pending' as SubscriptionPaymentCheckOutcome;
      } catch (error: any) {
        if (options?.suppressErrorDialog) {
          setSubscriptionPaymentStage(options.pendingStage ?? 'operator_confirmation');
          setSubscriptionPaymentMessage(
            options.silentErrorMessage ||
            'La vérification prend plus de temps que prévu. Ne relancez pas le paiement ; la référence reste gardée.',
          );
          return 'error' as SubscriptionPaymentCheckOutcome;
        }

        showDialog({
          variant: 'danger',
          title: 'Vérification impossible',
          message: getApiMessage(error, 'Impossible de vérifier ce paiement pour le moment.'),
        });
        return 'error' as SubscriptionPaymentCheckOutcome;
      }
    },
    [checkSubscriptionPaymentStatus, clearStoredSubscriptionPayment, finishSubscriptionPayment, setSubscriptionPaymentMessage, setSubscriptionPaymentOrderNumber, setSubscriptionPaymentStage, showDialog, stopSubscriptionPaymentAutoCheck],
  );

  const startSubscriptionPaymentAutoCheck = useCallback(
    (orderNumber: string, initialMessage?: string | null) => {
      if (!orderNumber) {
        return;
      }

      const runId = subscriptionPaymentPollingRunIdRef.current + 1;
      subscriptionPaymentPollingRunIdRef.current = runId;
      setIsSubscriptionPaymentAutoChecking(true);
      setSubscriptionPaymentAutoCheckAttempt(0);
      setSubscriptionPaymentStage(isSubscriptionCardPayment ? 'zwanga_activation' : 'phone_confirmation');
      setSubscriptionPaymentMessage(
        initialMessage ||
        'Demande envoyée à FlexPay. Confirmez sur votre téléphone ; nous actualisons le statut quelques instants sans bloquer l’app.',
      );

      void (async () => {
        const deadline = Date.now() + SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_TIMEOUT_MS;
        let attempt = 0;
        let nextDelay = SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_INITIAL_DELAY_MS;

        while (subscriptionPaymentMountedRef.current && subscriptionPaymentPollingRunIdRef.current === runId) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0 || attempt >= SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_MAX_ATTEMPTS) {
            break;
          }

          await wait(Math.min(nextDelay, remainingMs));

          if (!subscriptionPaymentMountedRef.current || subscriptionPaymentPollingRunIdRef.current !== runId) {
            return;
          }

          attempt += 1;
          setSubscriptionPaymentAutoCheckAttempt(attempt);
          setSubscriptionPaymentStage(isSubscriptionCardPayment ? 'zwanga_activation' : 'operator_confirmation');
          const outcome = await checkSubscriptionPaymentByOrderNumber(orderNumber, {
            checkingStage: isSubscriptionCardPayment ? 'zwanga_activation' : 'operator_confirmation',
            pendingStage: isSubscriptionCardPayment ? 'zwanga_activation' : 'operator_confirmation',
            pendingMessage:
              attempt === 1
                ? 'Vérification rapide en cours. Si la demande est sur votre téléphone, confirmez-la avec votre PIN Mobile Money.'
                : 'Paiement toujours en traitement. Nous continuons les actualisations automatiques ; inutile de relancer le paiement.',
            suppressErrorDialog: true,
            silentErrorMessage:
              'La vérification prend plus de temps que prévu. Nous gardons la référence et continuons le suivi.',
          });

          if (!subscriptionPaymentMountedRef.current || subscriptionPaymentPollingRunIdRef.current !== runId) {
            return;
          }

          if (outcome === 'success' || outcome === 'failed') {
            setIsSubscriptionPaymentAutoChecking(false);
            return;
          }

          nextDelay = SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_INTERVAL_MS;
        }

        if (subscriptionPaymentMountedRef.current && subscriptionPaymentPollingRunIdRef.current === runId) {
          setIsSubscriptionPaymentAutoChecking(false);
          setSubscriptionPaymentStage('waiting_long');
          setSubscriptionPaymentMessage(
            'Le paiement est encore en traitement. Ne payez pas une deuxième fois ; la référence reste gardée et Zwanga reprendra la vérification.',
          );
        }
      })();
    },
    [checkSubscriptionPaymentByOrderNumber, isSubscriptionCardPayment, setIsSubscriptionPaymentAutoChecking, setSubscriptionPaymentAutoCheckAttempt, setSubscriptionPaymentMessage, setSubscriptionPaymentStage, subscriptionPaymentMountedRef, subscriptionPaymentPollingRunIdRef],
  );
  return {
    checkSubscriptionPaymentByOrderNumber,
    finishSubscriptionPayment,
    isCheckingSubscriptionPayment,
    startSubscriptionPaymentAutoCheck,
    stopSubscriptionPaymentAutoCheck,
  };
}
