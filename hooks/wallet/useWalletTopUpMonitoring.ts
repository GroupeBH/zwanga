import { getPaymentStatusMessage, wait, isTopUpSucceeded, isTopUpFailed } from '../../features/wallet/walletModel';
import {
  WalletAction,
  TopUpStage,
  TopUpCheckOutcome,
  AUTO_CHECK_INITIAL_DELAY_MS,
  AUTO_CHECK_INTERVAL_MS,
  AUTO_CHECK_TIMEOUT_MS,
  AUTO_CHECK_MAX_ATTEMPTS,
} from '../../features/wallet/walletTypes';
import { useDialog } from '@/components/ui/DialogProvider';
import { useLazyCheckWalletTopUpStatusQuery } from '@/store/api/walletApi';
import type { SubscriptionPaymentMethod, WalletPaymentResponse } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import React, { useCallback, useEffect, useRef } from 'react';

interface Params {
  captureScope: () => () => boolean;
  stopTopUpAutoCheck: () => void;
  clearStoredTopUp: () => Promise<void>;
  setTopUpOrderNumber: React.Dispatch<React.SetStateAction<string | null>>;
  setTopUpPaymentUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setTopUpStage: React.Dispatch<React.SetStateAction<TopUpStage>>;
  setTopUpAutoCheckAttempt: React.Dispatch<React.SetStateAction<number>>;
  setTopUpStatusMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveModal: React.Dispatch<React.SetStateAction<WalletAction | null>>;
  refreshAll: () => Promise<void>;
  mountedRef: React.RefObject<boolean>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  checkWalletTopUpStatus: ReturnType<typeof useLazyCheckWalletTopUpStatusQuery>[0];
  pollingRunIdRef: React.RefObject<number>;
  setIsAutoCheckingTopUp: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useWalletTopUpMonitoring({
  captureScope,
  stopTopUpAutoCheck,
  clearStoredTopUp,
  setTopUpOrderNumber,
  setTopUpPaymentUrl,
  setTopUpStage,
  setTopUpAutoCheckAttempt,
  setTopUpStatusMessage,
  setActiveModal,
  refreshAll,
  mountedRef,
  showDialog,
  checkWalletTopUpStatus,
  pollingRunIdRef,
  setIsAutoCheckingTopUp,
}: Params) {
  const activeRead = useRef<ReturnType<Params['checkWalletTopUpStatus']> | null>(null);
  const inFlight = useRef<{ orderNumber: string; current: () => boolean; promise: Promise<TopUpCheckOutcome> } | null>(null);
  useEffect(() => () => {
    pollingRunIdRef.current += 1;
    activeRead.current?.abort();
    activeRead.current = null;
    inFlight.current = null;
    // This is a read cancellation, never a payment cancellation.
    if (mountedRef.current) setIsAutoCheckingTopUp(false);
  }, [captureScope, mountedRef, pollingRunIdRef, setIsAutoCheckingTopUp]);
  const finishSuccessfulTopUp = useCallback(
    async (
      response: WalletPaymentResponse,
      options: { suppressDialog?: boolean } = {},
    ) => {
      const isCurrent = captureScope();
      if (!isCurrent()) return false;
      stopTopUpAutoCheck();
      await clearStoredTopUp();
      if (!isCurrent()) return false;
      setTopUpOrderNumber(null);
      setTopUpPaymentUrl(null);
      setTopUpStage('success');
      setTopUpAutoCheckAttempt(0);
      setTopUpStatusMessage('Recharge confirmée. Votre solde de jetons est en cours d’actualisation.');
      setActiveModal(null);
      void Promise.resolve().then(refreshAll).catch(() => undefined);

      if (!options.suppressDialog) {
        showDialog({
          variant: 'success',
          title: 'Recharge validée',
          message: getPaymentStatusMessage(
            response.payment.message,
            'Votre paiement est confirmé. Les jetons ont été crédités sur votre compte.',
          ),
        });
      }

      return true;
    },
    [captureScope, clearStoredTopUp, refreshAll, showDialog, stopTopUpAutoCheck, setActiveModal,
      setTopUpAutoCheckAttempt, setTopUpOrderNumber, setTopUpPaymentUrl, setTopUpStage, setTopUpStatusMessage],
  );

  const handleFailedTopUp = useCallback(
    async (
      response: WalletPaymentResponse,
      options: { suppressDialog?: boolean } = {},
    ) => {
      const isCurrent = captureScope();
      if (!isCurrent()) return false;
      stopTopUpAutoCheck();
      await clearStoredTopUp();
      if (!isCurrent()) return false;
      setTopUpOrderNumber(null);
      setTopUpPaymentUrl(null);
      setTopUpStage('failed');
      setTopUpAutoCheckAttempt(0);
      const message = getPaymentStatusMessage(
        response.payment.message,
        "La recharge n'a pas été confirmée. Aucun jeton n'a été ajouté.",
      );
      setTopUpStatusMessage(message);
      void Promise.resolve().then(refreshAll).catch(() => undefined);

      if (!options.suppressDialog) {
        showDialog({
          variant: 'danger',
          title: 'Recharge non confirmée',
          message,
        });
      }

      return true;
    },
    [captureScope, clearStoredTopUp, refreshAll, showDialog, stopTopUpAutoCheck,
      setTopUpAutoCheckAttempt, setTopUpOrderNumber, setTopUpPaymentUrl, setTopUpStage, setTopUpStatusMessage],
  );

  const checkTopUpByOrderNumber = useCallback(
    async (
      orderNumber: string,
      options: {
        pendingMessage?: string;
        suppressErrorDialog?: boolean;
        suppressSuccessDialog?: boolean;
      } = {},
    ): Promise<TopUpCheckOutcome> => {
      const isCurrent = captureScope();
      if (!isCurrent()) return 'error';
      if (inFlight.current?.current()) return inFlight.current.orderNumber === orderNumber ? inFlight.current.promise : 'error';
      const run = { orderNumber, current: isCurrent, promise: Promise.resolve<TopUpCheckOutcome>('error') };
      inFlight.current = run;
      run.promise = (async (): Promise<TopUpCheckOutcome> => {
        try {
          setTopUpOrderNumber(orderNumber);
          setTopUpStage('checking');
          const request = checkWalletTopUpStatus(orderNumber);
          activeRead.current = request;
          const response = await request.unwrap();
          if (!isCurrent()) return 'error';

          if (isTopUpSucceeded(response)) {
            await finishSuccessfulTopUp(response, {
              suppressDialog: options.suppressSuccessDialog,
            });
            return 'success';
          }

          if (isTopUpFailed(response)) {
            await handleFailedTopUp(response, {
              suppressDialog: options.suppressErrorDialog,
            });
            return 'failed';
          }

          // A pending provider check does not change the balance or ledger.
          setTopUpStage(response.payment.method === 'card' ? 'checking' : 'phone_confirmation');
          setTopUpStatusMessage(
            getPaymentStatusMessage(
              response.payment.message,
              options.pendingMessage ||
                'Paiement en attente chez le prestataire. Nous continuons la vérification.',
            ),
          );
          return 'pending';
        } catch (error) {
          if (!isCurrent()) return 'error';
          setTopUpStage('waiting_long');
          if (options.suppressErrorDialog) {
            setTopUpStage('waiting_long');
            setTopUpStatusMessage(
              'La vérification prend plus de temps que prévu. La référence reste gardée.',
            );
            return 'error';
          }

          showDialog({
            variant: 'danger',
            title: 'Vérification impossible',
            message: getApiErrorMessage(error, 'Impossible de vérifier cette recharge.'),
          });
          return 'error';
        } finally {
          if (inFlight.current === run) {
            inFlight.current = null;
            activeRead.current = null;
          }
        }
      })();
      return run.promise;
    },
    [captureScope, checkWalletTopUpStatus, finishSuccessfulTopUp, handleFailedTopUp, setTopUpOrderNumber, setTopUpStage, setTopUpStatusMessage, showDialog],
  );

  const startTopUpAutoCheck = useCallback(
    (
      orderNumber: string,
      paymentMethod: SubscriptionPaymentMethod,
      initialMessage?: string | null,
    ) => {
      const isCurrent = captureScope();
      if (!orderNumber || !isCurrent()) return;

      const runId = pollingRunIdRef.current + 1;
      pollingRunIdRef.current = runId;
      setIsAutoCheckingTopUp(true);
      setTopUpAutoCheckAttempt(0);
      setTopUpStage(paymentMethod === 'card' ? 'checking' : 'phone_confirmation');
      setTopUpStatusMessage(
        initialMessage ||
          (paymentMethod === 'card'
            ? 'Paiement carte ouvert. Nous vérifierons le statut au retour.'
            : 'Demande envoyée au téléphone. Confirmez avec votre PIN Mobile Money.'),
      );

      void (async () => {
        const deadline = Date.now() + AUTO_CHECK_TIMEOUT_MS;
        let attempt = 0;
        let nextDelay = AUTO_CHECK_INITIAL_DELAY_MS;

        while (isCurrent() && pollingRunIdRef.current === runId) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0 || attempt >= AUTO_CHECK_MAX_ATTEMPTS) break;

          await wait(Math.min(nextDelay, remainingMs));
          if (!isCurrent() || pollingRunIdRef.current !== runId) return;

          attempt += 1;
          setTopUpAutoCheckAttempt(attempt);
          const outcome = await checkTopUpByOrderNumber(orderNumber, {
            pendingMessage:
              attempt === 1
                ? 'Vérification en cours. Si la demande est sur votre téléphone, confirmez avec votre PIN.'
                : 'Toujours en attente côté opérateur. La confirmation peut prendre quelques instants.',
            suppressErrorDialog: true,
          });

          if (!isCurrent() || pollingRunIdRef.current !== runId) return;
          if (outcome === 'success' || outcome === 'failed') {
            setIsAutoCheckingTopUp(false);
            return;
          }

          nextDelay = AUTO_CHECK_INTERVAL_MS;
        }

        if (isCurrent() && pollingRunIdRef.current === runId) {
          setIsAutoCheckingTopUp(false);
          setTopUpStage('waiting_long');
          setTopUpStatusMessage(
            'La recharge est encore en traitement. Si votre argent a été débité, appuyez sur Vérifier la recharge au lieu de relancer un paiement.',
          );
        }
      })();
    },
    [captureScope, checkTopUpByOrderNumber, pollingRunIdRef, setIsAutoCheckingTopUp, setTopUpAutoCheckAttempt, setTopUpStage, setTopUpStatusMessage],
  );

  return {
    checkTopUpByOrderNumber,
    startTopUpAutoCheck,
    finishSuccessfulTopUp,
    handleFailedTopUp,
  };
}
