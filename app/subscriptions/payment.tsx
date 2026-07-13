import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useGetPaymentHistoryQuery } from '@/store/api/paymentApi';
import {
  useGetPremiumOverviewQuery,
  useGetSubscriptionPlansQuery,
  useLazyCheckSubscriptionPaymentStatusQuery,
  useSubscribeToProMutation,
} from '@/store/api/subscriptionApi';
import { useGetProfileSummaryQuery } from '@/store/api/userApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import type {
  PaymentHistoryItem,
  SubscriptionPaymentMethod,
  SubscriptionPaymentResponse,
  SubscriptionPlan,
} from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as ExpoLinking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type PaymentChannel = 'mpesa' | 'airtel' | 'orange' | 'card';
type PaymentStage =
  | 'idle'
  | 'preparing'
  | 'phone_confirmation'
  | 'card_redirect'
  | 'operator_confirmation'
  | 'zwanga_activation'
  | 'waiting_long'
  | 'success'
  | 'failed';
type PaymentCheckOutcome = 'success' | 'pending' | 'failed' | 'error';
type PaymentProgressStatus = 'done' | 'current' | 'waiting' | 'paused' | 'error';
type StoredPayment = {
  channel: PaymentChannel;
  createdAt: string;
  message?: string | null;
  orderNumber: string;
  paymentMethod: SubscriptionPaymentMethod;
  paymentUrl?: string | null;
  userId: string;
};

const CARD_PAYMENT_RETURN_PATH = 'subscriptions/payment';
const RECENT_PENDING_PAYMENT_MAX_AGE_MS = 30 * 60 * 1000;
const AUTO_CHECK_INITIAL_DELAY_MS = 3500;
const AUTO_CHECK_INTERVAL_MS = 8000;
const AUTO_CHECK_TIMEOUT_MS = 180000;
const AUTO_CHECK_MAX_ATTEMPTS = 15;
const DRC_MOBILE_MONEY_PREFIX = '+243';
const DRC_MOBILE_MONEY_REGEX = /^\+243\d{9}$/;

WebBrowser.maybeCompleteAuthSession();

const PAYMENT_OPTIONS: {
  id: PaymentChannel;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'mpesa', label: 'M-Pesa', hint: 'Mobile Money', icon: 'phone-portrait-outline' },
  { id: 'airtel', label: 'Airtel Money', hint: 'Mobile Money', icon: 'phone-portrait-outline' },
  { id: 'orange', label: 'Orange Money', hint: 'Mobile Money', icon: 'phone-portrait-outline' },
  { id: 'card', label: 'Carte', hint: 'Visa ou Mastercard', icon: 'card-outline' },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatSubscriptionAmount = (amount?: number | string, currency?: string) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return `5000 ${currency || 'CDF'}`;
  const formatted =
    numericAmount % 1 === 0 ? Math.round(numericAmount).toString() : numericAmount.toFixed(2);
  return `${formatted} ${currency || 'CDF'}`;
};

const getPlanLabel = (plan?: SubscriptionPlan | null) => {
  if (plan === 'pro') return 'Pro';
  if (plan === 'yearly') return 'annuel';
  return 'mensuel';
};

const createCardPaymentRedirectUrls = () => {
  const baseUrl = ExpoLinking.createURL(CARD_PAYMENT_RETURN_PATH);
  const withStatus = (status: 'success' | 'cancel' | 'decline') =>
    `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}status=${status}`;

  return {
    approveUrl: withStatus('success'),
    cancelUrl: withStatus('cancel'),
    declineUrl: withStatus('decline'),
    returnUrl: baseUrl,
  };
};

const normalizePaymentPhone = (value?: string | null) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed.startsWith('+') ? '+' : '';
  return trimmed.startsWith('+') ? `+${digits}` : digits;
};

