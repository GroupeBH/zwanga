import {
  getPaymentStatusMessage,
  createWalletCardPaymentRedirectUrls,
  getCardPaymentResultFromUrl,
  isTopUpSucceeded,
  isTopUpFailed,
  parsePositiveAmount,
  normalizePhone,
} from '../../features/wallet/walletModel';
import {
  TopUpStage,
  TopUpCheckOutcome,
  StoredWalletTopUp,
  DRC_PAYMENT_PHONE_PREFIX,
  DRC_PAYMENT_PHONE_REGEX,
} from '../../features/wallet/walletTypes';
import { useDialog } from '@/components/ui/DialogProvider';
import { useInitiateWalletTopUpMutation } from '@/store/api/walletApi';
import type { SubscriptionPaymentMethod, WalletPaymentResponse } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { openExternalUrlSafely } from '@/utils/safeExternalUrl';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useRef } from 'react';
import { prepareWalletTopUpIntent, readWalletTopUpIntent, rememberWalletTopUpReference } from '@/services/walletTopUpIntent';
import { Keyboard } from 'react-native';

interface Params {
  userId: string | undefined;
  setTopUpAmount: React.Dispatch<React.SetStateAction<string>>;
  setTopUpMethod: React.Dispatch<React.SetStateAction<SubscriptionPaymentMethod>>;
  captureScope: () => () => boolean;
  setTopUpStage: React.Dispatch<React.SetStateAction<TopUpStage>>;
  setTopUpStatusMessage: React.Dispatch<React.SetStateAction<string | null>>;
  checkTopUpByOrderNumber: (orderNumber: string, options?: { pendingMessage?: string; suppressErrorDialog?: boolean; suppressSuccessDialog?: boolean; }) => Promise<TopUpCheckOutcome>;
  startTopUpAutoCheck: (orderNumber: string, paymentMethod: SubscriptionPaymentMethod, initialMessage?: string | null) => void;
  topUpOrderNumber: string | null;
  topUpMethod: SubscriptionPaymentMethod;
  topUpPaymentUrl: string | null;
  topUpAmount: string;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  isTopUpPhoneRequired: boolean;
  topUpPhone: string;
  setTopUpPhone: React.Dispatch<React.SetStateAction<string>>;
  stopTopUpAutoCheck: () => void;
  setTopUpAutoCheckAttempt: React.Dispatch<React.SetStateAction<number>>;
  initiateWalletTopUp: ReturnType<typeof useInitiateWalletTopUpMutation>[0];
  setTopUpOrderNumber: React.Dispatch<React.SetStateAction<string | null>>;
  setTopUpPaymentUrl: React.Dispatch<React.SetStateAction<string | null>>;
  persistStoredTopUp: (payment: Omit<StoredWalletTopUp, "createdAt" | "userId">) => Promise<void>;
  finishSuccessfulTopUp: (response: WalletPaymentResponse, options?: { suppressDialog?: boolean; }) => Promise<boolean>;
  handleFailedTopUp: (response: WalletPaymentResponse, options?: { suppressDialog?: boolean; }) => Promise<boolean>;
  refreshAll: () => Promise<void>;
}

