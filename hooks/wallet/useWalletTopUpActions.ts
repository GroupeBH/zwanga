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
import React, { useCallback } from 'react';
import { Keyboard } from 'react-native';

interface Params {
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
  const openTopUpCardPaymentUrl = useCallback(
    async (
      paymentUrl: string,
      orderNumber: string | null,
      returnUrl: string,
    ) => {
      setTopUpStage('card_redirect');
      setTopUpStatusMessage('Page carte FlexPay ouverte. Finalisez le paiement; nous suivrons le retour.');

      const result = await WebBrowser.openAuthSessionAsync(paymentUrl, returnUrl);
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
    [checkTopUpByOrderNumber, startTopUpAutoCheck],
  );

  const handleTopUp = async () => {
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
    if (!amount) {
      showDialog({
        variant: 'warning',
        title: 'Nombre de jetons invalide',
        message: 'Entrez un nombre de jetons supérieur à 0.',
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

    try {
      stopTopUpAutoCheck();
      setTopUpStage('preparing');
      setTopUpStatusMessage('Création de la référence de paiement. Aucun débit n’est relancé si une référence existe déjà.');
      setTopUpAutoCheckAttempt(0);

      const cardRedirectUrls = topUpMethod === 'card' ? createWalletCardPaymentRedirectUrls() : null;
      const response = await initiateWalletTopUp({
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

      if (formattedPhone) setTopUpPhone(formattedPhone);
      setTopUpOrderNumber(response.payment.orderNumber);
      setTopUpPaymentUrl(response.payment.paymentUrl);

      if (response.payment.orderNumber) {
        await persistStoredTopUp({
          amount,
          message: response.payment.message,
          orderNumber: response.payment.orderNumber,
          paymentMethod: topUpMethod,
          paymentUrl: response.payment.paymentUrl,
        });
      }

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
      }

      const pendingMessage = getPaymentStatusMessage(
        response.payment.message,
        topUpMethod === 'card'
          ? 'Finalisez le paiement carte. Nous vérifierons ensuite la recharge.'
          : 'Confirmez la demande Mobile Money avec votre PIN. Le solde sera actualisé automatiquement.',
      );
      setTopUpStage(topUpMethod === 'card' ? 'checking' : 'phone_confirmation');
      setTopUpStatusMessage(pendingMessage);
      await refreshAll();

      if (response.payment.orderNumber) {
        startTopUpAutoCheck(response.payment.orderNumber, topUpMethod, pendingMessage);
      }
    } catch (error) {
      setTopUpStage('failed');
      showDialog({
        variant: 'danger',
        title: 'Recharge impossible',
        message: getApiErrorMessage(error, 'Impossible de lancer la recharge pour le moment.'),
      });
    }
  };

  const handleCheckTopUpStatus = async () => {
    if (!topUpOrderNumber) return;

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