const formatCongolesePaymentPhone = (value?: string | null) => {
  const normalized = normalizePaymentPhone(value);
  if (!normalized) return '';

  const digits = normalized.replace(/\D/g, '');
  if (digits.startsWith('243') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `${DRC_MOBILE_MONEY_PREFIX}${digits.slice(1)}`;
  if (digits.length === 9) return `${DRC_MOBILE_MONEY_PREFIX}${digits}`;
  return normalized;
};

const isValidCongolesePaymentPhone = (value?: string | null) =>
  DRC_MOBILE_MONEY_REGEX.test(formatCongolesePaymentPhone(value));

const normalizePaymentMessage = (message?: string | null) =>
  (message ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const isDeclinedPaymentMessage = (message?: string | null) => {
  const normalizedMessage = normalizePaymentMessage(message);
  return (
    normalizedMessage.includes('declined') ||
    normalizedMessage.includes('refuse') ||
    normalizedMessage.includes('rejet') ||
    normalizedMessage.includes('solde insuffisant') ||
    normalizedMessage.includes('insufficient')
  );
};

const getPaymentFailureMessage = (message?: string | null) => {
  const normalizedMessage = normalizePaymentMessage(message);
  if (
    normalizedMessage.includes('declined by the operator') ||
    normalizedMessage.includes('declined') ||
    normalizedMessage.includes('refuse') ||
    normalizedMessage.includes('rejet')
  ) {
    return 'Paiement refuse par l operateur. Aucun montant confirme.';
  }

  if (
    normalizedMessage.includes('solde insuffisant') ||
    normalizedMessage.includes('insufficient')
  ) {
    return 'Paiement echoue: solde insuffisant.';
  }

  return message || 'Le paiement a echoue. Vous pouvez reessayer ou choisir un autre moyen.';
};

const isPaymentComplete = (response?: SubscriptionPaymentResponse | null) =>
  response?.subscription?.status === 'active' || response?.payment?.status === 'succeeded';

const isPaymentFailed = (response?: SubscriptionPaymentResponse | null) =>
  response?.payment?.status === 'failed' ||
  response?.subscription?.status === 'payment_failed' ||
  response?.payment?.status === 'cancelled' ||
  response?.subscription?.status === 'cancelled' ||
  isDeclinedPaymentMessage(response?.payment?.message);

const isNetworkOrTimeoutError = (error: any) =>
  error?.status === 'FETCH_ERROR' || error?.status === 'TIMEOUT_ERROR';

const getStoredPaymentKey = (userId?: string | null) =>
  userId ? `zwanga:subscription:pending-payment:${userId}` : null;

const getPaymentMethodForChannel = (channel: PaymentChannel): SubscriptionPaymentMethod =>
  channel === 'card' ? 'card' : 'mobile_money';

const isPaymentChannel = (value: unknown): value is PaymentChannel =>
  value === 'mpesa' || value === 'airtel' || value === 'orange' || value === 'card';

const parseStoredPayment = (value?: string | null): StoredPayment | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredPayment>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.orderNumber !== 'string' || !parsed.orderNumber.trim()) return null;
    if (typeof parsed.userId !== 'string' || !parsed.userId.trim()) return null;
    if (!isPaymentChannel(parsed.channel)) return null;

    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : '';
    const createdAtMs = Date.parse(createdAt);
    if (!Number.isFinite(createdAtMs)) return null;
    if (Date.now() - createdAtMs > RECENT_PENDING_PAYMENT_MAX_AGE_MS) return null;

    const paymentMethod =
      parsed.paymentMethod === 'card' || parsed.paymentMethod === 'mobile_money'
        ? parsed.paymentMethod
        : getPaymentMethodForChannel(parsed.channel);

    return {
      channel: parsed.channel,
      createdAt,
      message: typeof parsed.message === 'string' ? parsed.message : null,
      orderNumber: parsed.orderNumber,
      paymentMethod,
      paymentUrl: typeof parsed.paymentUrl === 'string' ? parsed.paymentUrl : null,
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
};

const isRecentPendingSubscriptionPayment = (payment: PaymentHistoryItem) => {
  const purpose = String(payment.purpose ?? '').toLowerCase();
  const status = String(payment.status ?? '').toLowerCase();
  const createdAtMs = Date.parse(payment.createdAt);

  return (
    purpose === 'subscription_pro' &&
    Boolean(payment.orderNumber) &&
    (status === 'pending' || status === 'initiated') &&
    Number.isFinite(createdAtMs) &&
    Date.now() - createdAtMs <= RECENT_PENDING_PAYMENT_MAX_AGE_MS
  );
};

const getMostRecentPendingSubscriptionPayment = (payments?: PaymentHistoryItem[] | null) => {
  if (!payments?.length) return null;
  return (
    payments
      .filter(isRecentPendingSubscriptionPayment)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null
  );
};

const buildStoredPaymentFromHistory = (
  payment: PaymentHistoryItem,
  userId: string,
  fallbackChannel: PaymentChannel,
): StoredPayment | null => {
  if (!payment.orderNumber || !userId) return null;

  const channel = payment.method === 'card' ? 'card' : fallbackChannel === 'card' ? 'mpesa' : fallbackChannel;
  return {
    channel,
    createdAt: payment.createdAt,
    message: payment.message || 'Paiement retrouve cote Zwanga.',
    orderNumber: payment.orderNumber,
    paymentMethod: payment.method === 'card' ? 'card' : 'mobile_money',
    paymentUrl: payment.paymentUrl,
    userId,
  };
};

const getCardPaymentResultFromUrl = (url?: string | null) => {
  if (!url) return null;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('status=success') || lowerUrl.includes('/success')) return 'success';
  if (lowerUrl.includes('status=cancel') || lowerUrl.includes('/cancel')) return 'cancel';
  if (lowerUrl.includes('status=decline') || lowerUrl.includes('/decline')) return 'decline';
  return null;
};

