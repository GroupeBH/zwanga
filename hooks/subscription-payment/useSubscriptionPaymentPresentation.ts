import {
  PaymentStage,
  PaymentProgressStatus,
  AUTO_CHECK_MAX_ATTEMPTS,
} from '../../features/subscription-payment/paymentTypes';
import { Colors } from '@/constants/styles';
import type { SubscriptionPaymentMethod } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';

interface Params {
  stage: PaymentStage;
  orderNumber: string | null;
  isPointsPayment: boolean;
  isCardPayment: boolean;
  autoCheckAttempt: number;
  message: string | null;
  isSubscribing: boolean;
  isPayingWithPoints: boolean;
  isChecking: boolean;
  isAutoChecking: boolean;
  isPremiumActive: boolean;
  isDriver: boolean;
  paymentMethod: SubscriptionPaymentMethod;
  paymentUrl: string | null;
}

export function useSubscriptionPaymentPresentation({
  stage,
  orderNumber,
  isPointsPayment,
  isCardPayment,
  autoCheckAttempt,
  message,
  isSubscribing,
  isPayingWithPoints,
  isChecking,
  isAutoChecking,
  isPremiumActive,
  isDriver,
  paymentMethod,
  paymentUrl,
}: Params) {
  const progressSteps = useMemo(() => {
    const activeStage = stage === 'idle' && orderNumber ? 'operator_confirmation' : stage;
    const paymentStarted = activeStage !== 'idle' || Boolean(orderNumber);
    const baseSteps = isPointsPayment
      ? [
          {
            key: 'wallet',
            title: 'Solde',
            description: 'Zwanga vérifie et débite votre solde de jetons.',
            icon: 'wallet-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'activation',
            title: 'Activation',
            description: "L'abonnement est activé dès que le débit de jetons est confirmé.",
            icon: 'shield-checkmark-outline' as keyof typeof Ionicons.glyphMap,
          },
        ]
      : isCardPayment
      ? [
          {
            key: 'preparing',
            title: 'Référence',
            description: paymentStarted
              ? "Zwanga crée une référence. Aucun débit carte n'est lancé ici."
              : "Aucune demande de paiement n'est envoyée avant votre appui sur le bouton.",
            icon: 'lock-closed-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'card',
            title: 'Carte',
            description: 'Finalisez le paiement dans la page securisée FlexPay.',
            icon: 'card-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'activation',
            title: 'Activation',
            description: "Nous activons l'abonnement dès que FlexPay confirme.",
            icon: 'shield-checkmark-outline' as keyof typeof Ionicons.glyphMap,
          },
        ]
      : [
          {
            key: 'preparing',
            title: 'Référence',
            description: paymentStarted
              ? 'Zwanga crée une référence. La demande Mobile Money part ensuite sur votre téléphone.'
              : "Aucune demande de paiement n'est envoyée avant votre appui sur le bouton.",
            icon: 'lock-closed-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'phone',
            title: 'Téléphone',
            description: 'Validez la demande Mobile Money avec votre PIN.',
            icon: 'phone-portrait-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'operator',
            title: 'Opérateur',
            description:
              autoCheckAttempt > 0
                ? `Vérification automatique ${autoCheckAttempt}/${AUTO_CHECK_MAX_ATTEMPTS}.`
                : "Nous attendons le retour de l'opérateur.",
            icon: 'radio-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'activation',
            title: 'Activation',
            description: "Nous activons l'abonnement dès que FlexPay confirme.",
            icon: 'shield-checkmark-outline' as keyof typeof Ionicons.glyphMap,
          },
        ];

    const currentStepKey = (() => {
      if (!paymentStarted) return null;
      if (activeStage === 'preparing') return isPointsPayment ? 'wallet' : 'preparing';
      if (activeStage === 'card_redirect') return 'card';
      if (activeStage === 'phone_confirmation') return 'phone';
      if (activeStage === 'operator_confirmation' || activeStage === 'waiting_long') return 'operator';
      if (activeStage === 'zwanga_activation' || activeStage === 'success') return 'activation';
      if (activeStage === 'failed') return isPointsPayment ? 'wallet' : isCardPayment ? 'card' : 'operator';
      return 'preparing';
    })();

    const currentIndex = Math.max(
      -1,
      currentStepKey ? baseSteps.findIndex((step) => step.key === currentStepKey) : -1,
    );

    return baseSteps.map((step, index) => {
      let stepStatus: PaymentProgressStatus = 'waiting';
      if (!paymentStarted) {
        stepStatus = 'waiting';
      } else if (activeStage === 'success' || index < currentIndex) {
        stepStatus = 'done';
      } else if (activeStage === 'failed' && index === currentIndex) {
        stepStatus = 'error';
      } else if (activeStage === 'waiting_long' && index === currentIndex) {
        stepStatus = 'paused';
      } else if (index === currentIndex) {
        stepStatus = 'current';
      }

      return { ...step, status: stepStatus };
    });
  }, [autoCheckAttempt, isCardPayment, isPointsPayment, orderNumber, stage]);
  const highlightedProgressStep =
    stage === 'idle' && !orderNumber
      ? progressSteps[0]
      : progressSteps.find(
        (step) => step.status === 'current' || step.status === 'paused' || step.status === 'error',
      ) ?? progressSteps[progressSteps.length - 1];

  const statusPanel = useMemo(() => {
    if (stage === 'success') {
      return {
        icon: 'checkmark-circle-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Abonnement actif',
        text: 'Votre compte conducteur Pro est activé.',
        activity: false,
        color: Colors.success,
      };
    }

    if (stage === 'failed') {
      return {
        icon: 'close-circle-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Paiement non confirmé',
        text: message || "Le paiement n'a pas été confirmé.",
        activity: false,
        color: Colors.danger,
      };
    }

    if (isSubscribing || isPayingWithPoints || stage === 'preparing') {
      return {
        icon: isPointsPayment
          ? ('wallet-outline' as keyof typeof Ionicons.glyphMap)
          : ('lock-closed-outline' as keyof typeof Ionicons.glyphMap),
        title: isPointsPayment ? 'Débit de jetons' : 'Référence en préparation',
        text:
          message ||
          (isPointsPayment
            ? "Vérification du solde et activation de l'abonnement."
            : "Aucun débit n'est lancé ici. Zwanga crée seulement une référence sécurisée."),
        activity: false,
        color: Colors.primary,
      };
    }

    if (isChecking || isAutoChecking) {
      return {
        icon: 'sync-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Suivi du paiement',
        text:
          message ||
          `Vérification automatique ${autoCheckAttempt}/${AUTO_CHECK_MAX_ATTEMPTS}.`,
        activity: true,
        color: Colors.primary,
      };
    }

    if (stage === 'waiting_long') {
      return {
        icon: 'time-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Toujours en traitement',
        text:
          message ||
          "La référence reste gardée. Zwanga reprendra la vérification au retour dans l'app.",
        activity: false,
        color: Colors.warningDark,
      };
    }

    if (orderNumber || message) {
      return {
        icon: 'information-circle-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Paiement en cours',
        text: message || 'Une référence existe déjà pour ce paiement.',
        activity: false,
        color: Colors.primary,
      };
    }

    return null;
  }, [
    autoCheckAttempt,
    isAutoChecking,
    isChecking,
    isPayingWithPoints,
    isPointsPayment,
    isSubscribing,
    message,
    orderNumber,
    stage,
  ]);

  const isBusy = isSubscribing || isPayingWithPoints || isChecking;
  const primaryButtonLabel =
    isPremiumActive || stage === 'success'
      ? 'Abonnement actif'
      : !isDriver
        ? 'Profil conducteur requis'
        : orderNumber
          ? isAutoChecking
            ? 'Actualiser maintenant'
            : paymentMethod === 'card' && paymentUrl
              ? 'Rouvrir le paiement'
              : 'Actualiser le statut'
          : stage === 'failed'
            ? 'Réessayer'
            : isPointsPayment
              ? 'Payer avec jetons'
              : isCardPayment
                ? 'Payer par carte'
                : "Payer l'abonnement";
  const isPrimaryActionDisabled = isBusy || isPremiumActive || stage === 'success';

  return {
    isBusy,
    progressSteps,
    highlightedProgressStep,
    statusPanel,
    isPrimaryActionDisabled,
    primaryButtonLabel,
  };
}
