import {
  wait,
  getPaymentFailureMessage,
  getPaymentStatusMessage,
  isPaymentComplete,
  isPaymentFailed,
} from '../../features/subscription-payment/paymentModel';
import {
  PaymentStage,
  PaymentCheckOutcome,
  AUTO_CHECK_INITIAL_DELAY_MS,
  AUTO_CHECK_INTERVAL_MS,
  AUTO_CHECK_TIMEOUT_MS,
  AUTO_CHECK_MAX_ATTEMPTS,
} from '../../features/subscription-payment/paymentTypes';
import { useDialog } from '@/components/ui/DialogProvider';
import { useGetPremiumOverviewQuery, useLazyCheckSubscriptionPaymentStatusQuery } from '@/store/api/subscriptionApi';
import { useGetProfileSummaryQuery } from '@/store/api/userApi';
import { useGetMyWalletQuery } from '@/store/api/walletApi';
import type { SubscriptionPaymentMethod, SubscriptionPaymentResponse } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import React, { useCallback } from 'react';

interface Params {
  stopAutoCheck: () => void;
  clearStoredPayment: () => Promise<void>;
  refetchPremiumOverview: ReturnType<typeof useGetPremiumOverviewQuery>['refetch'];
  refetchProfile: ReturnType<typeof useGetProfileSummaryQuery>['refetch'];
  refetchWallet: ReturnType<typeof useGetMyWalletQuery>['refetch'];
  setStage: React.Dispatch<React.SetStateAction<PaymentStage>>;
  setOrderNumber: React.Dispatch<React.SetStateAction<string | null>>;
  setPaymentUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setMessage: React.Dispatch<React.SetStateAction<string | null>>;
  subscriptionRewardTokens: number;
  setAutoCheckAttempt: React.Dispatch<React.SetStateAction<number>>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  checkPaymentStatus: ReturnType<typeof useLazyCheckSubscriptionPaymentStatusQuery>[0];
  pollingRunIdRef: React.RefObject<number>;
  setIsAutoChecking: React.Dispatch<React.SetStateAction<boolean>>;
  paymentMethod: SubscriptionPaymentMethod;
  mountedRef: React.RefObject<boolean>;
}