export default function SubscriptionPaymentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { showDialog } = useDialog();
  const user = useAppSelector(selectUser);
  const { paymentStatus, status } = useLocalSearchParams<{
    paymentStatus?: string;
    status?: string;
  }>();
  const returnedPaymentStatus = paymentStatus ?? status;
  const isCompactHeight = windowHeight < 760;
  const isTightHeight = windowHeight < 700;

  const { data: profileSummary, refetch: refetchProfile } = useGetProfileSummaryQuery();
  const currentUser = profileSummary?.user ?? user;
  const isDriver = Boolean(
    currentUser?.role === 'driver' ||
      currentUser?.role === 'both' ||
      currentUser?.isDriver,
  );

  const { data: subscriptionPlans = [] } = useGetSubscriptionPlansQuery();
  const {
    data: premiumOverview,
    isFetching: premiumOverviewFetching,
    refetch: refetchPremiumOverview,
  } = useGetPremiumOverviewQuery(undefined, { skip: !isDriver });
  const {
    data: paymentHistory,
    refetch: refetchPaymentHistory,
  } = useGetPaymentHistoryQuery(undefined, { skip: !isDriver });
  const [subscribeToPro, { isLoading: isSubscribing }] = useSubscribeToProMutation();
  const [checkPaymentStatus, { isFetching: isChecking }] =
    useLazyCheckSubscriptionPaymentStatusQuery();

  const [selectedChannel, setSelectedChannel] = useState<PaymentChannel>('mpesa');
  const [phone, setPhone] = useState('');
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<SubscriptionPaymentMethod>('mobile_money');
  const [message, setMessage] = useState<string | null>(null);
  const [stage, setStage] = useState<PaymentStage>('idle');
  const [autoCheckAttempt, setAutoCheckAttempt] = useState(0);
  const [isAutoChecking, setIsAutoChecking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const pollingRunIdRef = useRef(0);
  const mountedRef = useRef(true);
  const restoredKeyRef = useRef<string | null>(null);
  const handledPaymentStatusRef = useRef<string | null>(null);
  const prefilledPhoneRef = useRef(false);

  const proPlan = useMemo(
    () => subscriptionPlans.find((plan) => plan.plan === 'pro') ?? subscriptionPlans[0],
    [subscriptionPlans],
  );
  const priceLabel = formatSubscriptionAmount(proPlan?.amount, proPlan?.currency);
  const planLabel = getPlanLabel(proPlan?.plan);
  const isCardPayment = selectedChannel === 'card';
  const isPremiumActive = Boolean(
    premiumOverview?.isPremium ||
      premiumOverview?.isActive ||
      currentUser?.isPremium ||
      currentUser?.premiumBadge,
  );
  const storageKey = useMemo(() => getStoredPaymentKey(currentUser?.id), [currentUser?.id]);
  const recentPendingPayment = useMemo(
    () => getMostRecentPendingSubscriptionPayment(paymentHistory),
    [paymentHistory],
  );

  const progressSteps = useMemo(() => {
    const activeStage = stage === 'idle' && orderNumber ? 'operator_confirmation' : stage;
    const baseSteps = isCardPayment
      ? [
          {
            key: 'preparing',
            title: 'Reference',
            description: 'Zwanga garde une reference unique pour eviter un double paiement.',
            icon: 'lock-closed-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'card',
            title: 'Carte',
            description: 'Finalisez le paiement dans la page securisee FlexPay.',
            icon: 'card-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'activation',
            title: 'Activation',
            description: 'Nous activons l abonnement des que FlexPay confirme.',
            icon: 'shield-checkmark-outline' as keyof typeof Ionicons.glyphMap,
          },
        ]
      : [
          {
            key: 'preparing',
            title: 'Reference',
            description: 'Zwanga garde une reference unique pour eviter un double paiement.',
            icon: 'lock-closed-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'phone',
            title: 'Telephone',
            description: 'Validez la demande Mobile Money avec votre PIN.',
            icon: 'phone-portrait-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'operator',
            title: 'Operateur',
            description:
              autoCheckAttempt > 0
                ? `Verification automatique ${autoCheckAttempt}/${AUTO_CHECK_MAX_ATTEMPTS}.`
                : 'Nous attendons le retour de l operateur.',
            icon: 'radio-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'activation',
            title: 'Activation',
            description: 'Nous activons l abonnement des que FlexPay confirme.',
            icon: 'shield-checkmark-outline' as keyof typeof Ionicons.glyphMap,
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
                  ? isCardPayment
                    ? 'card'
                    : 'operator'
                  : 'preparing';

    const currentIndex = Math.max(
      0,
      baseSteps.findIndex((step) => step.key === currentStepKey),
    );

    return baseSteps.map((step, index) => {
      let stepStatus: PaymentProgressStatus = 'waiting';
      if (activeStage === 'success' || index < currentIndex) {
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
  }, [autoCheckAttempt, isCardPayment, orderNumber, stage]);
  const highlightedProgressStep =
    progressSteps.find(
      (step) => step.status === 'current' || step.status === 'paused' || step.status === 'error',
    ) ?? progressSteps[progressSteps.length - 1];

  const statusPanel = useMemo(() => {
    if (stage === 'success') {
      return {
        icon: 'checkmark-circle-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Abonnement actif',
        text: 'Votre compte conducteur Pro est active.',
        activity: false,
        color: Colors.success,
      };
    }

    if (stage === 'failed') {
      return {
        icon: 'close-circle-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Paiement non confirme',
        text: message || 'Le paiement n a pas ete confirme.',
        activity: false,
        color: Colors.danger,
      };
    }

    if (isSubscribing || stage === 'preparing') {
      return {
        icon: 'lock-closed-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Preparation du paiement',
        text: message || 'Creation d une reference FlexPay securisee.',
        activity: true,
        color: Colors.primary,
      };
    }

    if (isChecking || isAutoChecking) {
      return {
        icon: 'sync-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Suivi du paiement',
        text:
          message ||
          `Verification automatique ${autoCheckAttempt}/${AUTO_CHECK_MAX_ATTEMPTS}.`,
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
          'La reference reste gardee. Zwanga reprendra la verification au retour dans l app.',
        activity: false,
        color: Colors.warningDark,
      };
    }

    if (orderNumber || message) {
      return {
        icon: 'information-circle-outline' as keyof typeof Ionicons.glyphMap,
        title: 'Paiement en cours',
        text: message || 'Une reference existe deja pour ce paiement.',
        activity: false,
        color: Colors.primary,
      };
    }

    return null;
  }, [autoCheckAttempt, isAutoChecking, isChecking, isSubscribing, message, orderNumber, stage]);

  const isBusy = isSubscribing || isChecking;
  const selectedOption =
    PAYMENT_OPTIONS.find((option) => option.id === selectedChannel) ?? PAYMENT_OPTIONS[0];
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
            ? 'Reessayer'
            : isCardPayment
              ? 'Payer par carte'
              : "Payer l'abonnement";
  const isPrimaryActionDisabled = isBusy || isPremiumActive || stage === 'success';

  const stopAutoCheck = useCallback(() => {
    pollingRunIdRef.current += 1;
    if (mountedRef.current) setIsAutoChecking(false);
  }, []);

  const clearStoredPayment = useCallback(async () => {
    if (!storageKey) return;
    try {
      await AsyncStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('[SubscriptionPayment] clear stored payment failed:', error);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!isPremiumActive) return;

    stopAutoCheck();
    setOrderNumber(null);
    setPaymentUrl(null);
    setStage('success');
    setMessage('Votre abonnement est deja actif.');
    setAutoCheckAttempt(0);
    void clearStoredPayment();
  }, [clearStoredPayment, isPremiumActive, stopAutoCheck]);

  const readStoredPayment = useCallback(async () => {
    if (!storageKey || !currentUser?.id) return null;
    try {
      const rawValue = await AsyncStorage.getItem(storageKey);
      const storedPayment = parseStoredPayment(rawValue);
      if (!storedPayment || storedPayment.userId !== currentUser.id) {
        if (rawValue) await AsyncStorage.removeItem(storageKey);
        return null;
      }
      return storedPayment;
    } catch (error) {
      console.warn('[SubscriptionPayment] read stored payment failed:', error);
      return null;
    }
  }, [currentUser?.id, storageKey]);

  const persistStoredPayment = useCallback(
    async (payment: Omit<StoredPayment, 'createdAt' | 'userId'>) => {
      if (!storageKey || !currentUser?.id || !payment.orderNumber) return;

      const storedPayment: StoredPayment = {
        ...payment,
        createdAt: new Date().toISOString(),
        userId: currentUser.id,
      };

      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(storedPayment));
      } catch (error) {
        console.warn('[SubscriptionPayment] persist stored payment failed:', error);
      }
    },
    [currentUser?.id, storageKey],
  );

  const applyStoredPayment = useCallback((storedPayment: StoredPayment) => {
    setSelectedChannel(storedPayment.channel);
    setOrderNumber(storedPayment.orderNumber);
    setPaymentUrl(storedPayment.paymentUrl ?? null);
    setPaymentMethod(storedPayment.paymentMethod);
    setStage(storedPayment.paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation');
    setMessage(storedPayment.message || 'Paiement retrouve. Nous reprenons le suivi.');
  }, []);

  const finishPayment = useCallback(
    async (response: SubscriptionPaymentResponse) => {
      if (!isPaymentComplete(response)) return false;

      stopAutoCheck();
      await clearStoredPayment();
      await Promise.allSettled([refetchPremiumOverview(), refetchProfile()]);
      setStage('success');
      setOrderNumber(null);
      setPaymentUrl(null);
      setMessage('Abonnement conducteur active.');
      setAutoCheckAttempt(0);
      showDialog({
        variant: 'success',
        title: 'Abonnement actif',
        message: 'Votre abonnement conducteur est actif. Vous pouvez publier plus de 5 trajets par jour.',
      });
      return true;
    },
    [clearStoredPayment, refetchPremiumOverview, refetchProfile, showDialog, stopAutoCheck],
  );

  const checkPaymentByOrderNumber = useCallback(
    async (
      nextOrderNumber: string,
      options?: {
        checkingStage?: PaymentStage;
        pendingStage?: PaymentStage;
        pendingMessage?: string;
        suppressErrorDialog?: boolean;
      },
    ): Promise<PaymentCheckOutcome> => {
      try {
        setOrderNumber(nextOrderNumber);
        setStage(options?.checkingStage ?? 'zwanga_activation');
        const response = await checkPaymentStatus(nextOrderNumber).unwrap();

        if (await finishPayment(response)) return 'success';

        if (isPaymentFailed(response)) {
          stopAutoCheck();
          await clearStoredPayment();
          setOrderNumber(null);
          setPaymentUrl(null);
          setStage('failed');
          setMessage(getPaymentFailureMessage(response.payment.message));
          return 'failed';
        }

        setStage(options?.pendingStage ?? 'operator_confirmation');
        setMessage(
          response.payment.message ||
            options?.pendingMessage ||
            'Paiement en attente chez FlexPay. Nous continuons le suivi.',
        );
        return 'pending';
      } catch (error: any) {
        if (options?.suppressErrorDialog) {
          setStage(options.pendingStage ?? 'operator_confirmation');
          setMessage('La verification prend plus de temps que prevu. La reference reste gardee.');
          return 'error';
        }

        showDialog({
          variant: 'danger',
          title: 'Verification impossible',
          message: getApiErrorMessage(error, 'Impossible de verifier ce paiement pour le moment.'),
        });
        return 'error';
      }
    },
    [checkPaymentStatus, clearStoredPayment, finishPayment, showDialog, stopAutoCheck],
  );

  const startAutoCheck = useCallback(
    (nextOrderNumber: string, initialMessage?: string | null) => {
      if (!nextOrderNumber) return;

      const runId = pollingRunIdRef.current + 1;
      pollingRunIdRef.current = runId;
      setIsAutoChecking(true);
      setAutoCheckAttempt(0);
      setStage(paymentMethod === 'card' ? 'zwanga_activation' : 'phone_confirmation');
      setMessage(
        initialMessage ||
          'Demande envoyee a FlexPay. Confirmez sur votre telephone; nous suivons le paiement.',
      );

      void (async () => {
        const deadline = Date.now() + AUTO_CHECK_TIMEOUT_MS;
        let attempt = 0;
        let nextDelay = AUTO_CHECK_INITIAL_DELAY_MS;

        while (mountedRef.current && pollingRunIdRef.current === runId) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0 || attempt >= AUTO_CHECK_MAX_ATTEMPTS) break;

          await wait(Math.min(nextDelay, remainingMs));
          if (!mountedRef.current || pollingRunIdRef.current !== runId) return;

          attempt += 1;
          setAutoCheckAttempt(attempt);
          const nextStage = paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation';
          setStage(nextStage);
          const outcome = await checkPaymentByOrderNumber(nextOrderNumber, {
            checkingStage: nextStage,
            pendingStage: nextStage,
            pendingMessage:
              attempt === 1
                ? 'Verification en cours. Si la demande est sur votre telephone, confirmez avec votre PIN.'
                : 'Paiement toujours en traitement. Nous continuons les actualisations automatiques.',
            suppressErrorDialog: true,
          });

          if (!mountedRef.current || pollingRunIdRef.current !== runId) return;
          if (outcome === 'success' || outcome === 'failed') {
            setIsAutoChecking(false);
            return;
          }

          nextDelay = AUTO_CHECK_INTERVAL_MS;
        }

        if (mountedRef.current && pollingRunIdRef.current === runId) {
          setIsAutoChecking(false);
          setStage('waiting_long');
          setMessage(
            'Le paiement est encore en traitement. Ne payez pas une deuxieme fois; la reference reste gardee.',
          );
        }
      })();
    },
    [checkPaymentByOrderNumber, paymentMethod],
  );

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
      throw new Error('Impossible d ouvrir le lien externe.');
    }
  };

  const openCardPaymentUrl = useCallback(
    async (nextPaymentUrl: string, nextOrderNumber: string | null, returnUrl: string) => {
      setStage('card_redirect');
      const result = await WebBrowser.openAuthSessionAsync(nextPaymentUrl, returnUrl);

      if (result.type !== 'success') {
        if (nextOrderNumber) {
          const pendingMessage = 'Retour dans l app detecte. Nous verifions le statut carte.';
          const outcome = await checkPaymentByOrderNumber(nextOrderNumber, {
            checkingStage: 'zwanga_activation',
            pendingStage: 'zwanga_activation',
            pendingMessage,
            suppressErrorDialog: true,
          });
          if (outcome === 'pending' || outcome === 'error') startAutoCheck(nextOrderNumber, pendingMessage);
          return;
        }
        setMessage('Le paiement carte a ete ferme avant le retour FlexPay.');
        return;
      }

      const paymentResult = getCardPaymentResultFromUrl(result.url);
      if ((paymentResult === 'cancel' || paymentResult === 'decline') && !nextOrderNumber) {
        setStage('failed');
        setMessage(
          paymentResult === 'cancel'
            ? 'Paiement carte annule.'
            : 'Paiement carte refuse. Verifiez votre carte ou essayez un autre moyen.',
        );
        return;
      }

      if (!nextOrderNumber) {
        setMessage('Retour carte recu, mais la reference FlexPay est manquante.');
        return;
      }

      const pendingMessage =
        paymentResult === 'success'
          ? 'Paiement carte valide cote FlexPay, activation en cours.'
          : 'Retour carte recu. Verification du statut avant toute nouvelle tentative.';
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

  const restorePayment = useCallback(async () => {
    if (!currentUser?.id) return null;

    const storedPayment = await readStoredPayment();
    if (storedPayment) {
      applyStoredPayment(storedPayment);
      return storedPayment;
    }

    const latestPendingPayment = getMostRecentPendingSubscriptionPayment(paymentHistory);
    const restoredFromHistory = latestPendingPayment
      ? buildStoredPaymentFromHistory(latestPendingPayment, currentUser.id, selectedChannel)
      : null;
    if (restoredFromHistory) {
      applyStoredPayment(restoredFromHistory);
      await persistStoredPayment({
        channel: restoredFromHistory.channel,
        message: restoredFromHistory.message,
        orderNumber: restoredFromHistory.orderNumber,
        paymentMethod: restoredFromHistory.paymentMethod,
        paymentUrl: restoredFromHistory.paymentUrl,
      });
      return restoredFromHistory;
    }

    return null;
  }, [
    applyStoredPayment,
    currentUser?.id,
    paymentHistory,
    persistStoredPayment,
    readStoredPayment,
    selectedChannel,
  ]);

  const refreshEverything = useCallback(async () => {
    setRefreshing(true);
    try {
      const refreshTasks: PromiseLike<unknown>[] = [refetchProfile()];
      if (isDriver) {
        refreshTasks.push(refetchPremiumOverview(), refetchPaymentHistory());
      }
      await Promise.allSettled(refreshTasks);
    } finally {
      setRefreshing(false);
    }
  }, [isDriver, refetchPaymentHistory, refetchPremiumOverview, refetchProfile]);

  const handlePrimaryAction = useCallback(async () => {
    Keyboard.dismiss();

    if (!isDriver) {
      showDialog({
        variant: 'warning',
        title: 'Compte conducteur requis',
        message: 'Activez votre profil conducteur avant de souscrire a Zwanga Pro.',
      });
      return;
    }

    if (isPremiumActive) {
      setStage('success');
      setMessage('Votre abonnement est deja actif.');
      return;
    }

    if (orderNumber) {
      if (paymentMethod === 'card' && paymentUrl) {
        const cardRedirectUrls = createCardPaymentRedirectUrls();
        await openCardPaymentUrl(paymentUrl, orderNumber, cardRedirectUrls.returnUrl);
        return;
      }

      stopAutoCheck();
      const nextStage = paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation';
      const outcome = await checkPaymentByOrderNumber(orderNumber, {
        checkingStage: nextStage,
        pendingStage: nextStage,
        pendingMessage: 'Actualisation du statut en cours.',
        suppressErrorDialog: true,
      });
      if (outcome === 'pending' || outcome === 'error') {
        startAutoCheck(orderNumber, 'Nous continuons le suivi automatique de cette reference.');
      }
      return;
    }

    const method = getPaymentMethodForChannel(selectedChannel);
    const formattedPhone = formatCongolesePaymentPhone(phone);

    if (method === 'mobile_money' && !formattedPhone) {
      setPhone(DRC_MOBILE_MONEY_PREFIX);
      showDialog({
        variant: 'warning',
        title: 'Numero requis',
        message: 'Entrez le numero Mobile Money qui recevra la demande de paiement.',
      });
      return;
    }

    if (method === 'mobile_money' && !isValidCongolesePaymentPhone(formattedPhone)) {
      showDialog({
        variant: 'warning',
        title: 'Numero invalide',
        message: 'Le numero Mobile Money doit commencer par +243, par exemple +243891234567.',
      });
      return;
    }

    try {
      stopAutoCheck();
      setStage('preparing');
      setAutoCheckAttempt(0);
      setPaymentMethod(method);
      setMessage('Preparation du paiement avec FlexPay.');
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

      if (response.payment.orderNumber) {
        setOrderNumber(response.payment.orderNumber);
        setPaymentUrl(response.payment.paymentUrl);
        await persistStoredPayment({
          channel: selectedChannel,
          message: response.payment.message,
          orderNumber: response.payment.orderNumber,
          paymentMethod: method,
          paymentUrl: response.payment.paymentUrl,
        });
      }

      if (await finishPayment(response)) return;

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
        const pendingMessage =
          response.payment.message ||
          'Demande envoyee sur votre telephone. Confirmez avec votre PIN Mobile Money.';
        setStage('phone_confirmation');
        setMessage(pendingMessage);
        startAutoCheck(response.payment.orderNumber, pendingMessage);
        return;
      }

      setStage(response.payment.orderNumber ? 'operator_confirmation' : 'preparing');
      setMessage(response.payment.message || 'Demande de paiement creee.');
    } catch (error: any) {
      if (isNetworkOrTimeoutError(error)) {
        const pendingMessage =
          'Le lancement prend plus de temps que prevu. Ne relancez pas le paiement; nous cherchons la reference.';
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
    finishPayment,
    isDriver,
    isPremiumActive,
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
    stopAutoCheck,
    subscribeToPro,
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

  useEffect(() => {
    if (prefilledPhoneRef.current || !currentUser?.phone) return;
    setPhone(formatCongolesePaymentPhone(currentUser.phone));
    prefilledPhoneRef.current = true;
  }, [currentUser?.phone]);

  useEffect(() => () => {
    mountedRef.current = false;
    pollingRunIdRef.current += 1;
  }, []);

  useEffect(() => {
    if (!storageKey || !currentUser?.id || isPremiumActive) return;
    const restoreKey = `${storageKey}:${recentPendingPayment?.orderNumber ?? 'none'}`;
    if (restoredKeyRef.current === restoreKey) return;
    restoredKeyRef.current = restoreKey;

    let cancelled = false;
    void (async () => {
      const restoredPayment = await restorePayment();
      if (cancelled || !restoredPayment?.orderNumber) return;
      const nextStage =
        restoredPayment.paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation';
      const outcome = await checkPaymentByOrderNumber(restoredPayment.orderNumber, {
        checkingStage: nextStage,
        pendingStage: nextStage,
        pendingMessage: 'Paiement retrouve. Nous reprenons le suivi.',
        suppressErrorDialog: true,
      });
      if (!cancelled && (outcome === 'pending' || outcome === 'error')) {
        startAutoCheck(restoredPayment.orderNumber, 'Paiement retrouve. Nous reprenons le suivi.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    checkPaymentByOrderNumber,
    currentUser?.id,
    isPremiumActive,
    recentPendingPayment?.orderNumber,
    restorePayment,
    startAutoCheck,
    storageKey,
  ]);

  useEffect(() => {
    if (!returnedPaymentStatus) return;
    const paymentStatusKey = `${String(returnedPaymentStatus)}:${orderNumber ?? 'pending'}`;
    if (handledPaymentStatusRef.current === paymentStatusKey) return;
    handledPaymentStatusRef.current = paymentStatusKey;

    const normalizedStatus = String(returnedPaymentStatus).toLowerCase();
    void (async () => {
      const restoredPayment = await restorePayment();
      const nextOrderNumber = orderNumber ?? restoredPayment?.orderNumber;
      if (!nextOrderNumber) {
        if (normalizedStatus === 'cancel' || normalizedStatus === 'decline') {
          setStage('failed');
          setMessage(
            normalizedStatus === 'cancel'
              ? 'Paiement carte annule.'
              : 'Paiement carte refuse. Verifiez votre carte ou essayez un autre moyen.',
          );
        } else {
          setMessage('Retour carte recu. Actualisez le statut avant de relancer un paiement.');
        }
        return;
      }

      const pendingMessage =
        normalizedStatus === 'success'
          ? 'Retour carte recu. Verification FlexPay avant activation.'
          : 'Retour carte recu. Verification du statut avant toute nouvelle tentative.';
      const outcome = await checkPaymentByOrderNumber(nextOrderNumber, {
        checkingStage: 'zwanga_activation',
        pendingStage: 'zwanga_activation',
        pendingMessage,
        suppressErrorDialog: true,
      });
      if (outcome === 'pending' || outcome === 'error') startAutoCheck(nextOrderNumber, pendingMessage);
    })();
  }, [
    checkPaymentByOrderNumber,
    orderNumber,
    restorePayment,
    returnedPaymentStatus,
    startAutoCheck,
  ]);

  useEffect(() => {
    if (!isDriver) return undefined;
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || !orderNumber) return;
      const nextStage = paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation';
      void checkPaymentByOrderNumber(orderNumber, {
        checkingStage: nextStage,
        pendingStage: nextStage,
        pendingMessage: 'Retour dans l app detecte. Nous actualisons cette reference.',
        suppressErrorDialog: true,
      }).then((outcome) => {
        if (mountedRef.current && (outcome === 'pending' || outcome === 'error') && !isAutoChecking) {
          startAutoCheck(orderNumber, 'Retour dans l app detecte. Nous reprenons le suivi.');
        }
      });
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [checkPaymentByOrderNumber, isAutoChecking, isDriver, orderNumber, paymentMethod, startAutoCheck]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardRoot}
      >
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Retour"
            activeOpacity={0.8}
            onPress={() => router.back()}
            style={styles.headerButton}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.gray[900]} />
          </TouchableOpacity>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>Paiement Pro</Text>
            <Text style={styles.headerSubtitle}>Suivi FlexPay en temps reel</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              accessibilityLabel="Actualiser"
              activeOpacity={0.8}
              onPress={refreshEverything}
              style={styles.headerButton}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="refresh-outline" size={20} color={Colors.gray[900]} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Historique"
              activeOpacity={0.8}
              onPress={() => router.push('/payment-history')}
              style={styles.headerButton}
            >
              <Ionicons name="receipt-outline" size={20} color={Colors.gray[900]} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.content, isCompactHeight && styles.contentCompact]}>
          <LinearGradient
            colors={['#FFF7ED', '#FFFFFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.planBand, isCompactHeight && styles.planBandCompact]}
          >
            <View style={styles.planHeaderRow}>
              <View style={styles.planBadge}>
                <Ionicons name="sparkles-outline" size={14} color={Colors.primaryDark} />
                <Text style={styles.planBadgeText}>Conducteur {planLabel}</Text>
              </View>
              <Text style={styles.planPrice}>{priceLabel}</Text>
            </View>
            <Text style={[styles.planTitle, isCompactHeight && styles.planTitleCompact]}>
              Abonnement conducteur
            </Text>
            <Text
              numberOfLines={isTightHeight ? 1 : 2}
              style={[styles.planText, isCompactHeight && styles.planTextCompact]}
            >
              Publiez au-dela des 5 trajets inclus chaque jour des que le paiement est confirme.
            </Text>
          </LinearGradient>

          <View style={[styles.section, isCompactHeight && styles.sectionCompact]}>
            <Text style={styles.sectionLabel}>Moyen de paiement</Text>
            <View style={styles.paymentGrid}>
              {PAYMENT_OPTIONS.map((option) => {
                const isSelected = selectedChannel === option.id;
                const disabled = Boolean(orderNumber) || isBusy || isAutoChecking;
                return (
                  <TouchableOpacity
                    key={option.id}
                    activeOpacity={0.85}
                    disabled={disabled}
                    onPress={() => {
                      setSelectedChannel(option.id);
                      setPaymentMethod(getPaymentMethodForChannel(option.id));
                    }}
                    style={[
                      styles.paymentOption,
                      isSelected && styles.paymentOptionActive,
                      disabled && styles.disabled,
                    ]}
                  >
                    <Ionicons
                      name={option.icon}
                      size={20}
                      color={isSelected ? Colors.primary : Colors.gray[600]}
                    />
                    <View style={styles.paymentOptionText}>
                      <Text style={styles.paymentOptionLabel}>{option.label}</Text>
                      <Text numberOfLines={1} style={styles.paymentOptionHint}>{option.hint}</Text>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {!isCardPayment ? (
            <View style={[styles.section, isCompactHeight && styles.sectionCompact]}>
              <Text style={styles.sectionLabel}>Numero Mobile Money</Text>
              <View
                style={[
                  styles.phoneInputWrapper,
                  isCompactHeight && styles.phoneInputWrapperCompact,
                  Boolean(orderNumber) && styles.disabled,
                ]}
              >
                <Ionicons name="call-outline" size={18} color={Colors.gray[500]} />
                <TextInput
                  editable={!orderNumber && !isBusy && !isAutoChecking}
                  keyboardType="phone-pad"
                  maxLength={13}
                  onChangeText={(text) => setPhone(normalizePaymentPhone(text))}
                  placeholder="+243891234567"
                  placeholderTextColor={Colors.gray[400]}
                  style={styles.phoneInput}
                  value={phone}
                />
              </View>
              {!isTightHeight ? (
                <Text numberOfLines={1} style={styles.inputHint}>
                  FlexPay enverra une confirmation sur ce numero. Validez avec votre PIN.
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={[styles.cardNotice, isCompactHeight && styles.cardNoticeCompact]}>
              <Ionicons name="card-outline" size={20} color={Colors.primary} />
              <Text numberOfLines={isCompactHeight ? 1 : 2} style={styles.cardNoticeText}>
                Le paiement carte s ouvrira dans une page securisee FlexPay.
              </Text>
            </View>
          )}

          <View style={[styles.progressPanel, isCompactHeight && styles.progressPanelCompact]}>
            <View style={styles.progressTrack}>
              {progressSteps.map((step) => {
              const progressColor =
                step.status === 'done'
                  ? Colors.success
                  : step.status === 'error'
                    ? Colors.danger
                    : step.status === 'paused'
                      ? Colors.warningDark
                      : step.status === 'current'
                        ? Colors.primary
                        : Colors.gray[300];
              const iconName =
                step.status === 'done' ? 'checkmark' : step.status === 'error' ? 'close' : step.icon;

              return (
                <View key={step.key} style={styles.progressItem}>
                  <View
                    style={[
                      styles.progressDot,
                      {
                        backgroundColor: step.status === 'waiting' ? Colors.white : progressColor,
                        borderColor: progressColor,
                      },
                    ]}
                  >
                    {step.status === 'current' ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Ionicons
                        name={iconName}
                        size={13}
                        color={step.status === 'waiting' ? Colors.gray[400] : Colors.white}
                      />
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.progressTitle,
                      step.status !== 'waiting' && { color: Colors.gray[900] },
                    ]}
                  >
                    {step.title}
                  </Text>
                </View>
              );
            })}
            </View>
            {highlightedProgressStep ? (
              <Text numberOfLines={2} style={styles.progressDescription}>
                {highlightedProgressStep.description}
              </Text>
            ) : null}
          </View>

          {statusPanel ? (
            <View
              style={[
                styles.statusPanel,
                isCompactHeight && styles.statusPanelCompact,
                { borderColor: statusPanel.color + '35' },
              ]}
            >
              <View style={[styles.statusIcon, { backgroundColor: statusPanel.color + '12' }]}>
                {statusPanel.activity ? (
                  <ActivityIndicator size="small" color={statusPanel.color} />
                ) : (
                  <Ionicons name={statusPanel.icon} size={20} color={statusPanel.color} />
                )}
              </View>
              <View style={styles.statusTextBlock}>
                <Text style={styles.statusTitle}>{statusPanel.title}</Text>
                <Text numberOfLines={isTightHeight ? 1 : 2} style={styles.statusText}>
                  {statusPanel.text}
                </Text>
                {orderNumber ? <Text style={styles.referenceText}>Reference {orderNumber}</Text> : null}
              </View>
            </View>
          ) : null}
        </View>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
          {stage === 'failed' && !orderNumber ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleRetry}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Changer de moyen</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isPrimaryActionDisabled}
            onPress={handlePrimaryAction}
            style={[styles.primaryButton, isPrimaryActionDisabled && styles.disabled]}
          >
            {isBusy ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>{primaryButtonLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  keyboardRoot: {
    flex: 1,
  },
  header: {
    minHeight: 64,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  headerTextBlock: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  headerSubtitle: {
    marginTop: 2,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  contentCompact: {
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  planBand: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '18',
    padding: Spacing.md,
    overflow: 'hidden',
  },
  planBandCompact: {
    paddingVertical: Spacing.sm,
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '10',
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  planBadgeText: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  planPrice: {
    color: Colors.gray[900],
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  planTitle: {
    marginTop: Spacing.sm,
    color: Colors.gray[900],
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  planTitleCompact: {
    marginTop: 6,
    fontSize: FontSizes.lg,
  },
  planText: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  planTextCompact: {
    lineHeight: 16,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionCompact: {
    gap: 6,
  },
  sectionLabel: {
    color: Colors.gray[800],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  paymentOption: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 50,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  paymentOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  paymentOptionText: {
    flex: 1,
  },
  paymentOptionLabel: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  paymentOptionHint: {
    marginTop: 2,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  phoneInputWrapper: {
    minHeight: 48,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  phoneInputWrapperCompact: {
    minHeight: 44,
  },
  phoneInput: {
    flex: 1,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
  },
  inputHint: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  cardNotice: {
    minHeight: 48,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
    backgroundColor: Colors.primary + '08',
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardNoticeCompact: {
    minHeight: 44,
  },
  cardNoticeText: {
    flex: 1,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  progressPanel: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  progressPanelCompact: {
    paddingVertical: 8,
  },
  progressTrack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  progressItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTitle: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  progressDescription: {
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 16,
    textAlign: 'center',
  },
  statusPanel: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  statusPanelCompact: {
    paddingVertical: 8,
  },
  statusIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTextBlock: {
    flex: 1,
  },
  statusTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  statusText: {
    marginTop: 2,
    color: Colors.gray[700],
    fontSize: FontSizes.xs,
    lineHeight: 18,
  },
  referenceText: {
    marginTop: 4,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
    gap: Spacing.sm,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '35',
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  disabled: {
    opacity: 0.6,
  },
});
