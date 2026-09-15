import {
  createCardPaymentRedirectUrls,
  formatCongolesePaymentPhone,
  isValidCongolesePaymentPhone,
  getPaymentFailureMessage,
  getPaymentStatusMessage,
  isPaymentFailed,
  isNetworkOrTimeoutError,
  getPaymentMethodForChannel,
} from '../../features/subscription-payment/paymentModel';
import {
  PaymentChannel,
  PaymentStage,
  PaymentCheckOutcome,
  StoredPayment,
  DRC_MOBILE_MONEY_PREFIX,
} from '../../features/subscription-payment/paymentTypes';
import { useDialog } from '@/components/ui/DialogProvider';
import { useSubscribeToProMutation, useSubscribeToProWithPointsMutation } from '@/store/api/subscriptionApi';
import type { SubscriptionPaymentMethod, SubscriptionPaymentResponse } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import React, { useCallback } from 'react';
import { Keyboard } from 'react-native';

interface Params {
  isDriver: boolean;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  isPremiumActive: boolean;
  setStage: React.Dispatch<React.SetStateAction<PaymentStage>>;
  setMessage: React.Dispatch<React.SetStateAction<string | null>>;
  orderNumber: string | null;
  paymentMethod: SubscriptionPaymentMethod;
  paymentUrl: string | null;
  openCardPaymentUrl: (nextPaymentUrl: string, nextOrderNumber: string | null, returnUrl: string) => Promise<void>;
  stage: PaymentStage;
  stopAutoCheck: () => void;
  checkPaymentByOrderNumber: (nextOrderNumber: string, options?: { checkingStage?: PaymentStage; pendingStage?: PaymentStage; pendingMessage?: string; suppressErrorDialog?: boolean; }) => Promise<PaymentCheckOutcome>;
  startAutoCheck: (nextOrderNumber: string, initialMessage?: string | null) => void;
  isPointsPayment: boolean;
  walletSummary: WalletSummary | undefined;
  subscriptionPointsAmount: number;
  walletBalance: number;
  walletBalanceLabel: string;
  subscriptionPointsLabel: string;
  clearStoredPayment: () => Promise<void>;
  setOrderNumber: React.Dispatch<React.SetStateAction<string | null>>;
  setPaymentUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setAutoCheckAttempt: React.Dispatch<React.SetStateAction<number>>;
  subscribeToProWithPoints: ReturnType<typeof useSubscribeToProWithPointsMutation>[0];
  finishPayment: (response: SubscriptionPaymentResponse) => Promise<boolean>;
  selectedChannel: PaymentChannel;
  phone: string;
  setPhone: React.Dispatch<React.SetStateAction<string>>;
  setPaymentMethod: React.Dispatch<React.SetStateAction<SubscriptionPaymentMethod>>;
  subscribeToPro: ReturnType<typeof useSubscribeToProMutation>[0];
  persistStoredPayment: (payment: Omit<StoredPayment, "createdAt" | "userId">) => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  restorePayment: () => Promise<StoredPayment | null>;
}

