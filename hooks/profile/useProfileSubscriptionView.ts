import {
  SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_MAX_ATTEMPTS,
  SUBSCRIPTION_PAYMENT_OPTIONS,
  SubscriptionPaymentProgressStatus,
  SubscriptionPaymentProgressStep
} from '@/features/profile/profileModel';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo } from 'react';
import {
  Keyboard,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { useProfileData } from './useProfileData';
import type { useProfileSubscriptionCheckout } from './useProfileSubscriptionCheckout';
import type { useProfileSubscriptionMonitor } from './useProfileSubscriptionMonitor';
import type { useProfileSubscriptionState } from './useProfileSubscriptionState';

type Props = Pick<ReturnType<typeof useProfileSubscriptionCheckout>,
  | 'isSubscribingPro'
> & Pick<ReturnType<typeof useProfileSubscriptionMonitor>,
  | 'isCheckingSubscriptionPayment'
> & Pick<ReturnType<typeof useProfileSubscriptionState>,
  | 'isRestoringSubscriptionPayment'
  | 'isSubscriptionCardPayment'
  | 'isSubscriptionPaymentAutoChecking'
  | 'selectedSubscriptionPaymentChannel'
  | 'setSubscriptionKeyboardHeight'
  | 'subscriptionKeyboardHeight'
  | 'subscriptionModalVisible'
  | 'subscriptionPaymentAutoCheckAttempt'
  | 'subscriptionPaymentMessage'
  | 'subscriptionPaymentOrderNumber'
  | 'subscriptionPaymentStage'
> & Pick<ReturnType<typeof useProfileData>,
  | 'premiumOverviewFetching'
>;

export function useProfileSubscriptionView({
  isCheckingSubscriptionPayment,
  isRestoringSubscriptionPayment,
  isSubscribingPro,
  isSubscriptionCardPayment,
  isSubscriptionPaymentAutoChecking,
  premiumOverviewFetching,
  selectedSubscriptionPaymentChannel,
  setSubscriptionKeyboardHeight,
  subscriptionKeyboardHeight,
  subscriptionModalVisible,
  subscriptionPaymentAutoCheckAttempt,
  subscriptionPaymentMessage,
  subscriptionPaymentOrderNumber,
  subscriptionPaymentStage,
}: Props) {
  const insets = useSafeAreaInsets();

  const isSubscriptionPaymentBlocking =
    isSubscribingPro || isCheckingSubscriptionPayment || isRestoringSubscriptionPayment;

  const proBusy = premiumOverviewFetching || isSubscriptionPaymentBlocking;

  const selectedSubscriptionPaymentOption = useMemo(
    () =>
      SUBSCRIPTION_PAYMENT_OPTIONS.find((option) => option.id === selectedSubscriptionPaymentChannel) ??
      SUBSCRIPTION_PAYMENT_OPTIONS[0],
    [selectedSubscriptionPaymentChannel],
  );

  const subscriptionPaymentProgressSteps = useMemo<SubscriptionPaymentProgressStep[]>(() => {
    const activeStage =
      subscriptionPaymentStage === 'idle' && subscriptionPaymentOrderNumber
        ? 'operator_confirmation'
        : subscriptionPaymentStage;
    const baseSteps: Omit<SubscriptionPaymentProgressStep, 'status'>[] = isSubscriptionCardPayment
      ? [
        {
          key: 'preparing',
          title: 'Référence créée',
          description: 'Zwanga garde une référence unique pour éviter un double paiement.',
          icon: 'lock-closed-outline',
        },
        {
          key: 'card',
          title: 'Page carte',
          description: 'Finalisez le paiement dans la page sécurisée FlexPay.',
          icon: 'card-outline',
        },
        {
          key: 'activation',
          title: 'Activation Zwanga',
          description: "Nous activons l'abonnement dès que FlexPay confirme.",
          icon: 'shield-checkmark-outline',
        },
      ]
      : [
        {
          key: 'preparing',
          title: 'Référence créée',
          description: 'Zwanga garde une référence unique pour éviter un double paiement.',
          icon: 'lock-closed-outline',
        },
        {
          key: 'phone',
          title: 'Confirmation téléphone',
          description: 'Validez la demande Mobile Money avec votre PIN.',
          icon: 'phone-portrait-outline',
        },
        {
          key: 'operator',
          title: 'Retour opérateur',
          description:
            subscriptionPaymentAutoCheckAttempt > 0
              ? `Vérification automatique ${subscriptionPaymentAutoCheckAttempt}/${SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_MAX_ATTEMPTS}.`
              : "Nous attendons le retour de l'opérateur.",
          icon: 'radio-outline',
        },
        {
          key: 'activation',
          title: 'Activation Zwanga',
          description: "Nous activons l'abonnement dès que FlexPay confirme.",
          icon: 'shield-checkmark-outline',
        },
      ];

    const currentStepKey =
      activeStage === 'preparing'
        ? 'preparing'
        : activeStage === 'card_redirect'
          ? 'card'
          : activeStage === 'phone_confirmation'
            ? 'phone'
            : activeStage === 'operator_confirmation' || activeStage === 'waiting_long'
              ? 'operator'
              : activeStage === 'zwanga_activation' || activeStage === 'success'
                ? 'activation'
                : activeStage === 'failed'
                  ? isSubscriptionCardPayment
                    ? 'card'
                    : 'operator'
                  : 'preparing';

    const currentIndex = baseSteps.findIndex((step) => step.key === currentStepKey);
    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;

    return baseSteps.map((step, index) => {
      let status: SubscriptionPaymentProgressStatus = 'waiting';
      if (activeStage === 'success' || index < safeCurrentIndex) {
        status = 'done';
      } else if (activeStage === 'failed' && index === safeCurrentIndex) {
        status = 'error';
      } else if (activeStage === 'waiting_long' && index === safeCurrentIndex) {
        status = 'paused';
      } else if (index === safeCurrentIndex) {
        status = 'current';
      }

      return { ...step, status };
    });
  }, [
    isSubscriptionCardPayment,
    subscriptionPaymentAutoCheckAttempt,
    subscriptionPaymentOrderNumber,
    subscriptionPaymentStage,
  ]);

  const subscriptionPaymentStatus = useMemo(() => {
    if (isRestoringSubscriptionPayment) {
      return {
        icon: 'refresh-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          "Nous synchronisons l'abonnement depuis Zwanga. La référence FlexPay reste en mémoire sans relancer de vérification externe.",
        showActivity: true,
        title: 'Synchronisation abonnement',
      };
    }

    if (subscriptionPaymentStage === 'failed') {
      return {
        icon: 'close-circle-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          "Le paiement n'a pas été confirmé. Vous pouvez réessayer avec le même moyen ou en choisir un autre.",
        showActivity: false,
        title: 'Paiement non confirmé',
      };
    }

    if (isSubscribingPro) {
      return {
        icon: 'lock-closed-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          'Création d’une référence sécurisée FlexPay. Cette étape est limitée pour ne pas bloquer l’app trop longtemps.',
        showActivity: true,
        title: 'Préparation du paiement',
      };
    }

    if (isCheckingSubscriptionPayment) {
      return {
        icon: 'sync-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          "Vérification du statut chez FlexPay. Si le paiement est confirmé, l'abonnement sera activé automatiquement.",
        showActivity: true,
        title: 'Vérification FlexPay',
      };
    }

    if (isSubscriptionPaymentAutoChecking) {
      return {
        icon: 'time-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          `Suivi automatique en cours (${subscriptionPaymentAutoCheckAttempt}/${SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_MAX_ATTEMPTS}). Vous pouvez fermer cette fenêtre ; la référence reste gardée.`,
        showActivity: true,
        title: 'Suivi du paiement',
      };
    }

    if (subscriptionPaymentStage === 'waiting_long') {
      return {
        icon: 'time-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          'Le paiement est encore en traitement. Zwanga garde la référence et reprendra la vérification au retour dans l’app.',
        showActivity: false,
        title: 'Toujours en traitement',
      };
    }

    if (subscriptionPaymentOrderNumber || subscriptionPaymentMessage) {
      return {
        icon: 'information-circle-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          "Votre abonnement n'est pas encore actif. Une tentative existe déjà ; actualisez le statut avant toute nouvelle tentative.",
        showActivity: false,
        title: 'Abonnement non actif',
      };
    }

    return null;
  }, [
    isCheckingSubscriptionPayment,
    isRestoringSubscriptionPayment,
    isSubscribingPro,
    isSubscriptionPaymentAutoChecking,
    subscriptionPaymentAutoCheckAttempt,
    subscriptionPaymentMessage,
    subscriptionPaymentOrderNumber,
    subscriptionPaymentStage,
  ]);

  const shouldShowPaymentStatusPanel = Boolean(subscriptionPaymentStatus);

  const subscriptionModalKeyboardOffset =
    Platform.OS === 'android' && subscriptionModalVisible ? Math.max(subscriptionKeyboardHeight - insets.bottom, 0) : 0;

  const subscriptionModalCardKeyboardStyle =
    Platform.OS === 'android' && subscriptionModalKeyboardOffset > 0
      ? {
        marginBottom: subscriptionModalKeyboardOffset,
        maxHeight: '74%' as const,
      }
      : null;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setSubscriptionKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setSubscriptionKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [setSubscriptionKeyboardHeight]);
  return {
    proBusy,
    selectedSubscriptionPaymentOption,
    shouldShowPaymentStatusPanel,
    subscriptionModalCardKeyboardStyle,
    subscriptionPaymentProgressSteps,
    subscriptionPaymentStatus,
  };
}
