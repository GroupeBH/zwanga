import { WalletAction, TopUpStage, TopUpCheckOutcome, StoredWalletTopUp } from '../../features/wallet/walletTypes';
import type { SubscriptionPaymentMethod } from '@/types';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';

interface Params {
  mountedRef: React.RefObject<boolean>;
  pollingRunIdRef: React.RefObject<number>;
  storageKey: string | null;
  restoredStorageKeyRef: React.RefObject<string | null>;
  readStoredTopUp: () => Promise<StoredWalletTopUp | null>;
  applyStoredTopUp: (storedPayment: StoredWalletTopUp) => void;
  checkTopUpByOrderNumber: (orderNumber: string, options?: { pendingMessage?: string; suppressErrorDialog?: boolean; suppressSuccessDialog?: boolean; }) => Promise<TopUpCheckOutcome>;
  startTopUpAutoCheck: (orderNumber: string, paymentMethod: SubscriptionPaymentMethod, initialMessage?: string | null) => void;
  returnedPaymentStatus: string | undefined;
  topUpOrderNumber: string | null;
  handledReturnStatusRef: React.RefObject<string | null>;
  topUpMethod: SubscriptionPaymentMethod;
  setActiveModal: React.Dispatch<React.SetStateAction<WalletAction | null>>;
  setTopUpStage: React.Dispatch<React.SetStateAction<TopUpStage>>;
  setTopUpStatusMessage: React.Dispatch<React.SetStateAction<string | null>>;
  topUpStage: TopUpStage;
  isAutoCheckingTopUp: boolean;
}

export function useWalletTopUpRecovery({
  mountedRef,
  pollingRunIdRef,
  storageKey,
  restoredStorageKeyRef,
  readStoredTopUp,
  applyStoredTopUp,
  checkTopUpByOrderNumber,
  startTopUpAutoCheck,
  returnedPaymentStatus,
  topUpOrderNumber,
  handledReturnStatusRef,
  topUpMethod,
  setActiveModal,
  setTopUpStage,
  setTopUpStatusMessage,
  topUpStage,
  isAutoCheckingTopUp,
}: Params) {
  useEffect(() => () => {
    mountedRef.current = false;
    pollingRunIdRef.current += 1;
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    if (restoredStorageKeyRef.current === storageKey) return;
    restoredStorageKeyRef.current = storageKey;

    let cancelled = false;
    void (async () => {
      const storedPayment = await readStoredTopUp();
      if (cancelled || !storedPayment?.orderNumber) return;

      applyStoredTopUp(storedPayment);
      const outcome = await checkTopUpByOrderNumber(storedPayment.orderNumber, {
        pendingMessage: "Référence de recharge retrouvée. Nous vérifions son statut.",
        suppressErrorDialog: true,
      });

      if (!cancelled && (outcome === 'pending' || outcome === 'error')) {
        startTopUpAutoCheck(
          storedPayment.orderNumber,
          storedPayment.paymentMethod,
          "Référence de recharge retrouvée. Nous continuons le suivi.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyStoredTopUp,
    checkTopUpByOrderNumber,
    readStoredTopUp,
    startTopUpAutoCheck,
    storageKey,
  ]);

  useEffect(() => {
    if (!returnedPaymentStatus) return;

    const returnStatusKey = `${String(returnedPaymentStatus)}:${topUpOrderNumber ?? 'stored'}`;
    if (handledReturnStatusRef.current === returnStatusKey) return;
    handledReturnStatusRef.current = returnStatusKey;

    const normalizedStatus = String(returnedPaymentStatus).toLowerCase();
    void (async () => {
      const storedPayment = await readStoredTopUp();
      const orderNumber = topUpOrderNumber ?? storedPayment?.orderNumber;
      const paymentMethod = storedPayment?.paymentMethod ?? topUpMethod;
      setActiveModal('top_up');

      if (!orderNumber) {
        if (normalizedStatus === 'cancel' || normalizedStatus === 'decline') {
          setTopUpStage('failed');
          setTopUpStatusMessage(
            normalizedStatus === 'cancel'
              ? 'Paiement carte annulé. Aucun jeton n’a été ajouté.'
              : "Paiement par carte refusé. Vérifiez votre carte ou choisissez un autre moyen de paiement.",
          );
        } else {
          setTopUpStage('waiting_long');
          setTopUpStatusMessage('Retour carte reçu. Actualisez le statut avant de relancer un paiement.');
        }
        return;
      }

      const pendingMessage =
        normalizedStatus === 'success'
          ? 'Retour carte reçu. Crédit des jetons en cours de vérification.'
          : 'Retour carte reçu. Nous vérifions le statut avant toute nouvelle tentative.';
      const outcome = await checkTopUpByOrderNumber(orderNumber, {
        pendingMessage,
        suppressErrorDialog: true,
      });

      if (outcome === 'pending' || outcome === 'error') {
        startTopUpAutoCheck(orderNumber, paymentMethod, pendingMessage);
      }
    })();
  }, [
    checkTopUpByOrderNumber,
    readStoredTopUp,
    returnedPaymentStatus,
    startTopUpAutoCheck,
    topUpMethod,
    topUpOrderNumber,
  ]);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (
        nextState !== 'active' ||
        !topUpOrderNumber ||
        topUpStage === 'success' ||
        topUpStage === 'failed'
      ) {
        return;
      }

      void checkTopUpByOrderNumber(topUpOrderNumber, {
        pendingMessage: "Retour dans l'app détecté. Nous actualisons la recharge.",
        suppressErrorDialog: true,
      }).then((outcome) => {
        if (
          mountedRef.current &&
          (outcome === 'pending' || outcome === 'error') &&
          !isAutoCheckingTopUp
        ) {
          startTopUpAutoCheck(
            topUpOrderNumber,
            topUpMethod,
            "Retour dans l'app détecté. Nous reprenons le suivi.",
          );
        }
      });
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [
    checkTopUpByOrderNumber,
    isAutoCheckingTopUp,
    startTopUpAutoCheck,
    topUpMethod,
    topUpOrderNumber,
    topUpStage,
  ]);

  return {

  };
}