export function useSubscriptionPaymentActions({
  isDriver,
  showDialog,
  isPremiumActive,
  setStage,
  setMessage,
  orderNumber,
  paymentMethod,
  paymentUrl,
  openCardPaymentUrl,
  stage,
  stopAutoCheck,
  checkPaymentByOrderNumber,
  startAutoCheck,
  isPointsPayment,
  walletSummary,
  subscriptionPointsAmount,
  walletBalance,
  walletBalanceLabel,
  subscriptionPointsLabel,
  clearStoredPayment,
  setOrderNumber,
  setPaymentUrl,
  setAutoCheckAttempt,
  subscribeToProWithPoints,
  finishPayment,
  selectedChannel,
  phone,
  setPhone,
  setPaymentMethod,
  subscribeToPro,
  persistStoredPayment,
  openExternalUrl,
  restorePayment,
}: Params) {
  const handlePrimaryAction = useCallback(async () => {
    Keyboard.dismiss();

    if (!isDriver) {
      showDialog({
        variant: 'warning',
        title: 'Compte conducteur requis',
        message: 'Activez votre profil conducteur avant de souscrire à Zwanga Pro.',
      });
      return;
    }

    if (isPremiumActive) {
      setStage('success');
      setMessage('Votre abonnement est déjà actif.');
      return;
    }

    if (orderNumber) {
      if (paymentMethod === 'card' && paymentUrl) {
        const cardRedirectUrls = createCardPaymentRedirectUrls();
        await openCardPaymentUrl(paymentUrl, orderNumber, cardRedirectUrls.returnUrl);
        return;
      }

      const wasWaitingLong = stage === 'waiting_long';
      stopAutoCheck();
      const nextStage = paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation';
      const outcome = await checkPaymentByOrderNumber(orderNumber, {
        checkingStage: nextStage,
        pendingStage: nextStage,
        pendingMessage: 'Actualisation du statut en cours.',
        suppressErrorDialog: true,
      });
      if (outcome === 'pending' || outcome === 'error') {
        if (wasWaitingLong) {
          setStage('waiting_long');
          setMessage(
            "Le paiement n'est pas encore confirmé. Si vous avez validé l'USSD, réessayez Actualiser dans un instant; sinon abandonnez cette tentative.",
          );
          return;
        }
        startAutoCheck(orderNumber, 'Nous continuons le suivi automatique de cette référence.');
      }
      return;
    }

    if (isPointsPayment) {
      if (
        walletSummary?.account &&
        Number.isFinite(subscriptionPointsAmount) &&
        Number.isFinite(walletBalance) &&
        subscriptionPointsAmount > 0 &&
        walletBalance < subscriptionPointsAmount
      ) {
        showDialog({
          variant: 'warning',
          title: 'Solde insuffisant',
          message: `Votre solde est de ${walletBalanceLabel}. Il faut ${subscriptionPointsLabel} pour cet abonnement.`,
        });
        return;
      }

      try {
        stopAutoCheck();
        await clearStoredPayment();
        setOrderNumber(null);
        setPaymentUrl(null);
        setStage('preparing');
        setAutoCheckAttempt(0);
        setMessage("Débit du solde de jetons Zwanga en cours.");

        const response = await subscribeToProWithPoints().unwrap();
        if (await finishPayment(response)) return;

        setStage('failed');
        setMessage(
          getPaymentStatusMessage(
            response.payment.message,
            "Le paiement par jetons n'a pas été confirmé.",
          ),
        );
      } catch (error: any) {
        setStage('failed');
        showDialog({
          variant: 'danger',
          title: 'Paiement impossible',
          message: getApiErrorMessage(error, 'Impossible de payer cet abonnement avec vos jetons.'),
        });
      }
      return;
    }

    const method = getPaymentMethodForChannel(selectedChannel);
    if (!method) return;
    const formattedPhone = formatCongolesePaymentPhone(phone);

    if (method === 'mobile_money' && !formattedPhone) {
      setPhone(DRC_MOBILE_MONEY_PREFIX);
      showDialog({
        variant: 'warning',
        title: 'Numéro requis',
        message: 'Entrez le numéro Mobile Money qui recevra la demande de paiement.',
      });
      return;
    }

    if (method === 'mobile_money' && !isValidCongolesePaymentPhone(formattedPhone)) {
      showDialog({
        variant: 'warning',
        title: 'Numéro invalide',
        message: 'Le numéro Mobile Money doit commencer par +243, par exemple +243891234567.',
      });
      return;
    }

    try {
      stopAutoCheck();
      setStage('preparing');
      setAutoCheckAttempt(0);
      setPaymentMethod(method);
      setMessage("Création d'une référence. Aucun débit n'est lancé avant votre validation.");
      if (method === 'mobile_money') setPhone(formattedPhone);

      const cardRedirectUrls = method === 'card' ? createCardPaymentRedirectUrls() : null;
      const response = await subscribeToPro({
        paymentMethod: method,
        phone: method === 'mobile_money' ? formattedPhone : undefined,
        ...(cardRedirectUrls
          ? {
              approveUrl: cardRedirectUrls.approveUrl,
              cancelUrl: cardRedirectUrls.cancelUrl,
              declineUrl: cardRedirectUrls.declineUrl,
            }
          : {}),
      }).unwrap();

      if (await finishPayment(response)) return;

      if (isPaymentFailed(response)) {
        await clearStoredPayment();
        setOrderNumber(null);
        setPaymentUrl(null);
        setStage('failed');
        setMessage(getPaymentFailureMessage(response.payment.message));
        return;
      }

      if (response.payment.orderNumber) {
        setOrderNumber(response.payment.orderNumber);
        setPaymentUrl(response.payment.paymentUrl);
        await persistStoredPayment({
          channel: selectedChannel,
          message: getPaymentStatusMessage(
            response.payment.message,
            'Paiement en attente chez FlexPay. Nous continuons le suivi.',
          ),
          orderNumber: response.payment.orderNumber,
          paymentMethod: method,
          paymentUrl: response.payment.paymentUrl,
        });
      }

      if (response.payment.paymentUrl) {
        setPaymentUrl(response.payment.paymentUrl);
        setStage('card_redirect');
        setMessage('Page carte FlexPay ouverte. Finalisez le paiement; nous suivrons le retour.');
        if (cardRedirectUrls) {
          await openCardPaymentUrl(
            response.payment.paymentUrl,
            response.payment.orderNumber,
            cardRedirectUrls.returnUrl,
          );
        } else {
          await openExternalUrl(response.payment.paymentUrl);
        }
        return;
      }

      if (method === 'mobile_money' && response.payment.orderNumber) {
        const pendingMessage = getPaymentStatusMessage(
          response.payment.message,
          'Demande envoyée sur votre téléphone. Confirmez avec votre PIN Mobile Money.',
        );
        setStage('phone_confirmation');
        setMessage(pendingMessage);
        startAutoCheck(response.payment.orderNumber, pendingMessage);
        return;
      }

      setStage(response.payment.orderNumber ? 'operator_confirmation' : 'preparing');
      setMessage(getPaymentStatusMessage(response.payment.message, 'Demande de paiement créée.'));
    } catch (error: any) {
      if (isNetworkOrTimeoutError(error)) {
        const pendingMessage =
          'Le lancement prend plus de temps que prévu. Ne relancez pas le paiement; nous cherchons la référence.';
        setStage('operator_confirmation');
        setMessage(pendingMessage);
        const restoredPayment = await restorePayment();
        if (restoredPayment?.orderNumber) {
          startAutoCheck(restoredPayment.orderNumber, pendingMessage);
          return;
        }
      }

      setStage('failed');
      showDialog({
        variant: 'danger',
        title: 'Paiement impossible',
        message: getApiErrorMessage(error, 'Impossible de lancer le paiement pour le moment.'),
      });
    }
  }, [
    checkPaymentByOrderNumber,
    clearStoredPayment,
    finishPayment,
    isDriver,
    isPremiumActive,
    isPointsPayment,
    openCardPaymentUrl,
    orderNumber,
    paymentMethod,
    paymentUrl,
    persistStoredPayment,
    phone,
    restorePayment,
    selectedChannel,
    showDialog,
    startAutoCheck,
    stage,
    stopAutoCheck,
    subscribeToPro,
    subscribeToProWithPoints,
    subscriptionPointsAmount,
    subscriptionPointsLabel,
    walletBalance,
    walletBalanceLabel,
    walletSummary?.account,
  ]);

  const handleRetry = useCallback(async () => {
    stopAutoCheck();
    await clearStoredPayment();
    setOrderNumber(null);
    setPaymentUrl(null);
    setStage('idle');
    setMessage(null);
    setAutoCheckAttempt(0);
  }, [clearStoredPayment, stopAutoCheck]);

  const handleAbandonAndRetry = useCallback(() => {
    showDialog({
      variant: 'warning',
      title: 'Relancer le paiement ?',
      message:
        "Si vous venez de confirmer l'USSD, appuyez plutôt sur Actualiser. Relancez seulement si vous n'avez pas validé la demande opérateur.",
      actions: [
        { label: 'Actualiser', variant: 'ghost', onPress: () => void handlePrimaryAction() },
        { label: 'Relancer', variant: 'primary', onPress: () => void handleRetry() },
      ],
    });
  }, [handlePrimaryAction, handleRetry, showDialog]);

  return {
    handleRetry,
    handleAbandonAndRetry,
    handlePrimaryAction,
  };
}
import type { WalletSummary } from '@/types';
