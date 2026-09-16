import {
  getCardPaymentResultFromUrl
} from '@/features/profile/profileModel';
import * as WebBrowser from 'expo-web-browser';
import { useCallback } from 'react';
import type { useProfileSubscriptionMonitor } from './useProfileSubscriptionMonitor';
import type { useProfileSubscriptionState } from './useProfileSubscriptionState';

type Props = Pick<ReturnType<typeof useProfileSubscriptionState>,
  | 'setSubscriptionPaymentMessage'
  | 'setSubscriptionPaymentStage'
> & Pick<ReturnType<typeof useProfileSubscriptionMonitor>,
  | 'checkSubscriptionPaymentByOrderNumber'
  | 'startSubscriptionPaymentAutoCheck'
>;

WebBrowser.maybeCompleteAuthSession();

export function useProfileSubscriptionCard({
  checkSubscriptionPaymentByOrderNumber,
  setSubscriptionPaymentMessage,
  setSubscriptionPaymentStage,
  startSubscriptionPaymentAutoCheck,
}: Props) {
  const openCardPaymentUrl = useCallback(
    async (paymentUrl: string, orderNumber: string | null, returnUrl: string) => {
      setSubscriptionPaymentStage('card_redirect');
      const result = await WebBrowser.openAuthSessionAsync(paymentUrl, returnUrl);

      if (result.type !== 'success') {
        if (orderNumber) {
          const pendingMessage =
            "Retour dans l'app détecté. Nous vérifions le statut du paiement par carte chez FlexPay.";
          setSubscriptionPaymentStage('zwanga_activation');
          setSubscriptionPaymentMessage(pendingMessage);
          const outcome = await checkSubscriptionPaymentByOrderNumber(orderNumber, {
            checkingStage: 'zwanga_activation',
            pendingStage: 'zwanga_activation',
            pendingMessage,
            suppressErrorDialog: true,
            silentErrorMessage:
              'Retour détecté, mais la vérification prend plus de temps que prévu. La référence reste gardée.',
          });

          if (outcome === 'pending' || outcome === 'error') {
            startSubscriptionPaymentAutoCheck(orderNumber, pendingMessage);
          }
          return;
        }

        setSubscriptionPaymentMessage(
          'Le paiement par carte a été fermé avant le retour FlexPay. Vous pouvez rouvrir la page ou vérifier le statut.',
        );
        return;
      }

      const paymentResult = getCardPaymentResultFromUrl(result.url);
      if (paymentResult === 'cancel') {
        if (orderNumber) {
          const pendingMessage = 'Retour carte reçu. Vérification FlexPay avant toute nouvelle tentative.';
          const outcome = await checkSubscriptionPaymentByOrderNumber(orderNumber, {
            checkingStage: 'zwanga_activation',
            pendingStage: 'zwanga_activation',
            pendingMessage,
            suppressErrorDialog: true,
            silentErrorMessage:
              'Retour de paiement par carte reçu, mais la vérification prend plus de temps que prévu. La référence reste gardée.',
          });
          if (outcome === 'pending' || outcome === 'error') {
            startSubscriptionPaymentAutoCheck(orderNumber, pendingMessage);
          }
          return;
        }

        setSubscriptionPaymentStage('failed');
        setSubscriptionPaymentMessage('Paiement par carte annulé. Vous pouvez relancer le paiement.');
        return;
      }

      if (paymentResult === 'decline') {
        if (orderNumber) {
          const pendingMessage = 'Retour carte reçu. Vérification FlexPay avant toute nouvelle tentative.';
          const outcome = await checkSubscriptionPaymentByOrderNumber(orderNumber, {
            checkingStage: 'zwanga_activation',
            pendingStage: 'zwanga_activation',
            pendingMessage,
            suppressErrorDialog: true,
            silentErrorMessage:
              'Retour de paiement par carte reçu, mais la vérification prend plus de temps que prévu. La référence reste gardée.',
          });
          if (outcome === 'pending' || outcome === 'error') {
            startSubscriptionPaymentAutoCheck(orderNumber, pendingMessage);
          }
          return;
        }

        setSubscriptionPaymentStage('failed');
        setSubscriptionPaymentMessage('Paiement par carte refusé. Vérifiez votre carte ou essayez un autre moyen.');
        return;
      }

      if (!orderNumber) {
        setSubscriptionPaymentMessage(
          'Retour du paiement par carte reçu, mais la référence FlexPay est manquante. Revenez dans un instant et vérifiez le statut.',
        );
        return;
      }

      const outcome = await checkSubscriptionPaymentByOrderNumber(orderNumber, {
        checkingStage: 'zwanga_activation',
        pendingStage: 'zwanga_activation',
        pendingMessage:
          paymentResult === 'success'
            ? 'Paiement par carte validé côté FlexPay, activation en cours.'
            : 'Retour carte reçu. Vérification FlexPay en cours avant activation.',
      });

      if (outcome === 'pending' || outcome === 'error') {
        startSubscriptionPaymentAutoCheck(
          orderNumber,
          "Retour de paiement par carte reçu. Nous vérifions automatiquement l'activation.",
        );
      }
    },
    [checkSubscriptionPaymentByOrderNumber, setSubscriptionPaymentMessage, setSubscriptionPaymentStage, startSubscriptionPaymentAutoCheck],
  );
  return {
    openCardPaymentUrl,
  };
}
