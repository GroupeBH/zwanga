import { WalletAction, TopUpStage, TopUpCheckOutcome, StoredWalletTopUp } from '../../features/wallet/walletTypes';
import type { SubscriptionPaymentMethod } from '@/types';
import React, { useEffect } from 'react';

interface Params {
  isScreenActive: boolean;
  captureScope: () => () => boolean;
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
}

export function useWalletTopUpRecovery({
  isScreenActive,
  captureScope,
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
}: Params) {
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; pollingRunIdRef.current += 1; };
  }, [mountedRef, pollingRunIdRef]);

  useEffect(() => {
    if (!storageKey || !isScreenActive) return;
    if (restoredStorageKeyRef.current === storageKey) return;
    restoredStorageKeyRef.current = storageKey;

    let cancelled = false;
    const isCurrent = captureScope();
    void (async () => {
      const storedPayment = await readStoredTopUp();
      if (cancelled || !isCurrent() || !storedPayment?.orderNumber) return;

      applyStoredTopUp(storedPayment);
      const outcome = await checkTopUpByOrderNumber(storedPayment.orderNumber, {
        pendingMessage: "Référence de recharge retrouvée. Nous vérifions son statut.",
        suppressErrorDialog: true,
      });

      if (!cancelled && isCurrent() && (outcome === 'pending' || outcome === 'error')) {
        startTopUpAutoCheck(
          storedPayment.orderNumber,
          storedPayment.paymentMethod,
          "Référence de recharge retrouvée. Nous continuons le suivi.",
        );
      }
    })();

    return () => {
      cancelled = true;
      if (restoredStorageKeyRef.current === storageKey) restoredStorageKeyRef.current = null;
    };
  }, [
    applyStoredTopUp,
    checkTopUpByOrderNumber,
    readStoredTopUp,
    startTopUpAutoCheck,
    storageKey,
    isScreenActive,
    captureScope,
    restoredStorageKeyRef,
  ]);

  useEffect(() => {
    if (!returnedPaymentStatus || !isScreenActive) return;

    const returnStatusKey = `${storageKey}:${String(returnedPaymentStatus)}`;
    if (handledReturnStatusRef.current === returnStatusKey) return;
    handledReturnStatusRef.current = returnStatusKey;

    const normalizedStatus = String(returnedPaymentStatus).toLowerCase();
    const isCurrent = captureScope();
    void (async () => {
      const storedPayment = await readStoredTopUp();
      if (!isCurrent()) return;
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

      if (isCurrent() && (outcome === 'pending' || outcome === 'error')) {
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
    isScreenActive,
    captureScope,
    storageKey,
    handledReturnStatusRef,
    setActiveModal,
    setTopUpStage,
    setTopUpStatusMessage,
  ]);


  return {

  };
}