export function useSubscriptionPaymentMonitoring({
  stopAutoCheck,
  clearStoredPayment,
  refetchPremiumOverview,
  refetchProfile,
  refetchWallet,
  setStage,
  setOrderNumber,
  setPaymentUrl,
  setMessage,
  subscriptionRewardTokens,
  setAutoCheckAttempt,
  showDialog,
  checkPaymentStatus,
  pollingRunIdRef,
  setIsAutoChecking,
  paymentMethod,
  mountedRef,
}: Params) {
  const finishPayment = useCallback(
    async (response: SubscriptionPaymentResponse) => {
      if (!isPaymentComplete(response)) return false;

      stopAutoCheck();
      await clearStoredPayment();
      await Promise.allSettled([refetchPremiumOverview(), refetchProfile(), refetchWallet()]);
      setStage('success');
      setOrderNumber(null);
      setPaymentUrl(null);
      setMessage(`Abonnement conducteur activé. ${subscriptionRewardTokens} jetons crédités.`);
      setAutoCheckAttempt(0);
      showDialog({
        variant: 'success',
        title: 'Abonnement actif',
        message: `Votre abonnement conducteur est actif et ${subscriptionRewardTokens} jetons ont été crédités.`,
      });
      return true;
    },
    [clearStoredPayment, refetchPremiumOverview, refetchProfile, refetchWallet, showDialog, stopAutoCheck, subscriptionRewardTokens],
  );

  const checkPaymentByOrderNumber = useCallback(
    async (
      nextOrderNumber: string,
      options?: {
        checkingStage?: PaymentStage;
        pendingStage?: PaymentStage;
        pendingMessage?: string;
        suppressErrorDialog?: boolean;
      },
    ): Promise<PaymentCheckOutcome> => {
      try {
        setOrderNumber(nextOrderNumber);
        setStage(options?.checkingStage ?? 'zwanga_activation');
        const response = await checkPaymentStatus(nextOrderNumber).unwrap();

        if (await finishPayment(response)) return 'success';

        if (isPaymentFailed(response)) {
          stopAutoCheck();
          await clearStoredPayment();
          setOrderNumber(null);
          setPaymentUrl(null);
          setStage('failed');
          setMessage(getPaymentFailureMessage(response.payment.message));
          return 'failed';
        }

        setStage(options?.pendingStage ?? 'operator_confirmation');
        setMessage(
          getPaymentStatusMessage(
            response.payment.message,
            options?.pendingMessage || 'Paiement en attente chez le prestataire. Nous continuons le suivi.',
          ),
        );
        return 'pending';
      } catch (error: any) {
        if (options?.suppressErrorDialog) {
          setStage(options.pendingStage ?? 'operator_confirmation');
          setMessage('La vérification prend plus de temps que prévu. La référence reste gardée.');
          return 'error';
        }

        showDialog({
          variant: 'danger',
          title: 'Vérification impossible',
          message: getApiErrorMessage(error, 'Impossible de vérifier ce paiement pour le moment.'),
        });
        return 'error';
      }
    },
    [checkPaymentStatus, clearStoredPayment, finishPayment, showDialog, stopAutoCheck],
  );

  const startAutoCheck = useCallback(
    (nextOrderNumber: string, initialMessage?: string | null) => {
      if (!nextOrderNumber) return;

      const runId = pollingRunIdRef.current + 1;
      pollingRunIdRef.current = runId;
      setIsAutoChecking(true);
      setAutoCheckAttempt(0);
      setStage(paymentMethod === 'card' ? 'zwanga_activation' : 'phone_confirmation');
      setMessage(
        initialMessage ||
          'Demande envoyée au téléphone. Confirmez avec votre PIN; Zwanga vérifiera ensuite.',
      );

      void (async () => {
        const deadline = Date.now() + AUTO_CHECK_TIMEOUT_MS;
        let attempt = 0;
        let nextDelay = AUTO_CHECK_INITIAL_DELAY_MS;

        while (mountedRef.current && pollingRunIdRef.current === runId) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0 || attempt >= AUTO_CHECK_MAX_ATTEMPTS) break;

          await wait(Math.min(nextDelay, remainingMs));
          if (!mountedRef.current || pollingRunIdRef.current !== runId) return;

          attempt += 1;
          setAutoCheckAttempt(attempt);
          const nextStage = paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation';
          setStage(nextStage);
          const outcome = await checkPaymentByOrderNumber(nextOrderNumber, {
            checkingStage: nextStage,
            pendingStage: nextStage,
            pendingMessage:
              attempt === 1
                ? 'Vérification en cours. Si la demande est sur votre téléphone, confirmez avec votre PIN.'
                : 'Toujours en attente côté opérateur. Une validation USSD peut prendre quelques instants.',
            suppressErrorDialog: true,
          });

          if (!mountedRef.current || pollingRunIdRef.current !== runId) return;
          if (outcome === 'success' || outcome === 'failed') {
            setIsAutoChecking(false);
            return;
          }

          nextDelay = AUTO_CHECK_INTERVAL_MS;
        }

        if (mountedRef.current && pollingRunIdRef.current === runId) {
          setIsAutoChecking(false);
          setStage('waiting_long');
          setMessage(
            'Nous avons arrêté le chargement automatique. Si vous avez confirmé le code USSD, appuyez sur Actualiser. Sinon vous pouvez relancer une nouvelle tentative.',
          );
        }
      })();
    },
    [checkPaymentByOrderNumber, paymentMethod],
  );

  return {
    checkPaymentByOrderNumber,
    startAutoCheck,
    finishPayment,
  };
}
