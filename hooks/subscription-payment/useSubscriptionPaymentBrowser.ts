import { getCardPaymentResultFromUrl } from '../../features/subscription-payment/paymentModel';
import { PaymentStage, PaymentCheckOutcome } from '../../features/subscription-payment/paymentTypes';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback } from 'react';
import { Linking } from 'react-native';

interface Params {
  setStage: React.Dispatch<React.SetStateAction<PaymentStage>>;
  checkPaymentByOrderNumber: (nextOrderNumber: string, options?: { checkingStage?: PaymentStage; pendingStage?: PaymentStage; pendingMessage?: string; suppressErrorDialog?: boolean; }) => Promise<PaymentCheckOutcome>;
  startAutoCheck: (nextOrderNumber: string, initialMessage?: string | null) => void;
  setMessage: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useSubscriptionPaymentBrowser({
  setStage,
  checkPaymentByOrderNumber,
  startAutoCheck,
  setMessage,
}: Params) {
  const openExternalUrl = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (browserError) {
      try {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
          return;
        }
      } catch (linkingError) {
        console.warn('[SubscriptionPayment] external URL fallback failed:', linkingError);
      }

      console.warn('[SubscriptionPayment] external URL open failed:', browserError);
      throw new Error("Impossible d'ouvrir le lien externe.");
    }
  };

  const openCardPaymentUrl = useCallback(
    async (nextPaymentUrl: string, nextOrderNumber: string | null, returnUrl: string) => {
      setStage('card_redirect');
      const result = await WebBrowser.openAuthSessionAsync(nextPaymentUrl, returnUrl);

      if (result.type !== 'success') {
        if (nextOrderNumber) {
          const pendingMessage = "Retour dans l'app detecté. Nous verifions le statut carte.";
          const outcome = await checkPaymentByOrderNumber(nextOrderNumber, {
            checkingStage: 'zwanga_activation',
            pendingStage: 'zwanga_activation',
            pendingMessage,
            suppressErrorDialog: true,
          });
          if (outcome === 'pending' || outcome === 'error') startAutoCheck(nextOrderNumber, pendingMessage);
          return;
        }
        setMessage('Le paiement par carte a été fermé avant le retour FlexPay.');
        return;
      }

      const paymentResult = getCardPaymentResultFromUrl(result.url);
      if ((paymentResult === 'cancel' || paymentResult === 'decline') && !nextOrderNumber) {
        setStage('failed');
        setMessage(
          paymentResult === 'cancel'
            ? 'Paiement carte annulé.'
            : 'Paiement carte refusé. Vérifiez votre carte ou essayez un autre moyen.',
        );
        return;
      }

      if (!nextOrderNumber) {

        setMessage('Retour carte reçu, mais la référence FlexPay est manquante.');
        return;
      }

      const pendingMessage =
        paymentResult === 'success'
          ? 'Paiement carte validé côté FlexPay, activation en cours.'
          : 'Retour carte reçu. Vérification du statut avant toute nouvelle tentative.';
      const outcome = await checkPaymentByOrderNumber(nextOrderNumber, {
        checkingStage: 'zwanga_activation',
        pendingStage: 'zwanga_activation',
        pendingMessage,
        suppressErrorDialog: true,
      });
      if (outcome === 'pending' || outcome === 'error') startAutoCheck(nextOrderNumber, pendingMessage);
    },
    [checkPaymentByOrderNumber, startAutoCheck],
  );

  return {
    openCardPaymentUrl,
    openExternalUrl,
  };
}