export function useWalletTopUpActions({
  userId, setTopUpAmount, setTopUpMethod,
  captureScope,
  setTopUpStage,
  setTopUpStatusMessage,
  checkTopUpByOrderNumber,
  startTopUpAutoCheck,
  topUpOrderNumber,
  topUpMethod,
  topUpPaymentUrl,
  topUpAmount,
  showDialog,
  isTopUpPhoneRequired,
  topUpPhone,
  setTopUpPhone,
  stopTopUpAutoCheck,
  setTopUpAutoCheckAttempt,
  initiateWalletTopUp,
  setTopUpOrderNumber,
  setTopUpPaymentUrl,
  persistStoredTopUp,
  finishSuccessfulTopUp,
  handleFailedTopUp,
  refreshAll,
}: Params) {
  const submitting = useRef(false);
  useEffect(() => {
    if (!userId || topUpOrderNumber) return;
    let cancelled = false;
    const isCurrent = captureScope();
    void readWalletTopUpIntent(userId).then(intent => {
      if (!intent || cancelled || !isCurrent() || submitting.current) return;
      setTopUpAmount(String(intent.amount));
      setTopUpMethod(intent.method);
      if (intent.phone) setTopUpPhone(intent.phone);
      setTopUpStage('waiting_long');
      setTopUpStatusMessage('Recharge en attente. Appuyez sur Recharger pour reprendre la même opération sans nouveau débit.');
    }).catch(() => {
      if (!cancelled && isCurrent()) setTopUpStatusMessage('Recharge en attente illisible. Contactez le support avant de réessayer.');
    });
    return () => { cancelled = true; };
  }, [userId, topUpOrderNumber, captureScope, setTopUpAmount, setTopUpMethod, setTopUpPhone, setTopUpStage, setTopUpStatusMessage]);
  const openTopUpCardPaymentUrl = useCallback(
    async (
      paymentUrl: string,
      orderNumber: string | null,
      returnUrl: string,
    ) => {
      const isCurrent = captureScope();
      if (!isCurrent()) return;
      setTopUpStage('card_redirect');
      setTopUpStatusMessage('Page carte FlexPay ouverte. Finalisez le paiement; nous suivrons le retour.');

      const result = await WebBrowser.openAuthSessionAsync(paymentUrl, returnUrl);
      if (!isCurrent()) return; // Stored reference is recovered on foreground, without a second charge.
      if (result.type !== 'success') {
        if (orderNumber) {
          const pendingMessage = "Retour dans l'app détecté. Vérification du paiement carte en cours.";
          const outcome = await checkTopUpByOrderNumber(orderNumber, {
            pendingMessage,
            suppressErrorDialog: true,
          });
          if (outcome === 'pending' || outcome === 'error') {
            startTopUpAutoCheck(orderNumber, 'card', pendingMessage);
          }
          return;
        }

        setTopUpStage('waiting_long');
        setTopUpStatusMessage('Le paiement carte a été fermé avant le retour FlexPay.');
        return;
      }

      const paymentResult = getCardPaymentResultFromUrl(result.url);
      if ((paymentResult === 'cancel' || paymentResult === 'decline') && !orderNumber) {
        setTopUpStage('failed');
        setTopUpStatusMessage(
          paymentResult === 'cancel'
            ? 'Paiement carte annulé. Aucun jeton n’a été ajouté.'
            : "Paiement par carte refusé. Vérifiez votre carte ou choisissez un autre moyen de paiement.",
        );
        return;
      }

      if (!orderNumber) {
        setTopUpStage('waiting_long');
        setTopUpStatusMessage('Retour carte reçu, mais la référence FlexPay est manquante.');
        return;
      }

      const pendingMessage =
        paymentResult === 'success'
          ? 'Paiement carte validé côté FlexPay. Crédit des jetons en cours.'
          : 'Retour carte reçu. Nous vérifions le statut avant toute nouvelle tentative.';
      const outcome = await checkTopUpByOrderNumber(orderNumber, {
        pendingMessage,
        suppressErrorDialog: true,
      });
      if (outcome === 'pending' || outcome === 'error') {
        startTopUpAutoCheck(orderNumber, 'card', pendingMessage);
      }
    },
    [captureScope, checkTopUpByOrderNumber, startTopUpAutoCheck, setTopUpStage, setTopUpStatusMessage],
  );

  const handleTopUp = async () => {
    const isCurrent = captureScope();
    if (!isCurrent() || submitting.current || !userId) return;
    Keyboard.dismiss();

    if (topUpOrderNumber) {
      if (topUpMethod === 'card' && topUpPaymentUrl) {
        const cardRedirectUrls = createWalletCardPaymentRedirectUrls();
        await openTopUpCardPaymentUrl(
          topUpPaymentUrl,
          topUpOrderNumber,
          cardRedirectUrls.returnUrl,
        );
        return;
      }

      const outcome = await checkTopUpByOrderNumber(topUpOrderNumber, {
        pendingMessage: 'Actualisation du statut de recharge en cours.',
        suppressErrorDialog: true,
      });
      if (outcome === 'pending' || outcome === 'error') {
        startTopUpAutoCheck(topUpOrderNumber, topUpMethod, 'Nous continuons le suivi de cette recharge.');
      }
      return;
    }

    const amount = parsePositiveAmount(topUpAmount);
    if (!amount || amount < 1) {
      showDialog({
        variant: 'warning',
        title: 'Nombre de jetons invalide',
        message: 'La recharge minimum est de 1 jeton.',
      });
      return;
    }

    const formattedPhone = isTopUpPhoneRequired ? normalizePhone(topUpPhone) : undefined;
    if (isTopUpPhoneRequired && !DRC_PAYMENT_PHONE_REGEX.test(formattedPhone ?? '')) {
      setTopUpPhone(DRC_PAYMENT_PHONE_PREFIX);
      showDialog({
        variant: 'warning',
        title: 'Numéro requis',
        message: 'Entrez un numéro Mobile Money congolais, par exemple +243891234567.',
      });
      return;
    }

    submitting.current = true;
    let submitted = false;
    try {
      stopTopUpAutoCheck();
      setTopUpStage('preparing');
      setTopUpStatusMessage('Création de la référence de paiement. Aucun débit n’est relancé si une référence existe déjà.');
      setTopUpAutoCheckAttempt(0);

      const cardRedirectUrls = topUpMethod === 'card' ? createWalletCardPaymentRedirectUrls() : null;
      const intent = await prepareWalletTopUpIntent({ userId, amount, method: topUpMethod, phone: formattedPhone });
      if (!isCurrent()) return;
      submitted = true;
      const response = await initiateWalletTopUp({
        idempotencyKey: intent.idempotencyKey,
        amount,
        method: topUpMethod,
        phone: formattedPhone,
        ...(cardRedirectUrls
          ? {
              approveUrl: cardRedirectUrls.approveUrl,
              cancelUrl: cardRedirectUrls.cancelUrl,
              declineUrl: cardRedirectUrls.declineUrl,
            }
          : {}),
      }).unwrap();

      await rememberWalletTopUpReference(intent, response.payment.reference);

      if (response.payment.orderNumber) {
        await persistStoredTopUp({
          amount,
          message: response.payment.message,
          orderNumber: response.payment.orderNumber,
          paymentMethod: topUpMethod,
          paymentUrl: response.payment.paymentUrl,
        });
      }
      // Always retain the ORIGINAL account's financial reference, even after leaving.
      if (!isCurrent()) return;
      if (formattedPhone) setTopUpPhone(formattedPhone);
      setTopUpOrderNumber(response.payment.orderNumber);
      setTopUpPaymentUrl(response.payment.paymentUrl);

      if (isTopUpSucceeded(response)) {
        await finishSuccessfulTopUp(response);
        return;
      }

      if (isTopUpFailed(response)) {
        await handleFailedTopUp(response);
        return;
      }

      if (response.payment.paymentUrl) {
        if (topUpMethod === 'card' && cardRedirectUrls) {
          await openTopUpCardPaymentUrl(
            response.payment.paymentUrl,
            response.payment.orderNumber,
            cardRedirectUrls.returnUrl,
          );
          return;
        }

        await openExternalUrlSafely(response.payment.paymentUrl, {
          logLabel: 'WalletTopUp',
        });
        if (!isCurrent()) return;
      }

      const pendingMessage = getPaymentStatusMessage(
        response.payment.message,
        topUpMethod === 'card'
          ? 'Finalisez le paiement carte. Nous vérifierons ensuite la recharge.'
          : 'Confirmez la demande Mobile Money avec votre PIN. Le solde sera actualisé automatiquement.',
      );
      setTopUpStage(topUpMethod === 'card' ? 'checking' : 'phone_confirmation');
      setTopUpStatusMessage(pendingMessage);
      void Promise.resolve().then(refreshAll).catch(() => undefined);

      if (response.payment.orderNumber) {
        startTopUpAutoCheck(response.payment.orderNumber, topUpMethod, pendingMessage);
      }
    } catch (error) {
      if (!isCurrent()) return;
      setTopUpStage(submitted ? 'waiting_long' : 'failed');
      if (submitted) setTopUpStatusMessage('Confirmation indisponible. Réessayez pour reprendre la même recharge, sans créer un nouveau paiement.');
      showDialog({
        variant: submitted ? 'warning' : 'danger',
        title: submitted ? 'Recharge à vérifier' : 'Recharge impossible',
        message: submitted
          ? 'La recharge peut être en cours. Réessayez avec les mêmes informations pour retrouver son statut. Ne lancez pas un autre paiement.'
          : getApiErrorMessage(error, 'Impossible de lancer la recharge pour le moment.'),
      });
    } finally {
      submitting.current = false;
    }
  };

  const handleCheckTopUpStatus = async () => {
    if (!topUpOrderNumber || !captureScope()()) return;

    stopTopUpAutoCheck();
    const outcome = await checkTopUpByOrderNumber(topUpOrderNumber, {
      pendingMessage: 'Actualisation du statut de recharge en cours.',
    });
    if (outcome === 'pending' || outcome === 'error') {
      startTopUpAutoCheck(topUpOrderNumber, topUpMethod, 'Nous continuons le suivi de cette recharge.');
    }
  };

  return {
    handleTopUp,
    handleCheckTopUpStatus,
  };
}
