import { KycWizardModal, type KycCaptureResult } from '@/components/KycWizardModal';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { VehicleFormModal } from '@/components/VehicleFormModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { useGetPaymentHistoryQuery } from '@/store/api/paymentApi';
import { useGetAverageRatingQuery, useGetReviewsQuery } from '@/store/api/reviewApi';
import {
  useGetPremiumOverviewQuery,
  useGetSubscriptionPlansQuery,
  useLazyCheckSubscriptionPaymentStatusQuery,
  useSubscribeToProMutation,
} from '@/store/api/subscriptionApi';
import { useGetMyDriverOffersQuery, useGetMyTripRequestsQuery } from '@/store/api/tripRequestApi';
import { useGetKycStatusQuery, useGetProfileSummaryQuery, useSendPhoneVerificationOtpMutation, useUpdatePinMutation, useUpdatePinWithOtpMutation, useUpdateUserMutation, useUploadKycMutation, useVerifyPhoneOtpMutation } from '@/store/api/userApi';
import { useCreateVehicleMutation, useDeleteVehicleMutation, useGetVehiclesQuery } from '@/store/api/vehicleApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { performLogout } from '@/store/slices/authSlice';
import type { PaymentHistoryItem, SubscriptionPaymentMethod, SubscriptionPaymentResponse, SubscriptionPlan, Vehicle } from '@/types';
import { createBecomeDriverAction, getApiErrorMessage, isDriverRequiredError } from '@/utils/errorHelpers';
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
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const formatSubscriptionAmount = (amount?: number | string, currency?: string) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return `5000 ${currency || 'CDF'}`;
  const formatted = numericAmount % 1 === 0
    ? Math.round(numericAmount).toString()
    : numericAmount.toFixed(2);
  return `${formatted} ${currency || 'CDF'}`;
};

const formatSubscriptionEndDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getPlanLabel = (plan?: SubscriptionPlan | null) => {
  if (plan === 'pro') return 'Pro';
  if (plan === 'yearly') return 'annuel';
  return 'mensuel';
};

type SubscriptionPaymentChannel = 'mpesa' | 'airtel' | 'orange' | 'card';
type SubscriptionModalStep = 'method' | 'payment';
type SubscriptionCardPaymentResult = 'success' | 'cancel' | 'decline';
type SubscriptionPaymentCheckOutcome = 'success' | 'pending' | 'failed' | 'error';
type SubscriptionPaymentStage =
  | 'idle'
  | 'preparing'
  | 'phone_confirmation'
  | 'card_redirect'
  | 'operator_confirmation'
  | 'zwanga_activation'
  | 'waiting_long'
  | 'success'
  | 'failed';
type SubscriptionPaymentProgressStatus = 'done' | 'current' | 'waiting' | 'paused' | 'error';
type SubscriptionPaymentProgressStep = {
  key: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: SubscriptionPaymentProgressStatus;
  title: string;
};
type StoredSubscriptionPayment = {
  channel: SubscriptionPaymentChannel;
  createdAt: string;
  message?: string | null;
  orderNumber: string;
  paymentMethod: SubscriptionPaymentMethod;
  paymentUrl?: string | null;
  userId: string;
};

const ZWANGA_DOCUMENTS_PACK_URL = 'https://zwanga-app.com/demande-documents';
const SUBSCRIPTION_CARD_PAYMENT_RETURN_PATH = 'subscriptions/payment';
const SUBSCRIPTION_RECENT_PENDING_PAYMENT_MAX_AGE_MS = 30 * 60 * 1000;
const SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_INITIAL_DELAY_MS = 3500;
const SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_INTERVAL_MS = 8000;
const SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_TIMEOUT_MS = 180000;
const SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_MAX_ATTEMPTS = 15;
const SUBSCRIPTION_DEFERRED_BACKEND_SYNC_DELAY_MS = 5000;
WebBrowser.maybeCompleteAuthSession();

const createCardPaymentRedirectUrls = () => {
  const baseUrl = ExpoLinking.createURL(SUBSCRIPTION_CARD_PAYMENT_RETURN_PATH);
  const withStatus = (status: SubscriptionCardPaymentResult) =>
    `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}status=${status}`;

  return {
    approveUrl: withStatus('success'),
    cancelUrl: withStatus('cancel'),
    declineUrl: withStatus('decline'),
    returnUrl: baseUrl,
  };
};
const SUBSCRIPTION_PAYMENT_OPTIONS: {
  id: SubscriptionPaymentChannel;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'mpesa', label: 'M-Pesa', hint: 'Paiement Mobile Money', icon: 'phone-portrait-outline' },
  { id: 'airtel', label: 'Airtel Money', hint: 'Paiement Mobile Money', icon: 'phone-portrait-outline' },
  { id: 'orange', label: 'Orange Money', hint: 'Paiement Mobile Money', icon: 'phone-portrait-outline' },
  { id: 'card', label: 'Carte', hint: 'Visa ou Mastercard', icon: 'card-outline' },
];

const DRC_MOBILE_MONEY_PREFIX = '+243';
const DRC_MOBILE_MONEY_REGEX = /^\+243\d{9}$/;

const normalizePaymentPhone = (value?: string | null) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return trimmed.startsWith('+') ? '+' : '';
  }

  return trimmed.startsWith('+') ? `+${digits}` : digits;
};

const formatCongolesePaymentPhone = (value?: string | null) => {
  const normalized = normalizePaymentPhone(value);
  if (!normalized) return '';

  const digits = normalized.replace(/\D/g, '');
  if (digits.startsWith('243') && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.startsWith('0') && digits.length === 10) {
    return `${DRC_MOBILE_MONEY_PREFIX}${digits.slice(1)}`;
  }

  if (digits.length === 9) {
    return `${DRC_MOBILE_MONEY_PREFIX}${digits}`;
  }

  return normalized;
};

const isValidCongolesePaymentPhone = (value?: string | null) =>
  DRC_MOBILE_MONEY_REGEX.test(formatCongolesePaymentPhone(value));

const getApiMessage = (error: any, fallback: string) => {
  return getApiErrorMessage(error, fallback);
};

const isNetworkOrTimeoutError = (error: any) =>
  error?.status === 'FETCH_ERROR' || error?.status === 'TIMEOUT_ERROR';

const isSubscriptionPaymentComplete = (response?: SubscriptionPaymentResponse | null) =>
  response?.subscription?.status === 'active' || response?.payment?.status === 'succeeded';

const normalizeSubscriptionPaymentMessage = (message?: string | null) =>
  (message ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const isDeclinedSubscriptionPaymentMessage = (message?: string | null) => {
  const normalizedMessage = normalizeSubscriptionPaymentMessage(message);
  return (
    normalizedMessage.includes('annul') ||
    normalizedMessage.includes('cancel') ||
    normalizedMessage.includes('declined') ||
    normalizedMessage.includes('echec') ||
    normalizedMessage.includes('echoue') ||
    normalizedMessage.includes('failed') ||
    normalizedMessage.includes('failure') ||
    normalizedMessage.includes('refuse') ||
    normalizedMessage.includes('rejet') ||
    normalizedMessage.includes('non abouti') ||
    normalizedMessage.includes('non aboutit') ||
    normalizedMessage.includes('not completed') ||
    normalizedMessage.includes('not complete') ||
    normalizedMessage.includes('not successful') ||
    normalizedMessage.includes('solde insuffisant') ||
    normalizedMessage.includes('unsuccessful') ||
    normalizedMessage.includes('insufficient')
  );
};

const getSubscriptionPaymentFailureMessage = (message?: string | null) => {
  const normalizedMessage = normalizeSubscriptionPaymentMessage(message);
  if (
    normalizedMessage.includes('annul') ||
    normalizedMessage.includes('cancel')
  ) {
    return 'Paiement annule. Aucun montant confirme; vous pouvez reessayer.';
  }

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

  if (
    normalizedMessage.includes('non abouti') ||
    normalizedMessage.includes('non aboutit') ||
    normalizedMessage.includes('not completed') ||
    normalizedMessage.includes('not complete') ||
    normalizedMessage.includes('not successful') ||
    normalizedMessage.includes('unsuccessful') ||
    normalizedMessage.includes('echec') ||
    normalizedMessage.includes('echoue') ||
    normalizedMessage.includes('failed') ||
    normalizedMessage.includes('failure')
  ) {
    return 'Paiement non abouti. Aucun montant confirme; vous pouvez relancer une nouvelle tentative.';
  }

  return message || 'Le paiement a echoue. Vous pouvez reessayer ou choisir un autre moyen de paiement.';
};

const isTerminalFailedSubscriptionPaymentStatus = (status?: string | null) => {
  const normalizedStatus = normalizeSubscriptionPaymentMessage(status);
  return (
    normalizedStatus === 'cancel' ||
    normalizedStatus === 'cancelled' ||
    normalizedStatus === 'canceled' ||
    normalizedStatus === 'decline' ||
    normalizedStatus === 'declined' ||
    normalizedStatus === 'expired' ||
    normalizedStatus === 'failed' ||
    normalizedStatus === 'payment_failed' ||
    normalizedStatus === 'rejected'
  );
};

const isSubscriptionPaymentFailed = (response?: SubscriptionPaymentResponse | null) =>
  isTerminalFailedSubscriptionPaymentStatus(response?.payment?.status) ||
  isTerminalFailedSubscriptionPaymentStatus(response?.subscription?.status) ||
  isDeclinedSubscriptionPaymentMessage(response?.payment?.message) ||
  isDeclinedSubscriptionPaymentMessage(response?.payment?.statusCode);

const getCardPaymentResultFromUrl = (url?: string | null): SubscriptionCardPaymentResult | null => {
  if (!url) return null;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('status=success') || lowerUrl.includes('/success')) return 'success';
  if (lowerUrl.includes('status=cancel') || lowerUrl.includes('/cancel')) return 'cancel';
  if (lowerUrl.includes('status=decline') || lowerUrl.includes('/decline')) return 'decline';
  return null;
};

const getSubscriptionPendingPaymentKey = (userId?: string | null) =>
  userId ? `zwanga:subscription:pending-payment:${userId}` : null;

const getSubscriptionPaymentMethodForChannel = (
  channel: SubscriptionPaymentChannel,
): SubscriptionPaymentMethod => (channel === 'card' ? 'card' : 'mobile_money');

const isSubscriptionPaymentChannel = (value: unknown): value is SubscriptionPaymentChannel =>
  value === 'mpesa' || value === 'airtel' || value === 'orange' || value === 'card';

const parseStoredSubscriptionPayment = (value?: string | null): StoredSubscriptionPayment | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredSubscriptionPayment>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.orderNumber !== 'string' || !parsed.orderNumber.trim()) return null;
    if (typeof parsed.userId !== 'string' || !parsed.userId.trim()) return null;
    if (!isSubscriptionPaymentChannel(parsed.channel)) return null;

    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : '';
    const createdAtMs = Date.parse(createdAt);
    if (!Number.isFinite(createdAtMs)) return null;
    if (Date.now() - createdAtMs > SUBSCRIPTION_RECENT_PENDING_PAYMENT_MAX_AGE_MS) return null;

    const paymentMethod =
      parsed.paymentMethod === 'card' || parsed.paymentMethod === 'mobile_money'
        ? parsed.paymentMethod
        : getSubscriptionPaymentMethodForChannel(parsed.channel);

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
    !isDeclinedSubscriptionPaymentMessage(payment.message) &&
    !isDeclinedSubscriptionPaymentMessage(payment.statusCode) &&
    Number.isFinite(createdAtMs) &&
    Date.now() - createdAtMs <= SUBSCRIPTION_RECENT_PENDING_PAYMENT_MAX_AGE_MS
  );
};

const getMostRecentPendingSubscriptionPayment = (payments?: PaymentHistoryItem[] | null) => {
  if (!payments?.length) return null;

  return payments
    .filter(isRecentPendingSubscriptionPayment)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null;
};

const buildStoredSubscriptionPaymentFromHistory = (
  payment: PaymentHistoryItem,
  userId: string,
  fallbackChannel: SubscriptionPaymentChannel,
): StoredSubscriptionPayment | null => {
  if (!payment.orderNumber || !userId) return null;

  const channel = payment.method === 'card' ? 'card' : fallbackChannel === 'card' ? 'mpesa' : fallbackChannel;
  return {
    channel,
    createdAt: payment.createdAt,
    message: payment.message || 'Tentative recente retrouvee cote Zwanga.',
    orderNumber: payment.orderNumber,
    paymentMethod: payment.method === 'card' ? 'card' : 'mobile_money',
    paymentUrl: payment.paymentUrl,
    userId,
  };
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ProfileScreen() {
  const router = useRouter();
  const { openDriverOnboarding, openSubscription, paymentStatus } = useLocalSearchParams<{
    openDriverOnboarding?: string;
    openSubscription?: string;
    paymentStatus?: string;
  }>();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const { changeProfilePhoto, isUploading } = useProfilePhoto();
  const { showDialog } = useDialog();
  const [refreshing, setRefreshing] = useState(false);
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [kycModalVisible, setKycModalVisible] = useState(false);
  const [reviewsModalVisible, setReviewsModalVisible] = useState(false);
  const [kycFrontImage, setKycFrontImage] = useState<string | null>(null);
  const [kycSelfieImage, setKycSelfieImage] = useState<string | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinStep, setPinStep] = useState<'oldPin' | 'otp' | 'newPin'>('oldPin');
  const [forgotPinMode, setForgotPinMode] = useState(false); // true si l'utilisateur a oublié son PIN
  const [oldPin, setOldPin] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '']);
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [openingDocumentsPack, setOpeningDocumentsPack] = useState(false);
  const [subscriptionModalVisible, setSubscriptionModalVisible] = useState(false);
  const [selectedSubscriptionPaymentChannel, setSelectedSubscriptionPaymentChannel] =
    useState<SubscriptionPaymentChannel>('mpesa');
  const [subscriptionModalStep, setSubscriptionModalStep] = useState<SubscriptionModalStep>('method');
  const [subscriptionKeyboardHeight, setSubscriptionKeyboardHeight] = useState(0);
  const [subscriptionPhone, setSubscriptionPhone] = useState('');
  const [subscriptionPaymentOrderNumber, setSubscriptionPaymentOrderNumber] = useState<string | null>(null);
  const [subscriptionPaymentMessage, setSubscriptionPaymentMessage] = useState<string | null>(null);
  const [subscriptionPaymentStage, setSubscriptionPaymentStage] =
    useState<SubscriptionPaymentStage>('idle');
  const [subscriptionPaymentAutoCheckAttempt, setSubscriptionPaymentAutoCheckAttempt] = useState(0);
  const [isSubscriptionPaymentAutoChecking, setIsSubscriptionPaymentAutoChecking] = useState(false);
  const [isRestoringSubscriptionPayment, setIsRestoringSubscriptionPayment] = useState(false);
  const openedDriverOnboardingParamRef = useRef(false);
  const openedSubscriptionParamRef = useRef(false);
  const handledPaymentStatusRef = useRef<string | null>(null);
  const prefilledSubscriptionPhoneRef = useRef(false);
  const subscriptionPaymentPollingRunIdRef = useRef(0);
  const subscriptionPaymentMountedRef = useRef(true);
  const restoredSubscriptionPaymentKeyRef = useRef<string | null>(null);
  const subscriptionDeferredSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oldPinInputRef = useRef<TextInput | null>(null);
  const otpInputRefs = useRef<(TextInput | null)[]>([]);
  const pinInputRef = useRef<TextInput | null>(null);
  const pinConfirmInputRef = useRef<TextInput | null>(null);
  const {
    data: profileSummary,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = useGetProfileSummaryQuery();
  const {
    data: kycStatus,
    isLoading: kycLoading,
    refetch: refetchKycStatus,
  } = useGetKycStatusQuery();
  const {
    data: vehicles,
    isLoading: vehiclesLoading,
    refetch: refetchVehicles,
  } = useGetVehiclesQuery();
  const [createVehicle, { isLoading: creatingVehicle }] = useCreateVehicleMutation();
  const [deleteVehicle, { isLoading: deletingVehicle }] = useDeleteVehicleMutation();
  const [uploadKyc, { isLoading: uploadingKyc }] = useUploadKycMutation();
  const [updatePin, { isLoading: isUpdatingPin }] = useUpdatePinMutation();
  const [updatePinWithOtp, { isLoading: isUpdatingPinWithOtp }] = useUpdatePinWithOtpMutation();
  const [updateUser, { isLoading: isUpdatingUser }] = useUpdateUserMutation();
  const [sendPhoneVerificationOtp] = useSendPhoneVerificationOtpMutation();
  const [verifyPhoneOtp] = useVerifyPhoneOtpMutation();
  const [subscribeToPro, { isLoading: isSubscribingPro }] = useSubscribeToProMutation();
  const [
    checkSubscriptionPaymentStatus,
    { isFetching: isCheckingSubscriptionPayment },
  ] = useLazyCheckSubscriptionPaymentStatusQuery();
  const { data: myTripRequests = [] } = useGetMyTripRequestsQuery();
  const { data: myDriverOffers = [] } = useGetMyDriverOffersQuery();

  const currentUser = profileSummary?.user ?? user;
  const stats = profileSummary?.stats;
  const vehicleList: Vehicle[] = vehicles ?? [];
  const subscriptionPaymentStorageKey = useMemo(
    () => getSubscriptionPendingPaymentKey(currentUser?.id),
    [currentUser?.id],
  );

  // Déterminer si l'utilisateur est conducteur basé sur le role
  const isDriver = useMemo(() => {
    const role = currentUser?.role;
    return role === 'driver' || role === 'both' || Boolean(currentUser?.isDriver);
  }, [currentUser?.isDriver, currentUser?.role]);

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
  const recentPendingSubscriptionPayment = useMemo(
    () => getMostRecentPendingSubscriptionPayment(paymentHistory),
    [paymentHistory],
  );
  const recentPendingSubscriptionOrderNumber = recentPendingSubscriptionPayment?.orderNumber ?? null;
  const paymentHistoryLoaded = Boolean(paymentHistory);

  const isKycApproved = kycStatus?.status === 'approved';
  const isKycPending = kycStatus?.status === 'pending';
  const isKycRejected = kycStatus?.status === 'rejected';
  const isKycBusy = kycSubmitting || uploadingKyc;
  const isKycActionDisabled = isKycBusy || isKycApproved;
  const needsDriverOnboarding = !isDriver || vehicleList.length === 0 || !isKycApproved;

  // console.log("kycstatus:", kycStatus)
  const userId = currentUser?.id ?? '';
  const { data: reviews } = useGetReviewsQuery(userId, {
    skip: !userId,
  });
  const { data: avgRatingData } = useGetAverageRatingQuery(userId, {
    skip: !userId,
  });
  const reviewCount = reviews?.length ?? 0;
  const reviewAverage = useMemo(() => {
    if (avgRatingData?.averageRating !== undefined) {
      return avgRatingData.averageRating;
    }
    if (!reviews || reviews.length === 0) {
      return currentUser?.rating ?? 0;
    }
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return total / reviews.length;
  }, [avgRatingData?.averageRating, reviews, currentUser?.rating]);
  const featuredReviews = useMemo(() => (reviews ?? []).slice(0, 3), [reviews]);
  const proPlan = useMemo(
    () => subscriptionPlans.find((plan) => plan.plan === 'pro') ?? subscriptionPlans[0],
    [subscriptionPlans],
  );
  const isPremiumActive = Boolean(
    premiumOverview?.isPremium || premiumOverview?.isActive || currentUser?.isPremium || currentUser?.premiumBadge,
  );
  const proPriceLabel = formatSubscriptionAmount(proPlan?.amount, proPlan?.currency);
  const proEndDateLabel = formatSubscriptionEndDate(premiumOverview?.endDate);
  const isSubscriptionPaymentBlocking =
    isSubscribingPro ||
    isCheckingSubscriptionPayment ||
    isRestoringSubscriptionPayment;
  const proBusy =
    premiumOverviewFetching ||
    isSubscriptionPaymentBlocking;
  const isSubscriptionCardPayment = selectedSubscriptionPaymentChannel === 'card';
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
            title: 'Reference creee',
            description: 'Zwanga garde une reference unique pour eviter un double paiement.',
            icon: 'lock-closed-outline',
          },
          {
            key: 'card',
            title: 'Page carte',
            description: 'Finalisez le paiement dans la page securisee FlexPay.',
            icon: 'card-outline',
          },
          {
            key: 'activation',
            title: 'Activation Zwanga',
            description: 'Nous activons l abonnement des que FlexPay confirme.',
            icon: 'shield-checkmark-outline',
          },
        ]
      : [
          {
            key: 'preparing',
            title: 'Reference creee',
            description: 'Zwanga garde une reference unique pour eviter un double paiement.',
            icon: 'lock-closed-outline',
          },
          {
            key: 'phone',
            title: 'Confirmation telephone',
            description: 'Validez la demande Mobile Money avec votre PIN.',
            icon: 'phone-portrait-outline',
          },
          {
            key: 'operator',
            title: 'Retour operateur',
            description:
              subscriptionPaymentAutoCheckAttempt > 0
                ? `Verification automatique ${subscriptionPaymentAutoCheckAttempt}/${SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_MAX_ATTEMPTS}.`
                : 'Nous attendons le retour de l operateur.',
            icon: 'radio-outline',
          },
          {
            key: 'activation',
            title: 'Activation Zwanga',
            description: 'Nous activons l abonnement des que FlexPay confirme.',
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
          'Nous synchronisons l abonnement depuis Zwanga. La reference FlexPay reste en memoire sans relancer de verification externe.',
        showActivity: true,
        title: 'Synchronisation abonnement',
      };
    }

    if (subscriptionPaymentStage === 'failed') {
      return {
        icon: 'close-circle-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          'Le paiement n a pas ete confirme. Vous pouvez reessayer avec le meme moyen ou en choisir un autre.',
        showActivity: false,
        title: 'Paiement non confirme',
      };
    }

    if (isSubscribingPro) {
      return {
        icon: 'lock-closed-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          'Creation d une reference securisee FlexPay. Cette etape est limitee pour ne pas bloquer l app trop longtemps.',
        showActivity: true,
        title: 'Preparation du paiement',
      };
    }

    if (isCheckingSubscriptionPayment) {
      return {
        icon: 'sync-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          'Verification du statut chez FlexPay. Si le paiement est confirme, l abonnement sera active automatiquement.',
        showActivity: true,
        title: 'Verification FlexPay',
      };
    }

    if (isSubscriptionPaymentAutoChecking) {
      return {
        icon: 'time-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          `Suivi automatique en cours (${subscriptionPaymentAutoCheckAttempt}/${SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_MAX_ATTEMPTS}). Vous pouvez fermer ce modal; la reference reste gardee.`,
        showActivity: true,
        title: 'Suivi du paiement',
      };
    }

    if (subscriptionPaymentStage === 'waiting_long') {
      return {
        icon: 'time-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          'Le paiement est encore en traitement. Zwanga garde la reference et reprendra la verification au retour dans l app.',
        showActivity: false,
        title: 'Toujours en traitement',
      };
    }

    if (subscriptionPaymentOrderNumber || subscriptionPaymentMessage) {
      return {
        icon: 'information-circle-outline' as keyof typeof Ionicons.glyphMap,
        message:
          subscriptionPaymentMessage ||
          'Votre abonnement n est pas encore actif. Une tentative existe deja; actualisez le statut avant toute nouvelle tentative.',
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
    Platform.OS === 'android' && subscriptionModalVisible
      ? Math.max(subscriptionKeyboardHeight - insets.bottom, 0)
      : 0;
  const subscriptionModalCardKeyboardStyle =
    Platform.OS === 'android' && subscriptionModalKeyboardOffset > 0
      ? {
          marginBottom: subscriptionModalKeyboardOffset,
          maxHeight: '74%' as const,
        }
      : null;
  const { shouldShow: shouldShowProfileGuide, complete: completeProfileGuide } =
    useTutorialGuide('profile_screen');
  const [profileGuideVisible, setProfileGuideVisible] = useState(false);

  useEffect(() => {
    if (shouldShowProfileGuide) {
      setProfileGuideVisible(true);
    }
  }, [shouldShowProfileGuide]);

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
  }, []);

  useEffect(() => {
    if (prefilledSubscriptionPhoneRef.current || !currentUser?.phone) {
      return;
    }
    setSubscriptionPhone(formatCongolesePaymentPhone(currentUser.phone));
    prefilledSubscriptionPhoneRef.current = true;
  }, [currentUser?.phone]);

  useEffect(() => () => {
    subscriptionPaymentMountedRef.current = false;
    subscriptionPaymentPollingRunIdRef.current += 1;
    if (subscriptionDeferredSyncTimerRef.current) {
      clearTimeout(subscriptionDeferredSyncTimerRef.current);
      subscriptionDeferredSyncTimerRef.current = null;
    }
  }, []);

  const handleDismissProfileGuide = () => {
    setProfileGuideVisible(false);
    completeProfileGuide();
  };

  // Calculer les statistiques détaillées pour les demandes
  const tripRequestsStats = useMemo(() => {
    const totalRequests = myTripRequests.length;
    const activeRequests = myTripRequests.filter(
      (req) => req.status === 'pending' || req.status === 'offers_received'
    ).length;
    const requestsWithOffers = myTripRequests.filter(
      (req) => req.status === 'offers_received' && (req.offers?.length || 0) > 0
    ).length;
    const completedRequests = myTripRequests.filter(
      (req) => req.status === 'driver_selected'
    ).length;
    return { totalRequests, activeRequests, requestsWithOffers, completedRequests };
  }, [myTripRequests]);

  // Calculer les statistiques détaillées pour les offres
  const offersStats = useMemo(() => {
    const totalOffers = myDriverOffers.length;
    const pendingOffers = myDriverOffers.filter((offer) => offer.status === 'pending').length;
    const acceptedOffers = myDriverOffers.filter((offer) => offer.status === 'accepted').length;
    const rejectedOffers = myDriverOffers.filter((offer) => offer.status === 'rejected').length;
    return { totalOffers, pendingOffers, acceptedOffers, rejectedOffers };
  }, [myDriverOffers]);

  const derivedStats = useMemo(
    () => [
      {
        label: 'Trajets publiés',
        value: stats?.tripsAsDriver ?? currentUser?.totalTrips ?? 0,
        color: Colors.primary,
      },
      {
        label: 'Réservations (passager)',
        value: stats?.bookingsAsPassenger ?? 0,
        color: Colors.secondary,
      },
      {
        label: 'Réservations (conducteur)',
        value: stats?.bookingsAsDriver ?? 0,
        color: Colors.info,
      },
      {
        label: 'Avis reçus',
        value: reviewCount,
        color: Colors.warning,
      },
    ],
    [currentUser?.totalTrips, stats, reviewCount],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const refreshTasks: Promise<unknown>[] = [
        Promise.resolve(refetchProfile()),
        Promise.resolve(refetchVehicles()),
        Promise.resolve(refetchKycStatus()),
      ];
      if (isDriver) {
        refreshTasks.push(Promise.resolve(refetchPremiumOverview()));
        refreshTasks.push(Promise.resolve(refetchPaymentHistory()));
      }
      await Promise.all(refreshTasks);
    } finally {
      setRefreshing(false);
    }
  };

  const resetVehicleForm = useCallback(() => {
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleColor('');
    setVehiclePlate('');
  }, []);

  const closeVehicleModal = useCallback(() => {
    setVehicleModalVisible(false);
    resetVehicleForm();
  }, [resetVehicleForm]);

  const vehicleModalCopy = {
    title: 'Ajouter un v\u00e9hicule',
    subtitle: 'Indiquez les d\u00e9tails exacts de votre v\u00e9hicule pour rassurer vos passagers.',
  };

  // Handlers optimisés pour éviter les re-renders
  const handleVehicleBrandChange = useCallback((text: string) => {
    setVehicleBrand(text);
  }, []);

  const handleVehicleModelChange = useCallback((text: string) => {
    setVehicleModel(text);
  }, []);

  const handleVehicleColorChange = useCallback((text: string) => {
    setVehicleColor(text);
  }, []);

  const handleVehiclePlateChange = useCallback((text: string) => {
    setVehiclePlate(text);
  }, []);

  const resetKycForm = () => {
    setKycFrontImage(null);
    setKycSelfieImage(null);
  };

  useEffect(() => {
    if (!kycModalVisible) {
      resetKycForm();
      setKycSubmitting(false);
    }
  }, [kycModalVisible]);

  const handleAddVehicle = async () => {
    if (!vehicleBrand.trim() || !vehicleModel.trim() || !vehicleColor.trim() || !vehiclePlate.trim()) {
      showDialog({
        variant: 'warning',
        title: 'Champs requis',
        message: 'Merci de renseigner la marque, le modèle, la couleur et la plaque.',
      });
      return;
    }

    try {
      await createVehicle({
        brand: vehicleBrand.trim(),
        model: vehicleModel.trim(),
        color: vehicleColor.trim(),
        licensePlate: vehiclePlate.trim(),
      }).unwrap();
      closeVehicleModal();
      void Promise.allSettled([refetchVehicles(), refetchProfile()]);
      showDialog({
        variant: 'success',
        title: 'V\u00e9hicule ajout\u00e9',
        message: 'Votre v\u00e9hicule est maintenant disponible dans votre profil.',
      });
    } catch (error: any) {
      const message = getApiErrorMessage(
        error,
        'Impossible d\'ajouter le véhicule pour le moment.',
      );
      const isDriverError = isDriverRequiredError(error);
      
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message,
        actions: isDriverError
          ? [
              { label: 'Fermer', variant: 'ghost' },
              createBecomeDriverAction(router),
            ]
          : undefined,
      });
    }
  };

  const handleDeleteVehicle = useCallback((vehicle: Vehicle) => {
    showDialog({
      variant: 'warning',
      title: 'Supprimer le véhicule',
      message: `Êtes-vous sûr de vouloir supprimer ${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate}) ? Cette action est irréversible.`,
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Supprimer',
          variant: 'primary',
          onPress: async () => {
            try {
              await deleteVehicle(vehicle.id).unwrap();
              await refetchVehicles();
              showDialog({
                variant: 'success',
                title: 'Véhicule supprimé',
                message: 'Le véhicule a été supprimé avec succès.',
              });
            } catch (error: any) {
              const message =
                error?.data?.message ?? error?.error ?? 'Impossible de supprimer le véhicule pour le moment.';
              const isDriverError = isDriverRequiredError(error);
              
              showDialog({
                variant: 'danger',
                title: 'Erreur',
                message: Array.isArray(message) ? message.join('\n') : message,
                actions: isDriverError
                  ? [
                      { label: 'Fermer', variant: 'ghost' },
                      createBecomeDriverAction(router),
                    ]
                  : undefined,
              });
            }
          },
        },
      ],
    });
  }, [deleteVehicle, refetchVehicles, router, showDialog]);

  const handleOpenKycModal = () => {
    if (isKycApproved) {
      showDialog({
        variant: 'info',
        title: 'KYC validé',
        message: 'Vos documents sont déjà vérifiés. Contactez notre support si vous devez les modifier.',
        actions: [
          { label: 'Plus tard', variant: 'ghost' },
          { label: 'Support', variant: 'primary', onPress: () => router.push('/support') },
        ],
      });
      return;
    }
    setKycModalVisible(true);
  };

  const handleCloseKycModal = () => {
    if (kycSubmitting || uploadingKyc) {
      return;
    }
    setKycModalVisible(false);
  };

  const handleBecomeDriver = async () => {
    try {
      const formData = new FormData();
      // Mettre à jour le rôle vers "driver"
      formData.append('role', 'driver');
      
      await updateUser(formData).unwrap();
      
      showDialog({
        variant: 'success',
        title: 'Félicitations ! 🎉',
        message: 'Votre compte conducteur a été activé avec succès. Vous pouvez maintenant publier des trajets et gagner de l\'argent.',
        actions: [
          {
            label: 'Publier un trajet',
            variant: 'primary',
            onPress: () => router.push('/publish'),
          },
          {
            label: 'Plus tard',
            variant: 'ghost',
          },
        ],
      });
    } catch (error: any) {
      console.error('Erreur lors de l\'activation du compte conducteur:', error);
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: error?.data?.message || 'Impossible d\'activer le compte conducteur. Veuillez réessayer.',
      });
    }
  };

  const handleStartDriverOnboarding = () => {
    const hasVehicle = vehicleList.length > 0;
    const hasKyc = isKycApproved;

    if (!hasVehicle && !hasKyc) {
      showDialog({
        variant: 'info',
        title: 'Devenir conducteur',
        message: 'Pour devenir conducteur, vous devez :\n\n1. Ajouter un véhicule\n2. Compléter la vérification d\'identité (KYC)\n\nSouhaitez-vous commencer par ajouter un véhicule ?',
        actions: [
          { label: 'Plus tard', variant: 'ghost' },
          {
            label: 'Ajouter un véhicule',
            variant: 'primary',
            onPress: () => {
              resetVehicleForm();
              setVehicleModalVisible(true);
            },
          },
        ],
      });
      return;
    }

    if (!hasVehicle) {
      resetVehicleForm();
      setVehicleModalVisible(true);
      return;
    }

    if (!hasKyc) {
      handleOpenKycModal();
      return;
    }

    void handleBecomeDriver();
  };

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
        console.warn('[Profile] External URL fallback failed:', linkingError);
      }

      console.warn('[Profile] External URL open failed:', browserError);
      throw new Error('Impossible d ouvrir le lien externe.');
    }
  };

  const closeSubscriptionModal = () => {
    if (
      isSubscribingPro ||
      isCheckingSubscriptionPayment ||
      isRestoringSubscriptionPayment
    ) {
      return;
    }
    Keyboard.dismiss();
    setSubscriptionModalVisible(false);
    setSubscriptionModalStep('method');
    setSubscriptionKeyboardHeight(0);
    if (!subscriptionPaymentOrderNumber) {
      setSubscriptionPaymentStage('idle');
      setSubscriptionPaymentAutoCheckAttempt(0);
    }
  };

  const stopSubscriptionPaymentAutoCheck = useCallback(() => {
    subscriptionPaymentPollingRunIdRef.current += 1;
    if (subscriptionPaymentMountedRef.current) {
      setIsSubscriptionPaymentAutoChecking(false);
    }
  }, []);

  const clearStoredSubscriptionPayment = useCallback(async () => {
    if (!subscriptionPaymentStorageKey) {
      return;
    }

    try {
      await AsyncStorage.removeItem(subscriptionPaymentStorageKey);
    } catch (error) {
      console.warn('[Profile] Failed to clear pending subscription payment:', error);
    }
  }, [subscriptionPaymentStorageKey]);

  const readStoredSubscriptionPayment = useCallback(async () => {
    if (!subscriptionPaymentStorageKey || !currentUser?.id) {
      return null;
    }

    try {
      const rawValue = await AsyncStorage.getItem(subscriptionPaymentStorageKey);
      const storedPayment = parseStoredSubscriptionPayment(rawValue);
      if (!storedPayment || storedPayment.userId !== currentUser.id) {
        if (rawValue) {
          await AsyncStorage.removeItem(subscriptionPaymentStorageKey);
        }
        return null;
      }

      if (!paymentHistoryLoaded) {
        return null;
      }

      if (
        !recentPendingSubscriptionOrderNumber ||
        storedPayment.orderNumber !== recentPendingSubscriptionOrderNumber
      ) {
        await AsyncStorage.removeItem(subscriptionPaymentStorageKey);
        return null;
      }

      return storedPayment;
    } catch (error) {
      console.warn('[Profile] Failed to read pending subscription payment:', error);
      return null;
    }
  }, [
    currentUser?.id,
    paymentHistoryLoaded,
    recentPendingSubscriptionOrderNumber,
    subscriptionPaymentStorageKey,
  ]);

  const persistStoredSubscriptionPayment = useCallback(async (
    payment: Omit<StoredSubscriptionPayment, 'createdAt' | 'userId'>,
  ) => {
    if (!subscriptionPaymentStorageKey || !currentUser?.id || !payment.orderNumber) {
      return;
    }

    const storedPayment: StoredSubscriptionPayment = {
      ...payment,
      createdAt: new Date().toISOString(),
      userId: currentUser.id,
    };

    try {
      await AsyncStorage.setItem(subscriptionPaymentStorageKey, JSON.stringify(storedPayment));
    } catch (error) {
      console.warn('[Profile] Failed to store pending subscription payment:', error);
    }
  }, [currentUser?.id, subscriptionPaymentStorageKey]);

  const finishSubscriptionPayment = useCallback(async (response: SubscriptionPaymentResponse) => {
    if (!isSubscriptionPaymentComplete(response)) {
      return false;
    }

    stopSubscriptionPaymentAutoCheck();
    await clearStoredSubscriptionPayment();
    await Promise.allSettled([
      Promise.resolve(refetchPremiumOverview()),
      Promise.resolve(refetchProfile()),
    ]);
    setSubscriptionPaymentStage('success');
    setSubscriptionPaymentAutoCheckAttempt(0);
    setSubscriptionModalVisible(false);
    setSubscriptionModalStep('method');
    setSubscriptionPaymentOrderNumber(null);
    setSubscriptionPaymentMessage(null);
    setSubscriptionPaymentStage('idle');
    showDialog({
      variant: 'success',
      title: 'Abonnement actif',
      message: 'Votre abonnement conducteur est actif. Vous pouvez publier plus de 5 trajets par jour.',
    });
    return true;
  }, [clearStoredSubscriptionPayment, refetchPremiumOverview, refetchProfile, showDialog, stopSubscriptionPaymentAutoCheck]);

  const checkSubscriptionPaymentByOrderNumber = useCallback(async (
    orderNumber: string,
    options?: {
      checkingStage?: SubscriptionPaymentStage;
      pendingMessage?: string;
      pendingStage?: SubscriptionPaymentStage;
      suppressErrorDialog?: boolean;
      silentErrorMessage?: string;
    },
  ) => {
    try {
      setSubscriptionPaymentOrderNumber(orderNumber);
      setSubscriptionPaymentStage(options?.checkingStage ?? 'zwanga_activation');
      const response = await checkSubscriptionPaymentStatus(orderNumber).unwrap();
      if (await finishSubscriptionPayment(response)) {
        return 'success' as SubscriptionPaymentCheckOutcome;
      }

      if (isSubscriptionPaymentFailed(response)) {
        stopSubscriptionPaymentAutoCheck();
        await clearStoredSubscriptionPayment();
        setSubscriptionPaymentOrderNumber(null);
        setSubscriptionPaymentStage('failed');
        setSubscriptionPaymentMessage(
          getSubscriptionPaymentFailureMessage(response.payment.message),
        );
        return 'failed' as SubscriptionPaymentCheckOutcome;
      }

      setSubscriptionPaymentStage(options?.pendingStage ?? 'operator_confirmation');
      setSubscriptionPaymentMessage(
        options?.pendingMessage ||
          response.payment.message ||
          'Paiement en attente chez FlexPay. Confirmez sur votre telephone ou terminez la page carte; nous continuons la verification.',
      );
      return 'pending' as SubscriptionPaymentCheckOutcome;
    } catch (error: any) {
      if (options?.suppressErrorDialog) {
        setSubscriptionPaymentStage(options.pendingStage ?? 'operator_confirmation');
        setSubscriptionPaymentMessage(
          options.silentErrorMessage ||
            'La verification prend plus de temps que prevu. Ne relancez pas le paiement; la reference reste gardee.',
        );
        return 'error' as SubscriptionPaymentCheckOutcome;
      }

      showDialog({
        variant: 'danger',
        title: 'Verification impossible',
        message: getApiMessage(error, 'Impossible de verifier ce paiement pour le moment.'),
      });
      return 'error' as SubscriptionPaymentCheckOutcome;
    }
  }, [
    checkSubscriptionPaymentStatus,
    clearStoredSubscriptionPayment,
    finishSubscriptionPayment,
    showDialog,
    stopSubscriptionPaymentAutoCheck,
    subscriptionPaymentOrderNumber,
  ]);

  const startSubscriptionPaymentAutoCheck = useCallback((
    orderNumber: string,
    initialMessage?: string | null,
  ) => {
    if (!orderNumber) {
      return;
    }

    const runId = subscriptionPaymentPollingRunIdRef.current + 1;
    subscriptionPaymentPollingRunIdRef.current = runId;
    setIsSubscriptionPaymentAutoChecking(true);
    setSubscriptionPaymentAutoCheckAttempt(0);
    setSubscriptionPaymentStage(isSubscriptionCardPayment ? 'zwanga_activation' : 'phone_confirmation');
    setSubscriptionPaymentMessage(
      initialMessage ||
        'Demande envoyee a FlexPay. Confirmez sur votre telephone; nous actualisons quelques instants sans bloquer l app.',
    );

    void (async () => {
      const deadline = Date.now() + SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_TIMEOUT_MS;
      let attempt = 0;
      let nextDelay = SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_INITIAL_DELAY_MS;

      while (
        subscriptionPaymentMountedRef.current &&
        subscriptionPaymentPollingRunIdRef.current === runId
      ) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0 || attempt >= SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_MAX_ATTEMPTS) {
          break;
        }

        await wait(Math.min(nextDelay, remainingMs));

        if (
          !subscriptionPaymentMountedRef.current ||
          subscriptionPaymentPollingRunIdRef.current !== runId
        ) {
          return;
        }

        attempt += 1;
        setSubscriptionPaymentAutoCheckAttempt(attempt);
        setSubscriptionPaymentStage(
          isSubscriptionCardPayment ? 'zwanga_activation' : 'operator_confirmation',
        );
        const outcome = await checkSubscriptionPaymentByOrderNumber(orderNumber, {
          checkingStage: isSubscriptionCardPayment ? 'zwanga_activation' : 'operator_confirmation',
          pendingStage: isSubscriptionCardPayment ? 'zwanga_activation' : 'operator_confirmation',
          pendingMessage:
            attempt === 1
              ? 'Verification rapide en cours. Si la demande est sur votre telephone, confirmez-la avec votre PIN Mobile Money.'
              : 'Paiement toujours en traitement. Nous continuons les actualisations automatiques; inutile de relancer le paiement.',
          suppressErrorDialog: true,
          silentErrorMessage:
            'La verification prend plus de temps que prevu. Nous gardons la reference et continuons le suivi.',
        });

        if (
          !subscriptionPaymentMountedRef.current ||
          subscriptionPaymentPollingRunIdRef.current !== runId
        ) {
          return;
        }

        if (outcome === 'success' || outcome === 'failed') {
          setIsSubscriptionPaymentAutoChecking(false);
          return;
        }

        nextDelay = SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_INTERVAL_MS;
      }

      if (
        subscriptionPaymentMountedRef.current &&
        subscriptionPaymentPollingRunIdRef.current === runId
      ) {
        setIsSubscriptionPaymentAutoChecking(false);
        setSubscriptionPaymentStage('waiting_long');
        setSubscriptionPaymentMessage(
          'Le paiement est encore en traitement. Ne payez pas une deuxieme fois; la reference reste gardee et Zwanga reprendra la verification.',
        );
      }
    })();
  }, [checkSubscriptionPaymentByOrderNumber, isSubscriptionCardPayment]);

  const openCardPaymentUrl = useCallback(async (
    paymentUrl: string,
    orderNumber: string | null,
    returnUrl: string,
  ) => {
    setSubscriptionPaymentStage('card_redirect');
    const result = await WebBrowser.openAuthSessionAsync(paymentUrl, returnUrl);

    if (result.type !== 'success') {
      if (orderNumber) {
        const pendingMessage = 'Retour dans l app detecte. Nous verifions le statut carte chez FlexPay.';
        setSubscriptionPaymentStage('zwanga_activation');
        setSubscriptionPaymentMessage(pendingMessage);
        const outcome = await checkSubscriptionPaymentByOrderNumber(orderNumber, {
          checkingStage: 'zwanga_activation',
          pendingStage: 'zwanga_activation',
          pendingMessage,
          suppressErrorDialog: true,
          silentErrorMessage:
            'Retour detecte, mais la verification prend plus de temps que prevu. La reference reste gardee.',
        });

        if (outcome === 'pending' || outcome === 'error') {
          startSubscriptionPaymentAutoCheck(orderNumber, pendingMessage);
        }
        return;
      }

      setSubscriptionPaymentMessage(
        'Le paiement carte a ete ferme avant le retour FlexPay. Vous pouvez rouvrir la page ou verifier le statut.',
      );
      return;
    }

    const paymentResult = getCardPaymentResultFromUrl(result.url);
    if (paymentResult === 'cancel') {
      if (orderNumber) {
        const pendingMessage = 'Retour carte recu. Verification FlexPay avant toute nouvelle tentative.';
        const outcome = await checkSubscriptionPaymentByOrderNumber(orderNumber, {
          checkingStage: 'zwanga_activation',
          pendingStage: 'zwanga_activation',
          pendingMessage,
          suppressErrorDialog: true,
          silentErrorMessage:
            'Retour carte recu, mais la verification prend plus de temps que prevu. La reference reste gardee.',
        });
        if (outcome === 'pending' || outcome === 'error') {
          startSubscriptionPaymentAutoCheck(orderNumber, pendingMessage);
        }
        return;
      }

      setSubscriptionPaymentStage('failed');
      setSubscriptionPaymentMessage('Paiement carte annule. Vous pouvez relancer le paiement.');
      return;
    }

    if (paymentResult === 'decline') {
      if (orderNumber) {
        const pendingMessage = 'Retour carte recu. Verification FlexPay avant toute nouvelle tentative.';
        const outcome = await checkSubscriptionPaymentByOrderNumber(orderNumber, {
          checkingStage: 'zwanga_activation',
          pendingStage: 'zwanga_activation',
          pendingMessage,
          suppressErrorDialog: true,
          silentErrorMessage:
            'Retour carte recu, mais la verification prend plus de temps que prevu. La reference reste gardee.',
        });
        if (outcome === 'pending' || outcome === 'error') {
          startSubscriptionPaymentAutoCheck(orderNumber, pendingMessage);
        }
        return;
      }

      setSubscriptionPaymentStage('failed');
      setSubscriptionPaymentMessage('Paiement carte refuse. Verifiez votre carte ou essayez un autre moyen.');
      return;
    }

    if (!orderNumber) {
      setSubscriptionPaymentMessage(
        'Retour du paiement carte recu, mais la reference FlexPay est manquante. Revenez dans un instant et verifiez le statut.',
      );
      return;
    }

    const outcome = await checkSubscriptionPaymentByOrderNumber(
      orderNumber,
      {
        checkingStage: 'zwanga_activation',
        pendingStage: 'zwanga_activation',
        pendingMessage:
          paymentResult === 'success'
            ? 'Paiement carte valide cote FlexPay, activation en cours.'
            : 'Retour carte recu. Verification FlexPay en cours avant activation.',
      },
    );

    if (outcome === 'pending' || outcome === 'error') {
      startSubscriptionPaymentAutoCheck(
        orderNumber,
        'Retour carte recu. Nous verifions automatiquement l activation.',
      );
    }
  }, [checkSubscriptionPaymentByOrderNumber, startSubscriptionPaymentAutoCheck]);

  const applyStoredSubscriptionPayment = useCallback((storedPayment: StoredSubscriptionPayment) => {
    setSelectedSubscriptionPaymentChannel(storedPayment.channel);
    setSubscriptionPaymentOrderNumber(storedPayment.orderNumber);
    setSubscriptionPaymentStage(
      storedPayment.paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation',
    );
    setSubscriptionPaymentMessage(
      storedPayment.message ||
        'Abonnement non actif. Une tentative existe deja; nous gardons cette reference avant toute nouvelle tentative.',
    );
    setSubscriptionModalStep('payment');
  }, []);

  const refreshSubscriptionFromBackend = useCallback(async (
    options?: {
      closeModalOnActive?: boolean;
      pendingMessage?: string | null;
      showSuccessDialog?: boolean;
    },
  ) => {
    if (!isDriver) {
      return false;
    }

    const [overviewResult] = await Promise.allSettled([
      refetchPremiumOverview().unwrap(),
      Promise.resolve(refetchProfile()),
      Promise.resolve(refetchPaymentHistory()),
    ]);

    const overview = overviewResult.status === 'fulfilled' ? overviewResult.value : null;
    if (overview?.isPremium || overview?.isActive) {
      stopSubscriptionPaymentAutoCheck();
      await clearStoredSubscriptionPayment();
      setSubscriptionPaymentOrderNumber(null);
      setSubscriptionPaymentMessage(null);
      setSubscriptionPaymentStage('idle');
      setSubscriptionPaymentAutoCheckAttempt(0);
      setSubscriptionModalStep('method');
      if (options?.closeModalOnActive) {
        setSubscriptionModalVisible(false);
      }
      if (options?.showSuccessDialog) {
        showDialog({
          variant: 'success',
          title: 'Abonnement actif',
          message: 'Votre abonnement conducteur est actif. Vous pouvez publier plus de 5 trajets par jour.',
        });
      }
      return true;
    }

    if (options?.pendingMessage) {
      setSubscriptionPaymentStage(subscriptionPaymentOrderNumber ? 'operator_confirmation' : 'idle');
      setSubscriptionPaymentMessage(options.pendingMessage);
    }
    return false;
  }, [
    clearStoredSubscriptionPayment,
    isDriver,
    refetchPremiumOverview,
    refetchPaymentHistory,
    refetchProfile,
    showDialog,
    stopSubscriptionPaymentAutoCheck,
  ]);

  const restoreRecentPendingSubscriptionPayment = useCallback(async (
    message?: string | null,
  ) => {
    if (!currentUser?.id) {
      return null;
    }

    try {
      const latestPaymentHistory = await refetchPaymentHistory().unwrap();
      const latestPendingPayment = getMostRecentPendingSubscriptionPayment(latestPaymentHistory);
      const storedPayment = latestPendingPayment
        ? buildStoredSubscriptionPaymentFromHistory(
            latestPendingPayment,
            currentUser.id,
            selectedSubscriptionPaymentChannel,
          )
        : null;

      if (!storedPayment) {
        return null;
      }

      applyStoredSubscriptionPayment(storedPayment);
      if (message) {
        setSubscriptionPaymentMessage(message);
      }
      await persistStoredSubscriptionPayment({
        channel: storedPayment.channel,
        message: message || storedPayment.message,
        orderNumber: storedPayment.orderNumber,
        paymentMethod: storedPayment.paymentMethod,
        paymentUrl: storedPayment.paymentUrl,
      });

      return storedPayment;
    } catch {
      return null;
    }
  }, [
    applyStoredSubscriptionPayment,
    currentUser?.id,
    persistStoredSubscriptionPayment,
    refetchPaymentHistory,
    selectedSubscriptionPaymentChannel,
  ]);

  const scheduleDeferredSubscriptionSync = useCallback((
    message?: string | null,
  ) => {
    if (subscriptionDeferredSyncTimerRef.current) {
      clearTimeout(subscriptionDeferredSyncTimerRef.current);
    }

    subscriptionDeferredSyncTimerRef.current = setTimeout(() => {
      subscriptionDeferredSyncTimerRef.current = null;
      if (!subscriptionPaymentMountedRef.current) {
        return;
      }

      void (async () => {
        const restoredPayment = await restoreRecentPendingSubscriptionPayment(message);
        if (restoredPayment?.orderNumber) {
          setSubscriptionModalStep('payment');
          setSubscriptionPaymentMessage(
            message ||
              'Reference paiement retrouvee cote Zwanga. Evitez de relancer; le suivi automatique reprend.',
          );
          startSubscriptionPaymentAutoCheck(
            restoredPayment.orderNumber,
            message ||
              'Reference paiement retrouvee cote Zwanga. Nous reprenons le suivi automatique.',
          );
          return;
        }

        await refreshSubscriptionFromBackend({
          pendingMessage:
            message ||
            'Paiement encore en traitement cote Zwanga. Evitez de relancer immediatement.',
        });
      })();
    }, SUBSCRIPTION_DEFERRED_BACKEND_SYNC_DELAY_MS);
  }, [
    refreshSubscriptionFromBackend,
    restoreRecentPendingSubscriptionPayment,
    startSubscriptionPaymentAutoCheck,
  ]);

  const closeIfPremiumAlreadyActive = useCallback(async () => {
    if (!isDriver) {
      return false;
    }

    try {
      return await refreshSubscriptionFromBackend({
        closeModalOnActive: true,
        showSuccessDialog: true,
      });
    } catch {
      return false;
    }
  }, [isDriver, refreshSubscriptionFromBackend]);

  const resumeExistingSubscriptionPayment = useCallback(async (
    storedPayment?: StoredSubscriptionPayment | null,
    options?: {
      openCardPayment?: boolean;
      pendingMessage?: string;
    },
  ) => {
    const paymentToResume = storedPayment ?? await readStoredSubscriptionPayment();
    const orderNumber = paymentToResume?.orderNumber ?? subscriptionPaymentOrderNumber;
    if (!orderNumber) {
      return null;
    }

    const pendingMessage =
      options?.pendingMessage ||
      'Un paiement existe deja. Nous verifions cette reference avant toute nouvelle tentative pour eviter un double debit.';

    if (paymentToResume) {
      applyStoredSubscriptionPayment(paymentToResume);
    }
    setSubscriptionModalVisible(true);
    setSubscriptionModalStep('payment');
    setSubscriptionPaymentOrderNumber(orderNumber);
    setSubscriptionPaymentStage(
      paymentToResume?.paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation',
    );
    setSubscriptionPaymentMessage(pendingMessage);

    const outcome = await checkSubscriptionPaymentByOrderNumber(orderNumber, {
      checkingStage: paymentToResume?.paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation',
      pendingStage: paymentToResume?.paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation',
      pendingMessage,
      suppressErrorDialog: true,
      silentErrorMessage:
        'Paiement deja lance. La verification prend plus de temps que prevu; la reference reste gardee.',
    });

    if (outcome === 'success' || outcome === 'failed') {
      return outcome;
    }

    if (options?.openCardPayment && paymentToResume?.paymentMethod === 'card' && paymentToResume.paymentUrl) {
      const cardRedirectUrls = createCardPaymentRedirectUrls();
      await openCardPaymentUrl(paymentToResume.paymentUrl, orderNumber, cardRedirectUrls.returnUrl);
      return outcome;
    }

    if (!isSubscriptionPaymentAutoChecking) {
      startSubscriptionPaymentAutoCheck(orderNumber, pendingMessage);
    }

    return outcome;
  }, [
    applyStoredSubscriptionPayment,
    checkSubscriptionPaymentByOrderNumber,
    isSubscriptionPaymentAutoChecking,
    openCardPaymentUrl,
    readStoredSubscriptionPayment,
    startSubscriptionPaymentAutoCheck,
    subscriptionPaymentOrderNumber,
  ]);

  const handleSubscribePro = async () => {
    if (needsDriverOnboarding) {
      handleStartDriverOnboarding();
      return;
    }

    if (isPremiumActive) {
      return;
    }

    router.push('/subscriptions/payment' as any);
  };

  const handleOpenDocumentsPack = async () => {
    try {
      setOpeningDocumentsPack(true);
      await openExternalUrl(ZWANGA_DOCUMENTS_PACK_URL);
    } catch {
      showDialog({
        variant: 'danger',
        title: 'Redirection impossible',
        message: `Impossible d'ouvrir le site pour le moment. Vous pouvez aller sur ${ZWANGA_DOCUMENTS_PACK_URL}.`,
      });
    } finally {
      setOpeningDocumentsPack(false);
    }
  };

  const handleContinueSubscriptionPayment = () => {
    Keyboard.dismiss();

    if (!isSubscriptionCardPayment && !subscriptionPhone.trim()) {
      setSubscriptionPhone(DRC_MOBILE_MONEY_PREFIX);
    }
    setSubscriptionModalStep('payment');
  };

  const handleBackToSubscriptionMethod = () => {
    Keyboard.dismiss();
    if (!subscriptionPaymentOrderNumber) {
      setSubscriptionPaymentStage('idle');
      setSubscriptionPaymentAutoCheckAttempt(0);
    }
    setSubscriptionModalStep('method');
  };

  const handleSubmitSubscriptionPayment = async () => {
    if (subscriptionPaymentOrderNumber) {
      const hasRecentBackendPayment =
        recentPendingSubscriptionOrderNumber === subscriptionPaymentOrderNumber || isSubscriptionPaymentAutoChecking;

      if (hasRecentBackendPayment) {
        await resumeExistingSubscriptionPayment(null, {
          openCardPayment: isSubscriptionCardPayment,
          pendingMessage:
            'Paiement deja lance. Nous verifions cette reference avant de rouvrir ou relancer le paiement.',
        });
        return;
      }

      await clearStoredSubscriptionPayment();
      setSubscriptionPaymentOrderNumber(null);
      setSubscriptionPaymentMessage(null);
    }

    const storedPayment = await readStoredSubscriptionPayment();
    if (storedPayment) {
      await resumeExistingSubscriptionPayment(storedPayment, {
        openCardPayment: storedPayment.paymentMethod === 'card',
        pendingMessage:
          'Paiement deja lance. Nous verifions cette reference avant de rouvrir ou relancer le paiement.',
      });
      return;
    }

    const phone = formatCongolesePaymentPhone(subscriptionPhone);
    const paymentMethod = isSubscriptionCardPayment ? 'card' : 'mobile_money';

    if (!isSubscriptionCardPayment && !phone) {
      showDialog({
        variant: 'warning',
        title: 'Numero requis',
        message: 'Entrez le numero Mobile Money qui recevra la demande de paiement.',
      });
      return;
    }

    if (!isSubscriptionCardPayment && !isValidCongolesePaymentPhone(phone)) {
      showDialog({
        variant: 'warning',
        title: 'Numero invalide',
        message: 'Le numero Mobile Money doit commencer par +243, par exemple +243891234567.',
      });
      return;
    }

    try {
      stopSubscriptionPaymentAutoCheck();
      setSubscriptionPaymentStage('preparing');
      setSubscriptionPaymentAutoCheckAttempt(0);
      setSubscriptionPaymentMessage(
        'Preparation du paiement avec FlexPay. Patientez quelques secondes; la reference sera gardee des qu elle revient.',
      );
      if (!isSubscriptionCardPayment) {
        setSubscriptionPhone(phone);
      }

      if (await closeIfPremiumAlreadyActive()) {
        return;
      }

      const cardRedirectUrls = isSubscriptionCardPayment
        ? createCardPaymentRedirectUrls()
        : null;
      const response = await subscribeToPro({
        paymentMethod,
        phone: isSubscriptionCardPayment ? undefined : phone,
        ...(cardRedirectUrls
          ? {
              approveUrl: cardRedirectUrls.approveUrl,
              cancelUrl: cardRedirectUrls.cancelUrl,
              declineUrl: cardRedirectUrls.declineUrl,
            }
          : {}),
      }).unwrap();

      if (await finishSubscriptionPayment(response)) {
        return;
      }

      if (isSubscriptionPaymentFailed(response)) {
        await clearStoredSubscriptionPayment();
        setSubscriptionPaymentOrderNumber(null);
        setSubscriptionPaymentMessage(getSubscriptionPaymentFailureMessage(response.payment.message));
        setSubscriptionPaymentStage('failed');
        return;
      }

      setSubscriptionPaymentOrderNumber(response.payment.orderNumber);
      if (response.payment.orderNumber) {
        await persistStoredSubscriptionPayment({
          channel: selectedSubscriptionPaymentChannel,
          message: response.payment.message,
          orderNumber: response.payment.orderNumber,
          paymentMethod,
          paymentUrl: response.payment.paymentUrl,
        });
      }

      if (response.payment.paymentUrl) {
        setSubscriptionPaymentStage('card_redirect');
        setSubscriptionPaymentMessage(
          'Page carte FlexPay ouverte. Finalisez le paiement; au retour, l app actualisera l abonnement sans relancer le paiement.',
        );
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

      if (!isSubscriptionCardPayment && response.payment.orderNumber) {
        const pendingMessage =
          response.payment.message ||
          'Demande envoyee sur votre telephone. Confirmez avec votre PIN Mobile Money; Zwanga activera l abonnement des que FlexPay confirme.';
        setSubscriptionPaymentStage('phone_confirmation');
        setSubscriptionPaymentMessage(pendingMessage);
        startSubscriptionPaymentAutoCheck(response.payment.orderNumber, pendingMessage);
        return;
      }

      setSubscriptionPaymentStage(response.payment.orderNumber ? 'operator_confirmation' : 'preparing');
      setSubscriptionPaymentMessage(
        response.payment.message ||
          'Demande de paiement creee. Confirmez sur votre telephone; la reference reste disponible pour le suivi.',
      );
    } catch (error: any) {
      if (isNetworkOrTimeoutError(error)) {
        const pendingMessage =
          'Le lancement prend plus de temps que prevu. Ne relancez pas le paiement; nous verifions Zwanga dans quelques secondes.';
        setSubscriptionModalStep('payment');
        setSubscriptionPaymentStage('operator_confirmation');
        setSubscriptionPaymentMessage(pendingMessage);
        const restoredPayment = await restoreRecentPendingSubscriptionPayment(pendingMessage);
        if (restoredPayment?.orderNumber) {
          startSubscriptionPaymentAutoCheck(restoredPayment.orderNumber, pendingMessage);
          return;
        }

        scheduleDeferredSubscriptionSync(pendingMessage);
        showDialog({
          variant: 'info',
          title: 'Paiement en traitement',
          message:
            'La reponse met du temps a revenir. Evitez de payer une deuxieme fois; ouvrez ce modal dans quelques instants, le suivi reprendra.',
        });
        return;
      }

      setSubscriptionPaymentStage('failed');
      showDialog({
        variant: 'danger',
        title: 'Paiement impossible',
        message: getApiMessage(error, 'Impossible de lancer le paiement pour le moment.'),
      });
    }
  };

  const handleCheckSubscriptionPayment = async () => {
    const orderNumber = subscriptionPaymentOrderNumber ?? (await readStoredSubscriptionPayment())?.orderNumber;
    if (!orderNumber) {
      showDialog({
        variant: 'warning',
        title: 'Paiement introuvable',
        message: 'Lancez d abord le paiement avant d actualiser son statut.',
      });
      return;
    }

    stopSubscriptionPaymentAutoCheck();
    const outcome = await checkSubscriptionPaymentByOrderNumber(orderNumber, {
      checkingStage: isSubscriptionCardPayment ? 'zwanga_activation' : 'operator_confirmation',
      pendingStage: isSubscriptionCardPayment ? 'zwanga_activation' : 'operator_confirmation',
      pendingMessage:
        'Actualisation lancee. Si le paiement est confirme, Zwanga activera l abonnement automatiquement.',
    });
    if (outcome === 'pending' || outcome === 'error') {
      startSubscriptionPaymentAutoCheck(
        orderNumber,
        'Nous continuons le suivi automatique de cette reference.',
      );
    }
  };

  useEffect(() => {
    if (!subscriptionPaymentStorageKey || !currentUser?.id) {
      restoredSubscriptionPaymentKeyRef.current = null;
      return;
    }

    if (!paymentHistoryLoaded) {
      return;
    }

    if (isPremiumActive) {
      restoredSubscriptionPaymentKeyRef.current = null;
      void clearStoredSubscriptionPayment();
      return;
    }

    if (restoredSubscriptionPaymentKeyRef.current === subscriptionPaymentStorageKey) {
      return;
    }

    restoredSubscriptionPaymentKeyRef.current = subscriptionPaymentStorageKey;
    let cancelled = false;
    setIsRestoringSubscriptionPayment(true);

    void (async () => {
      const storedPayment = await readStoredSubscriptionPayment();
      if (!storedPayment || cancelled) {
        return;
      }

      applyStoredSubscriptionPayment(storedPayment);
      await refreshSubscriptionFromBackend({
        pendingMessage:
          'Paiement precedent retrouve. Nous actualisons l abonnement depuis Zwanga. Evitez de relancer un paiement.',
      });
    })().finally(() => {
      if (!cancelled) {
        setIsRestoringSubscriptionPayment(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    applyStoredSubscriptionPayment,
    clearStoredSubscriptionPayment,
    currentUser?.id,
    refreshSubscriptionFromBackend,
    isPremiumActive,
    readStoredSubscriptionPayment,
    paymentHistoryLoaded,
    subscriptionPaymentStorageKey,
  ]);

  useEffect(() => {
    if (
      !paymentHistoryLoaded ||
      isPremiumActive ||
      isSubscriptionPaymentAutoChecking ||
      !subscriptionPaymentOrderNumber
    ) {
      return;
    }

    if (subscriptionPaymentOrderNumber === recentPendingSubscriptionOrderNumber) {
      return;
    }

    void clearStoredSubscriptionPayment();
    setSubscriptionPaymentOrderNumber(null);
    setSubscriptionPaymentMessage(null);
    setSubscriptionModalStep('method');
  }, [
    clearStoredSubscriptionPayment,
    isPremiumActive,
    isSubscriptionPaymentAutoChecking,
    paymentHistoryLoaded,
    recentPendingSubscriptionOrderNumber,
    subscriptionPaymentOrderNumber,
  ]);

  useEffect(() => {
    if (!isDriver) {
      return undefined;
    }

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      if (subscriptionPaymentOrderNumber) {
        const pendingMessage =
          'Retour dans l app detecte. Nous actualisons cette reference sans relancer de paiement.';
        void checkSubscriptionPaymentByOrderNumber(subscriptionPaymentOrderNumber, {
          checkingStage: isSubscriptionCardPayment ? 'zwanga_activation' : 'operator_confirmation',
          pendingStage: isSubscriptionCardPayment ? 'zwanga_activation' : 'operator_confirmation',
          pendingMessage,
          suppressErrorDialog: true,
          silentErrorMessage:
            'Retour dans l app detecte. La verification prend plus de temps que prevu; nous gardons la reference.',
        }).then((outcome) => {
          if (
            subscriptionPaymentMountedRef.current &&
            (outcome === 'pending' || outcome === 'error') &&
            !isSubscriptionPaymentAutoChecking
          ) {
            startSubscriptionPaymentAutoCheck(subscriptionPaymentOrderNumber, pendingMessage);
          }
        });
        return;
      }

      void refreshSubscriptionFromBackend();
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [
    checkSubscriptionPaymentByOrderNumber,
    isDriver,
    isSubscriptionCardPayment,
    isSubscriptionPaymentAutoChecking,
    refreshSubscriptionFromBackend,
    startSubscriptionPaymentAutoCheck,
    subscriptionPaymentOrderNumber,
  ]);

  useEffect(() => {
    if (openedSubscriptionParamRef.current || !openSubscription || !currentUser) {
      return;
    }

    openedSubscriptionParamRef.current = true;
    if (isDriver) {
      router.replace(
        paymentStatus
          ? { pathname: '/subscriptions/payment', params: { paymentStatus: String(paymentStatus) } }
          : ({ pathname: '/subscriptions/payment' } as any),
      );
    }
  }, [currentUser, isDriver, openSubscription, paymentStatus, router]);

  useEffect(() => {
    if (
      openedDriverOnboardingParamRef.current ||
      !openDriverOnboarding ||
      !currentUser ||
      vehiclesLoading ||
      kycLoading
    ) {
      return;
    }

    openedDriverOnboardingParamRef.current = true;
    if (needsDriverOnboarding) {
      handleStartDriverOnboarding();
    }
  }, [
    currentUser,
    handleStartDriverOnboarding,
    kycLoading,
    needsDriverOnboarding,
    openDriverOnboarding,
    vehiclesLoading,
  ]);

  useEffect(() => {
    const paymentStatusKey = paymentStatus ? `screen:${String(paymentStatus)}` : null;
    if (!paymentStatusKey || handledPaymentStatusRef.current === paymentStatusKey) {
      return;
    }

    handledPaymentStatusRef.current = paymentStatusKey;
    router.replace({
      pathname: '/subscriptions/payment',
      params: { paymentStatus: String(paymentStatus) },
    } as any);
  }, [paymentStatus, router]);

  const buildKycFormData = (files?: Partial<KycCaptureResult>) => {
    const formData = new FormData();
    const appendFile = (field: 'cniFront' | 'selfie', uri: string | null | undefined) => {
      if (!uri) return;
      const extensionMatch = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
      const extension = extensionMatch && extensionMatch.length <= 5 ? extensionMatch : 'jpg';
      const mimeType =
        extension === 'png'
          ? 'image/png'
          : extension === 'webp'
            ? 'image/webp'
            : extension === 'heic'
              ? 'image/heic'
              : 'image/jpeg';
      formData.append(field, {
        uri,
        type: mimeType,
        name: `${field}-${Date.now()}.${extension === 'jpg' ? 'jpg' : extension}`,
      } as any);
    };

    appendFile('cniFront', files?.front ?? kycFrontImage);
    appendFile('selfie', files?.selfie ?? kycSelfieImage);

    return formData;
  };

  const handleSubmitKyc = async (documents?: Partial<KycCaptureResult>) => {
    const front = documents?.front ?? kycFrontImage;
    const selfie = documents?.selfie ?? kycSelfieImage;

    if (!front || !selfie) {
      showDialog({
        variant: 'warning',
        title: 'Documents requis',
        message: 'Merci de fournir le recto de votre pièce ainsi qu\'un selfie.',
      });
      return;
    }
    try {
      setKycSubmitting(true);
      const formData = buildKycFormData({ front, selfie });
      const result = await uploadKyc(formData).unwrap();
      setKycModalVisible(false);
      
      // Refetch immédiatement pour obtenir le statut mis à jour
      await Promise.all([refetchKycStatus(), refetchProfile()]);
      
      // Vérifier le statut retourné par le backend
      const kycStatusAfterUpload = result?.status;
      
      if (kycStatusAfterUpload === 'approved') {
        // KYC approuvé immédiatement (validation automatique réussie)
        showDialog({
          variant: 'success',
          title: 'KYC validé avec succès !',
          message: 'Votre identité a été vérifiée automatiquement. Vous pouvez maintenant accéder à toutes les fonctionnalités de l\'application.',
        });
      } else if (kycStatusAfterUpload === 'rejected') {
        // KYC rejeté (validation automatique échouée)
        const rejectionReason = result?.rejectionReason || 'Votre demande KYC a été rejetée.';
        showDialog({
          variant: 'danger',
          title: 'KYC rejeté',
          message: rejectionReason,
        });
      } else {
        // KYC en attente (validation manuelle requise)
        showDialog({
          variant: 'success',
          title: 'Documents envoyés',
          message: 'Vos documents sont en cours de vérification. Nous vous informerons dès que la vérification sera terminée.',
        });
      }
    } catch (error: any) {
      // Gérer les erreurs détaillées du backend
      let errorMessage = error?.data?.message ?? error?.error ?? 'Impossible de soumettre les documents pour le moment.';
      
      // Si le message est une chaîne, la traiter directement
      if (typeof errorMessage === 'string') {
        // Le backend peut retourner des messages multi-lignes avec des détails
        errorMessage = errorMessage;
      } else if (Array.isArray(errorMessage)) {
        errorMessage = errorMessage.join('\n');
      }
      
      showDialog({
        variant: 'danger',
        title: 'Erreur KYC',
        message: errorMessage,
      });
    } finally {
      setKycSubmitting(false);
    }
  };

  const handleKycWizardComplete = async (payload: KycCaptureResult) => {
    setKycFrontImage(payload.front);
    setKycSelfieImage(payload.selfie);
    await handleSubmitKyc(payload);
  };

  useEffect(() => {
    if (isKycApproved && kycModalVisible) {
      setKycModalVisible(false);
    }
  }, [isKycApproved, kycModalVisible]);

  const badges = [
    ...(currentUser?.role === 'driver'
      ? [{ icon: 'car', color: Colors.primary, label: 'Conducteur' }]
      : []),
    ...(isKycApproved
      ? [{ icon: 'shield-checkmark', color: Colors.success, label: 'KYC validé' }]
      : []),
  ];

  // Handlers pour la modification du PIN
  const handleOpenPinModal = () => {
    setPinModalVisible(true);
    setPinStep('oldPin');
    setForgotPinMode(false);
    setOldPin('');
    setOtpCode(['', '', '', '', '']);
    setNewPin('');
    setNewPinConfirm('');
    // Focus sur le champ de l'ancien PIN
    setTimeout(() => {
      oldPinInputRef.current?.focus();
    }, 100);
  };

  const handleForgotPin = async () => {
    setForgotPinMode(true);
    setPinStep('otp');
    setOldPin('');
    setOtpCode(['', '', '', '', '']);
    
    // Envoyer automatiquement l'OTP
    try {
      setIsSendingOtp(true);
      await sendPhoneVerificationOtp({ phone: currentUser?.phone || '', context: 'update' }).unwrap();
      showDialog({
        variant: 'success',
        title: 'Code envoyé',
        message: 'Un code de vérification a été envoyé à votre numéro de téléphone.',
      });
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: error?.data?.message || 'Erreur lors de l\'envoi du code',
      });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleOtpInputChange = (value: string, index: number) => {
    const sanitized = value.replace(/\D/g, '');
    if (sanitized.length > 1) {
      const digits = sanitized.split('');
      const updated = [...otpCode];
      let cursor = index;
      digits.forEach((digit) => {
        if (cursor <= updated.length - 1) updated[cursor] = digit;
        cursor += 1;
      });
      setOtpCode(updated);
      if (cursor <= updated.length - 1) otpInputRefs.current[cursor]?.focus();
      else otpInputRefs.current[updated.length - 1]?.blur();
      return;
    }
    const nextCode = [...otpCode];
    nextCode[index] = sanitized;
    setOtpCode(nextCode);
    if (sanitized && index < nextCode.length - 1) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
    if (event.nativeEvent.key === 'Backspace') {
      if (otpCode[index]) {
        const updated = [...otpCode];
        updated[index] = '';
        setOtpCode(updated);
      } else if (index > 0) {
        otpInputRefs.current[index - 1]?.focus();
        const updated = [...otpCode];
        updated[index - 1] = '';
        setOtpCode(updated);
      }
    }
  };

  const handleVerifyOtpForPinChange = async () => {
    const code = otpCode.join('');
    if (code.length !== 5) {
      showDialog({ variant: 'danger', title: 'Code incomplet', message: 'Veuillez entrer le code complet (5 chiffres)' });
      return;
    }

    try {
      await verifyPhoneOtp({ phone: currentUser?.phone || '', otp: code }).unwrap();
      setPinStep('newPin');
      setTimeout(() => {
        pinInputRef.current?.focus();
      }, 100);
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Code invalide',
        message: error?.data?.message || 'Code OTP invalide ou expiré',
      });
    }
  };

  // Handler pour ancien PIN - champ texte normal
  const handleOldPinChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 4); // Max 4 chiffres
    setOldPin(sanitized);
  };

  const handleVerifyOldPin = () => {
    if (oldPin.length !== 4) {
      showDialog({ variant: 'danger', title: 'PIN incomplet', message: 'Veuillez entrer votre code PIN actuel (4 chiffres)' });
      return;
    }
    // Passer à l'étape de saisie du nouveau PIN
    setPinStep('newPin');
    setTimeout(() => {
      pinInputRef.current?.focus();
    }, 100);
  };

  // Handlers pour nouveau PIN - champs texte normaux
  const handleNewPinChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 4); // Max 4 chiffres
    setNewPin(sanitized);
  };

  const handleNewPinConfirmChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 4); // Max 4 chiffres
    setNewPinConfirm(sanitized);
  };

  const handleUpdatePin = async () => {
    if (newPin.length !== 4) {
      showDialog({ variant: 'danger', title: 'PIN incomplet', message: 'Veuillez entrer un PIN à 4 chiffres' });
      return;
    }
    
    if (newPinConfirm.length !== 4) {
      showDialog({ variant: 'danger', title: 'Confirmation incomplète', message: 'Veuillez confirmer votre PIN' });
      return;
    }
    
    if (newPin !== newPinConfirm) {
      showDialog({ variant: 'danger', title: 'PIN non correspondant', message: 'Les deux codes PIN ne correspondent pas' });
      setNewPinConfirm('');
      pinConfirmInputRef.current?.focus();
      return;
    }

    if (!forgotPinMode && oldPin === newPin) {
      showDialog({ variant: 'danger', title: 'PIN identique', message: 'Le nouveau PIN doit être différent de l\'ancien PIN' });
      return;
    }

    try {
      if (forgotPinMode) {
        // Utiliser updatePinWithOtp si l'utilisateur a oublié son PIN
        // Note: L'OTP doit être vérifié avant d'appeler cette fonction
        await updatePinWithOtp({
          newPin: newPin,
        }).unwrap();
      } else {
        // Utiliser updatePin (l'ancien PIN est vérifié côté serveur via l'authentification)
        await updatePin({
          newPin: newPin,
        }).unwrap();
      }
      
      setPinModalVisible(false);
      setPinStep('oldPin');
      setForgotPinMode(false);
      setOldPin('');
      setNewPin('');
      setNewPinConfirm('');
      setOtpCode(['', '', '', '', '']);
      
      showDialog({
        variant: 'success',
        title: 'PIN modifié',
        message: 'Votre code PIN a été modifié avec succès.',
      });
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: error?.data?.message || 'Erreur lors de la modification du PIN',
      });
      // En cas d'erreur, réinitialiser et revenir à l'étape de l'ancien PIN
      setOldPin('');
      setNewPin('');
      setNewPinConfirm('');
      setPinStep('oldPin');
      setTimeout(() => {
        oldPinInputRef.current?.focus();
      }, 100);
    }
  };

  // Calculer les compteurs pour les demandes de trajet
  const tripRequestsCount = useMemo(() => {
    const activeRequests = myTripRequests.filter(
      (req) => req.status === 'pending' || req.status === 'offers_received'
    );
    return activeRequests.length;
  }, [myTripRequests]);

  const tripRequestsWithOffersCount = useMemo(() => {
    return myTripRequests.filter(
      (req) => req.status === 'offers_received' && (req.offers?.length || 0) > 0
    ).length;
  }, [myTripRequests]);

  // Calculer les compteurs pour les offres
  const pendingOffersCount = useMemo(() => {
    return myDriverOffers.filter((offer) => offer.status === 'pending').length;
  }, [myDriverOffers]);

  const acceptedOffersCount = useMemo(() => {
    return myDriverOffers.filter((offer) => offer.status === 'accepted').length;
  }, [myDriverOffers]);

  const menuItems = [
    { icon: 'person-outline', label: 'Modifier le profil', route: '/edit-profile' },
    { icon: 'lock-closed-outline', label: 'Modifier le code PIN', route: null, onPress: handleOpenPinModal },
    { icon: 'star-outline', label: 'Lieux favoris', route: '/favorite-locations' },
    {
      icon: 'document-text-outline',
      label: 'Mes demandes de trajet',
      route: '/my-requests',
      badge: tripRequestsCount > 0 ? tripRequestsCount : undefined,
      badgeColor: tripRequestsWithOffersCount > 0 ? Colors.info : Colors.warning,
    },
    ...(isDriver
      ? [
          { icon: 'list-outline', label: 'Demandes disponibles', route: '/requests' },
        ]
      : []),
    { icon: 'notifications-outline', label: 'Notifications', route: '/notifications' },
    { icon: 'settings-outline', label: 'Paramètres', route: '/settings' },
    { icon: 'help-circle-outline', label: 'Aide & Support', route: '/support' },
  ];

  const handleLogout = () => {
    dispatch(performLogout());
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View style={styles.header}>
          <LinearGradient
            colors={[Colors.primary, '#2563EB']}
            style={styles.headerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Mon Profil</Text>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => router.push('/settings')}
            >
              <Ionicons name="settings-outline" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.userInfo}>
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={changeProfilePhoto}
              disabled={isUploading}
              activeOpacity={0.8}
            >
              <View style={styles.avatarWrapper}>
                {currentUser?.profilePicture || user?.avatar ? (
                  <Image
                    source={{ uri: currentUser?.profilePicture ?? user?.avatar ?? undefined }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarEmoji}>👤</Text>
                  </View>
                )}
                {isUploading && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="small" color={Colors.white} />
                  </View>
                )}
              </View>
              {currentUser?.identityVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-sharp" size={14} color={Colors.white} />
                </View>
              )}
              <TouchableOpacity 
                style={styles.cameraBadge}
                onPress={changeProfilePhoto}
                disabled={isUploading}
              >
                <Ionicons name="camera" size={14} color={Colors.white} />
              </TouchableOpacity>
            </TouchableOpacity>
            
            <Text style={styles.userName}>{currentUser?.name || 'Utilisateur'}</Text>
            <View style={styles.userPhoneRow}>
              <Ionicons name="call-outline" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.userPhone}>{currentUser?.phone || ''}</Text>
            </View>

            <View style={styles.headerStats}>
              <View style={styles.headerStatItem}>
                <Ionicons name="star" size={16} color={Colors.secondary} />
                <Text style={styles.headerStatValue}>{reviewAverage.toFixed(1)}</Text>
                <Text style={styles.headerStatLabel}>Note</Text>
              </View>
              <View style={styles.headerStatDivider} />
              <View style={styles.headerStatItem}>
                <Ionicons name="car-outline" size={18} color={Colors.white} />
                <Text style={styles.headerStatValue}>{stats?.tripsAsDriver ?? currentUser?.totalTrips ?? 0}</Text>
                <Text style={styles.headerStatLabel}>Trajets</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.mainActionsContainer}>
          <TouchableOpacity
            style={[styles.mainActionCard, { borderColor: Colors.primary + '30' }]}
            onPress={() => router.push('/bookings')}
          >
            <View style={[styles.mainActionIcon, { backgroundColor: Colors.primary + '15' }]}>
              <Ionicons name="calendar" size={24} color={Colors.primary} />
            </View>
            <View style={styles.mainActionContent}>
              <Text style={styles.mainActionTitle}>Réservations</Text>
              <Text style={styles.mainActionSubtitle} numberOfLines={1}>
                {stats?.bookingsAsPassenger ?? 0} Passager · {stats?.bookingsAsDriver ?? 0} Conducteur
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[300]} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainActionCard, { borderColor: Colors.warning + '30' }]}
            onPress={() => router.push('/my-requests')}
          >
            <View style={[styles.mainActionIcon, { backgroundColor: Colors.warning + '15' }]}>
              <Ionicons name="document-text" size={24} color={Colors.warning} />
            </View>
            <View style={styles.mainActionContent}>
              <Text style={styles.mainActionTitle}>Mes Demandes</Text>
              <Text style={styles.mainActionSubtitle} numberOfLines={1}>
                {tripRequestsStats.activeRequests} actives · {tripRequestsStats.requestsWithOffers} offres
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[300]} />
          </TouchableOpacity>


          {/* Section "Devenir conducteur" pour les passagers */}
          {needsDriverOnboarding && (
            <Animated.View entering={FadeInDown.delay(200)}>
              <TouchableOpacity
                style={styles.becomeDriverCard}
                disabled={isUpdatingUser}
                onPress={handleStartDriverOnboarding}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[Colors.secondary, '#F59E0B']}
                  style={styles.becomeDriverGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.becomeDriverContent}>
                    <View style={styles.becomeDriverIconContainer}>
                      <Ionicons name="car-sport" size={32} color={Colors.white} />
                    </View>
                    <View style={styles.becomeDriverTextContainer}>
                      <Text style={styles.becomeDriverTitle}>Devenir conducteur</Text>
                      <Text style={styles.becomeDriverSubtitle}>
                        {"Gagnez de l'argent en proposant des trajets"}
                      </Text>
                      <View style={styles.becomeDriverProgress}>
                        <View style={styles.becomeDriverProgressItem}>
                          <Ionicons
                            name={vehicleList.length > 0 ? 'checkmark-circle' : 'ellipse-outline'}
                            size={16}
                            color={vehicleList.length > 0 ? Colors.white : 'rgba(255,255,255,0.6)'}
                          />
                          <Text
                            style={[
                              styles.becomeDriverProgressText,
                              vehicleList.length > 0 && styles.becomeDriverProgressTextCompleted,
                            ]}
                          >
                            Véhicule
                          </Text>
                        </View>
                        <View style={styles.becomeDriverProgressItem}>
                          <Ionicons
                            name={isKycApproved ? 'checkmark-circle' : 'ellipse-outline'}
                            size={16}
                            color={isKycApproved ? Colors.white : 'rgba(255,255,255,0.6)'}
                          />
                          <Text
                            style={[
                              styles.becomeDriverProgressText,
                              isKycApproved && styles.becomeDriverProgressTextCompleted,
                            ]}
                          >
                            KYC
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  {isUpdatingUser ? (
                    <ActivityIndicator size="small" color={Colors.white} style={styles.becomeDriverArrow} />
                  ) : (
                    <Ionicons name="arrow-forward-circle" size={24} color={Colors.white} style={styles.becomeDriverArrow} />
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(260)}>
            <View style={[styles.proCard, isPremiumActive && styles.proCardActive]}>
              <View style={styles.proHeader}>
                <View style={[styles.proIcon, isPremiumActive && styles.proIconActive]}>
                  <Ionicons
                    name={isPremiumActive ? 'shield-checkmark' : 'sparkles-outline'}
                    size={22}
                    color={isPremiumActive ? Colors.white : Colors.primary}
                  />
                </View>
                <View style={styles.proTitleContent}>
                  <View style={styles.proTitleRow}>
                    <Text style={styles.proTitle}>Zwanga Pro</Text>
                    {isPremiumActive && (
                      <View style={styles.proBadge}>
                        <Text style={styles.proBadgeText}>Actif</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.proSubtitle} numberOfLines={2}>
                    {!needsDriverOnboarding
                      ? '5 trajets par jour inclus, abonnement pour publier sans blocage.'
                      : 'Completez votre profil conducteur avant de publier des trajets.'}
                  </Text>
                </View>
              </View>

              <View style={styles.proBenefitRow}>
                <View style={styles.proBenefitPill}>
                  <Ionicons name="ribbon-outline" size={14} color={Colors.primary} />
                  <Text style={styles.proBenefitText}>{proPriceLabel}/mois</Text>
                </View>
                <View style={styles.proBenefitPill}>
                  <Ionicons name="trending-up-outline" size={14} color={Colors.info} />
                  <Text style={styles.proBenefitText}>Plus de 5 trajets/jour</Text>
                </View>
              </View>

              {!needsDriverOnboarding && premiumOverview?.documentFundingEnabled && (
                <Text style={styles.proFundingText} numberOfLines={2}>
                  {"Financement documents jusqu'à "}
                  {formatSubscriptionAmount(
                    premiumOverview.documentFundingLimit ?? undefined,
                    premiumOverview.documentFundingCurrency,
                  )}
                  {'.'}
                </Text>
              )}

              {needsDriverOnboarding ? (
                <TouchableOpacity
                  style={styles.proPrimaryButton}
                  onPress={handleStartDriverOnboarding}
                  disabled={isUpdatingUser}
                  activeOpacity={0.85}
                >
                  {isUpdatingUser ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <>
                      <Text style={styles.proPrimaryButtonText}>Devenir conducteur</Text>
                      <Ionicons name="arrow-forward" size={16} color={Colors.white} />
                    </>
                  )}
                </TouchableOpacity>
              ) : isPremiumActive ? (
                <View style={styles.proActivePanel}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                  <Text style={styles.proActiveText} numberOfLines={2}>
                    Pack {getPlanLabel(premiumOverview?.plan)} actif
                    {proEndDateLabel ? ` jusqu'au ${proEndDateLabel}` : ''}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.proSecondaryButton}
                  onPress={handleSubscribePro}
                  disabled={proBusy}
                  activeOpacity={0.85}
                >
                  {proBusy ? (
                    <ActivityIndicator color={Colors.primary} />
                  ) : (
                    <>
                      <Text style={styles.proSecondaryButtonText}>
                        {"S'abonner \u00e0 Zwanga Pro"}
                      </Text>
                      <Text style={styles.proSecondaryPrice}>{proPriceLabel}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>

          {!needsDriverOnboarding && (
            <Animated.View entering={FadeInDown.delay(300)}>
              <View style={styles.documentPackCard}>
                <View style={styles.documentPackHeader}>
                  <View style={styles.documentPackIcon}>
                    <Ionicons name="documents-outline" size={22} color={Colors.info} />
                  </View>
                  <View style={styles.documentPackContent}>
                    <Text style={styles.documentPackTitle}>Pack documents véhicule</Text>
                    <Text style={styles.documentPackSubtitle}>
                      Continuez sur le site Zwanga pour les documents nécessaires au véhicule.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.documentPackButton}
                  onPress={handleOpenDocumentsPack}
                  disabled={openingDocumentsPack}
                  activeOpacity={0.85}
                >
                  {openingDocumentsPack ? (
                    <ActivityIndicator color={Colors.info} />
                  ) : (
                    <>
                      <Text style={styles.documentPackButtonText}>Continuer sur le site</Text>
                      <Ionicons name="open-outline" size={16} color={Colors.info} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeaderTitle}>Activité</Text>
          <View style={styles.statsGrid}>
            {derivedStats.map((stat, index) => (
              <View key={stat.label} style={styles.statGridItem}>
                <Text style={[styles.statGridValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={styles.statGridLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {badges.length > 0 && (
          <View style={styles.badgesContainer}>
            <View style={styles.badgesCard}>
              <Text style={styles.badgesTitle}>Badges</Text>
              <View style={styles.badgesList}>
                {badges.map((badge, index) => (
                  <Animated.View
                    key={`${badge.label}-${index}`}
                    entering={FadeInDown.delay(index * 100)}
                    style={styles.badgeItem}
                  >
                    <View style={[styles.badgeIcon, { backgroundColor: badge.color + '20' }]}>
                      <Ionicons name={badge.icon as any} size={32} color={badge.color} />
                    </View>
                    <Text style={styles.badgeLabel}>{badge.label}</Text>
                  </Animated.View>
                ))}
              </View>
            </View>
          </View>
        )}

        <View style={styles.reviewsContainer}>
          <View style={styles.reviewsCard}>
            <View style={styles.reviewsHeader}>
              <View>
                <Text style={styles.reviewsTitle}>Vos avis reçus</Text>
                <Text style={styles.reviewsSubtitle}>
                  {reviewCount} avis · note moyenne {reviewAverage.toFixed(1)}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.reviewsLinkButton, reviewCount === 0 && styles.reviewsLinkButtonDisabled]}
                onPress={() => setReviewsModalVisible(true)}
                disabled={reviewCount === 0}
              >
                <Text
                  style={[
                    styles.reviewsLinkText,
                    reviewCount === 0 && styles.reviewsLinkTextDisabled,
                  ]}
                >
                  Voir tout
                </Text>
              </TouchableOpacity>
            </View>
            {reviewCount === 0 ? (
              <Text style={styles.reviewsEmptyText}>
                {"Vous n'avez pas encore reçu d'avis. Continuez à proposer des trajets sécurisés pour en recevoir."}
              </Text>
            ) : (
              featuredReviews.map((review) => (
                <View key={review.id} style={styles.reviewItem}>
                  <View style={styles.reviewItemHeader}>
                    <View>
                      <Text style={styles.reviewAuthor}>{review.fromUserName ?? 'Utilisateur'}</Text>
                      <Text style={styles.reviewDate}>
                        {new Date(review.createdAt).toLocaleDateString('fr-FR')}
                      </Text>
                    </View>
                    <View style={styles.reviewRating}>
                      <Ionicons name="star" size={16} color={Colors.secondary} />
                      <Text style={styles.reviewRatingText}>{review.rating.toFixed(1)}</Text>
                    </View>
                  </View>
                  {review.comment ? (
                    <Text style={styles.reviewComment}>{review.comment}</Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.kycContainer}>
          <View style={styles.kycCard}>
            <View style={styles.kycHeader}>
              <View style={styles.kycHeaderLeft}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
                <Text style={styles.kycTitle}>Statut KYC</Text>
              </View>
              {kycLoading && <ActivityIndicator size="small" color={Colors.primary} />}
            </View>
            <Text
              style={[
                styles.kycStatusText,
                isKycApproved && styles.kycStatusApproved,
                isKycPending && styles.kycStatusPending,
              ]}
            >
              {isKycApproved
                ? 'Vérifié'
                : isKycPending
                  ? 'En cours de vérification'
                  : isKycRejected
                    ? 'Rejeté'
                    : 'Non vérifié'}
            </Text>
            {isKycRejected && kycStatus?.rejectionReason ? (
              <View style={styles.kycRejectionContainer}>
                <Text style={styles.kycRejectionTitle}>Motif du rejet :</Text>
                <Text style={styles.kycRejectionText}>
                  {kycStatus.rejectionReason}
                </Text>
              </View>
            ) : null}
            <Text style={styles.kycHelperText}>
              {isKycApproved
                ? 'Vos documents sont validés. Contactez le support pour toute mise à jour.'
                : isKycPending
                  ? 'Nous vérifions vos documents. Vous pouvez les actualiser en cas de changement.'
                  : 'Ajoutez vos documents officiels pour confirmer votre identité.'}
            </Text>
            <TouchableOpacity
              style={[
                styles.kycButton,
                isKycActionDisabled && styles.kycButtonDisabled,
                isKycApproved && styles.kycButtonLocked,
              ]}
              onPress={handleOpenKycModal}
              disabled={isKycActionDisabled}
            >
              {isKycBusy ? (
                <ActivityIndicator color={Colors.primary} size="small" />
              ) : (
                <>
                  <Text
                    style={[
                      styles.kycButtonText,
                      isKycApproved && styles.kycButtonTextMuted,
                    ]}
                  >
                    {isKycApproved ? 'Documents vérifiés' : 'Soumettre mes documents'}
                  </Text>
                  {!isKycApproved && <Ionicons name="chevron-forward" size={18} color={Colors.primary} />}
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.vehiclesContainer}>
          <View style={styles.vehiclesHeader}>
            <Text style={styles.sectionHeaderTitle}>Mes véhicules</Text>
            <TouchableOpacity
              style={styles.vehicleAddButton}
              onPress={() => {
                resetVehicleForm();
                setVehicleModalVisible(true);
              }}
            >
              <Ionicons name="add" size={18} color={Colors.white} />
            </TouchableOpacity>
          </View>
          {vehiclesLoading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : vehicleList.length > 0 ? (
            vehicleList.map((vehicle) => (
              <View key={vehicle.id} style={styles.vehicleItem}>
                <View style={styles.vehicleItemLeft}>
                  <View>
                    <Text style={styles.vehicleTitle}>
                      {vehicle.brand} {vehicle.model}
                    </Text>
                    <Text style={styles.vehiclePlate}>{vehicle.licensePlate}</Text>
                    <Text style={styles.vehicleColor}>{vehicle.color}</Text>
                  </View>
                  <View
                    style={[
                      styles.vehicleStatus,
                      { backgroundColor: vehicle.isActive ? Colors.success + '20' : Colors.gray[200] },
                    ]}
                  >
                    <Text
                      style={[
                        styles.vehicleStatusText,
                        { color: vehicle.isActive ? Colors.success : Colors.gray[600] },
                      ]}
                    >
                      {vehicle.isActive ? 'Actif' : 'Inactif'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.vehicleDeleteButton}
                  onPress={() => handleDeleteVehicle(vehicle)}
                  disabled={deletingVehicle}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {deletingVehicle ? (
                    <ActivityIndicator size="small" color={Colors.danger} />
                  ) : (
                    <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                  )}
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={styles.vehicleEmptyText}>
              Aucun véhicule enregistré. Ajoutez-en un pour devenir conducteur.
            </Text>
          )}
        </View>

        <View style={styles.menuContainer}>
          <View style={styles.menuCard}>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.menuItem,
                  index !== menuItems.length - 1 && styles.menuItemBorder,
                ]}
                onPress={() => {
                  if ((item as any).onPress) {
                    (item as any).onPress();
                  } else if (item.route) {
                    router.push(item.route as any);
                  }
                }}
              >
                <View style={styles.menuIcon}>
                  <Ionicons name={item.icon as any} size={20} color={Colors.gray[600]} />
                </View>
                <Text style={styles.menuText}>{item.label}</Text>
                <View style={styles.menuRight}>
                  {(item as any).badge !== undefined && (item as any).badge > 0 && (
                    <View
                      style={[
                        styles.menuBadge,
                        { backgroundColor: (item as any).badgeColor || Colors.primary },
                      ]}
                    >
                      <Text style={styles.menuBadgeText}>{(item as any).badge}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.logoutContainer}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <View style={styles.logoutButtonContent}>
              <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
              <Text style={styles.logoutText}>Déconnexion</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <VehicleFormModal
        visible={vehicleModalVisible}
        {...vehicleModalCopy}
        submitLabel="Ajouter"
        brand={vehicleBrand}
        model={vehicleModel}
        color={vehicleColor}
        licensePlate={vehiclePlate}
        onBrandChange={handleVehicleBrandChange}
        onModelChange={handleVehicleModelChange}
        onColorChange={handleVehicleColorChange}
        onLicensePlateChange={handleVehiclePlateChange}
        onClose={closeVehicleModal}
        onSubmit={handleAddVehicle}
        submitting={creatingVehicle}
      />

      <KycWizardModal
        visible={kycModalVisible}
        onClose={handleCloseKycModal}
        isSubmitting={isKycBusy}
        initialValues={{
          front: kycFrontImage,
          selfie: kycSelfieImage,
        }}
        onComplete={handleKycWizardComplete}
      />

      <Modal
        visible={reviewsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewsModalVisible(false)}
      >
        <View style={styles.reviewsModalOverlay}>
          <Animated.View entering={FadeInDown} style={[styles.reviewsModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
            <View style={styles.reviewsModalHeader}>
              <Text style={styles.reviewsModalTitle}>Tous les avis</Text>
              <TouchableOpacity onPress={() => setReviewsModalVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.gray[600]} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.reviewsModalContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Spacing.xl }}
            >
              {(reviews ?? []).length === 0 ? (
                <Text style={styles.reviewsEmptyText}>
                  {"Vous n'avez pas encore reçu d'avis."}
                </Text>
              ) : (
                reviews?.map((review) => (
                  <View key={review.id} style={styles.reviewItem}>
                    <View style={styles.reviewItemHeader}>
                      <View>
                        <Text style={styles.reviewAuthor}>{review.fromUserName ?? 'Utilisateur'}</Text>
                        <Text style={styles.reviewDate}>
                          {new Date(review.createdAt).toLocaleDateString('fr-FR')}
                        </Text>
                      </View>
                      <View style={styles.reviewRating}>
                        <Ionicons name="star" size={16} color={Colors.secondary} />
                        <Text style={styles.reviewRatingText}>{review.rating.toFixed(1)}</Text>
                      </View>
                    </View>
                    {review.comment ? (
                      <Text style={styles.reviewComment}>{review.comment}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={pinModalVisible} transparent animationType="fade" onRequestClose={() => setPinModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.pinModalOverlay}
        >
          <Animated.View entering={FadeInDown} style={styles.pinModalCard}>
            <View style={styles.pinModalHeader}>
              <Text style={styles.pinModalTitle}>Modifier le code PIN</Text>
              <TouchableOpacity onPress={() => setPinModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.gray[500]} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: Spacing.lg }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
            {pinStep === 'oldPin' ? (
              <>
                <Text style={styles.pinModalSubtitle}>
                  Entrez votre mot de passe PIN actuel pour confirmer votre identité
                </Text>
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Mot de passe PIN actuel</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                    <TextInput
                      ref={oldPinInputRef}
                      style={styles.input}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      value={oldPin}
                      onChangeText={handleOldPinChange}
                      placeholder="Entrez votre PIN actuel (4 chiffres)"
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.pinModalButton, oldPin.length === 4 ? styles.pinModalButtonActive : styles.pinModalButtonDisabled]}
                  onPress={handleVerifyOldPin}
                  disabled={oldPin.length !== 4}
                >
                  <Text style={styles.pinModalButtonText}>Continuer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pinModalForgotButton}
                  onPress={handleForgotPin}
                >
                  <Text style={styles.pinModalForgotText}>{"J'ai oublié mon PIN"}</Text>
                </TouchableOpacity>
              </>
            ) : pinStep === 'otp' ? (
              <>
                <Text style={styles.pinModalSubtitle}>
                  Un code de vérification a été envoyé au <Text style={{ fontWeight: 'bold' }}>{currentUser?.phone}</Text>
                </Text>
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Code de vérification (OTP)</Text>
                  <Text style={styles.inputLabelSmall}>5 chiffres reçus par SMS</Text>
                  <View style={styles.smsCodeContainer}>
                    {otpCode.map((digit, index) => (
                      <TextInput
                        key={`otp-${index}`}
                        ref={(ref) => { otpInputRefs.current[index] = ref; }}
                        style={[styles.smsInput, digit ? styles.smsInputFilled : null]}
                        keyboardType="number-pad"
                        maxLength={1}
                        value={digit}
                        onChangeText={(text) => handleOtpInputChange(text, index)}
                        onKeyPress={(e) => handleOtpKeyPress(e, index)}
                      />
                    ))}
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.pinModalButton, otpCode.join('').length === 5 ? styles.pinModalButtonActive : styles.pinModalButtonDisabled]}
                  onPress={handleVerifyOtpForPinChange}
                  disabled={otpCode.join('').length !== 5}
                >
                  <Text style={styles.pinModalButtonText}>Vérifier</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pinModalResendButton}
                  onPress={handleForgotPin}
                  disabled={isSendingOtp}
                >
                  {isSendingOtp ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.pinModalResendText}>Renvoyer le code</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.pinModalSubtitle}>Créez un nouveau mot de passe PIN à 4 chiffres</Text>
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Nouveau mot de passe PIN</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                    <TextInput
                      ref={pinInputRef}
                      style={styles.input}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      value={newPin}
                      onChangeText={handleNewPinChange}
                      placeholder="Créez un nouveau PIN (4 chiffres)"
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </View>
                </View>
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Confirmer le nouveau mot de passe PIN</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                    <TextInput
                      ref={pinConfirmInputRef}
                      style={styles.input}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      value={newPinConfirm}
                      onChangeText={handleNewPinConfirmChange}
                      placeholder="Confirmez votre nouveau PIN (4 chiffres)"
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.pinModalButton, newPin.length === 4 && newPinConfirm.length === 4 ? styles.pinModalButtonActive : styles.pinModalButtonDisabled]}
                  onPress={handleUpdatePin}
                  disabled={newPin.length !== 4 || newPinConfirm.length !== 4 || isUpdatingPin || isUpdatingPinWithOtp}
                >
                  {isUpdatingPin ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.pinModalButtonText}>Modifier le PIN</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={subscriptionModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeSubscriptionModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.subscriptionModalOverlay}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <TouchableOpacity
            style={styles.subscriptionModalBackdrop}
            activeOpacity={1}
            onPress={closeSubscriptionModal}
          />
          <Animated.View
            entering={FadeInDown}
            style={[
              styles.subscriptionModalCard,
              { paddingBottom: Math.max(insets.bottom, Spacing.lg) },
              subscriptionModalCardKeyboardStyle,
            ]}
          >
            <View style={styles.subscriptionModalHandle} />
            <LinearGradient
              colors={['#FFF7ED', '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.subscriptionModalHero}
            >
              <View style={styles.subscriptionHeaderTopRow}>
                <View style={styles.subscriptionHeaderBadge}>
                  <Ionicons name="sparkles-outline" size={14} color={Colors.primaryDark} />
                  <Text style={styles.subscriptionHeaderBadgeText}>Conducteur Pro</Text>
                </View>
                <TouchableOpacity
                  onPress={closeSubscriptionModal}
                  disabled={proBusy}
                  style={styles.subscriptionModalCloseButton}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={18} color={Colors.gray[700]} />
                </TouchableOpacity>
              </View>

              <View style={styles.subscriptionModalHeader}>
                <View style={styles.subscriptionModalHeaderTextBlock}>
                  <Text style={styles.subscriptionModalTitle}>Abonnement conducteur</Text>
                  <Text style={styles.subscriptionModalSubtitle}>
                    Pour publier au-delà des 5 trajets inclus chaque jour.
                  </Text>
                </View>

                <View style={styles.subscriptionModalPricePill}>
                  <Text style={styles.subscriptionModalPrice}>{proPriceLabel}</Text>
                  <Text style={styles.subscriptionModalPriceCaption}>par mois</Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.subscriptionStepIndicator}>
              <View
                style={[
                  styles.subscriptionStepPill,
                  subscriptionModalStep === 'method' && styles.subscriptionStepPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.subscriptionStepText,
                    subscriptionModalStep === 'method' && styles.subscriptionStepTextActive,
                  ]}
                >
                  1. Methode
                </Text>
              </View>
              <View
                style={[
                  styles.subscriptionStepPill,
                  subscriptionModalStep === 'payment' && styles.subscriptionStepPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.subscriptionStepText,
                    subscriptionModalStep === 'payment' && styles.subscriptionStepTextActive,
                  ]}
                >
                  2. Paiement
                </Text>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              style={styles.subscriptionModalScroll}
              contentContainerStyle={styles.subscriptionModalContent}
            >
              {subscriptionModalStep === 'method' ? (
                <>
              <Text style={styles.subscriptionSectionLabel}>Moyen de paiement</Text>
              <View style={styles.subscriptionPaymentGrid}>
                {SUBSCRIPTION_PAYMENT_OPTIONS.map((option) => {
                  const isSelected = selectedSubscriptionPaymentChannel === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.subscriptionPaymentOption,
                        isSelected && styles.subscriptionPaymentOptionActive,
                        subscriptionPaymentOrderNumber && styles.subscriptionButtonDisabled,
                      ]}
                      disabled={proBusy}
                      onPress={() => {
                        if (subscriptionPaymentOrderNumber) {
                          setSubscriptionModalStep('payment');
                          return;
                        }
                        setSelectedSubscriptionPaymentChannel(option.id);
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={option.icon}
                        size={20}
                        color={isSelected ? Colors.primary : Colors.gray[600]}
                      />
                      <View style={styles.subscriptionPaymentOptionText}>
                        <Text style={styles.subscriptionPaymentOptionLabel}>{option.label}</Text>
                        <Text style={styles.subscriptionPaymentOptionHint}>{option.hint}</Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {false && (
                <View style={[styles.subscriptionPendingPanel, { marginTop: Spacing.md }]}>
                  <Ionicons name="time-outline" size={18} color={Colors.warningDark} />
                  <View style={styles.subscriptionPendingTextContent}>
                    <Text style={styles.subscriptionPendingTitle}>Statut du paiement</Text>
                    {subscriptionPaymentMessage ? (
                      <Text style={styles.subscriptionPendingText}>{subscriptionPaymentMessage}</Text>
                    ) : null}
                    {subscriptionPaymentOrderNumber ? (
                      <Text style={styles.subscriptionPendingReference}>
                        Référence {subscriptionPaymentOrderNumber}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}

              <View style={[styles.subscriptionSummaryCard, { marginTop: Spacing.lg }]}>
                <Text style={styles.subscriptionSummaryPrice}>{proPriceLabel}</Text>
                <Text style={styles.subscriptionSummaryText}>
                  {"Le quota gratuit reste à 5 trajets par jour. L'abonnement débloque les publications supplémentaires dès validation du paiement."}
                </Text>
              </View>
                </>
              ) : (
                <>
                  <Text style={styles.subscriptionSectionLabel}>Paiement</Text>
                  <View style={styles.subscriptionSelectedMethodCard}>
                    <Ionicons
                      name={selectedSubscriptionPaymentOption.icon}
                      size={20}
                      color={Colors.primary}
                    />
                    <View style={styles.subscriptionPaymentOptionText}>
                      <Text style={styles.subscriptionPaymentOptionLabel}>
                        {selectedSubscriptionPaymentOption.label}
                      </Text>
                      <Text style={styles.subscriptionPaymentOptionHint}>
                        {selectedSubscriptionPaymentOption.hint}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={handleBackToSubscriptionMethod}
                      disabled={proBusy}
                      style={styles.subscriptionChangeMethodButton}
                    >
                      <Text style={styles.subscriptionChangeMethodText}>Modifier</Text>
                    </TouchableOpacity>
                  </View>

                  {!isSubscriptionCardPayment ? (
                    <Animated.View
                      key={selectedSubscriptionPaymentChannel}
                      entering={FadeInDown.duration(300)}
                      style={styles.subscriptionPhoneSection}
                    >
                      <Text style={styles.subscriptionSectionLabel}>Numero Mobile Money</Text>
                      <View style={styles.subscriptionPhoneInputWrapper}>
                        <Ionicons name="call-outline" size={18} color={Colors.gray[500]} />
                        <TextInput
                          style={styles.subscriptionPhoneInput}
                          keyboardType="phone-pad"
                          editable={!proBusy}
                          maxLength={13}
                          value={subscriptionPhone}
                          onChangeText={(text) => setSubscriptionPhone(normalizePaymentPhone(text))}
                          placeholder="+243891234567"
                          placeholderTextColor={Colors.gray[400]}
                        />
                      </View>
                      <Text style={styles.subscriptionInputHint}>
                        Format +243 suivi de 9 chiffres. FlexPay enverra une confirmation.
                      </Text>
                    </Animated.View>
                  ) : (
                    <View style={styles.subscriptionSummaryCard}>
                      <Text style={styles.subscriptionSummaryPrice}>{proPriceLabel}</Text>
                      <Text style={styles.subscriptionSummaryText}>
                        {"Le paiement carte s'ouvrira dans une page securisee."}
                      </Text>
                    </View>
                  )}

                  {(subscriptionPaymentStage !== 'idle' || subscriptionPaymentOrderNumber) && (
                    <View style={styles.subscriptionProgressPanel}>
                      {subscriptionPaymentProgressSteps.map((step, index) => {
                        const isLast = index === subscriptionPaymentProgressSteps.length - 1;
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
                          step.status === 'done'
                            ? 'checkmark'
                            : step.status === 'error'
                              ? 'close'
                              : step.icon;

                        return (
                          <View key={step.key} style={styles.subscriptionProgressRow}>
                            <View style={styles.subscriptionProgressRail}>
                              <View
                                style={[
                                  styles.subscriptionProgressDot,
                                  {
                                    backgroundColor:
                                      step.status === 'waiting' ? Colors.white : progressColor,
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
                              {!isLast ? (
                                <View
                                  style={[
                                    styles.subscriptionProgressLine,
                                    {
                                      backgroundColor:
                                        step.status === 'done' ? Colors.success + '80' : Colors.gray[200],
                                    },
                                  ]}
                                />
                              ) : null}
                            </View>
                            <View style={styles.subscriptionProgressTextBlock}>
                              <Text
                                style={[
                                  styles.subscriptionProgressTitle,
                                  step.status !== 'waiting' && { color: Colors.gray[900] },
                                ]}
                              >
                                {step.title}
                              </Text>
                              <Text style={styles.subscriptionProgressDescription}>
                                {step.description}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {false && (
                    <View style={styles.subscriptionPendingPanel}>
                      <Ionicons name="time-outline" size={18} color={Colors.warningDark} />
                      <View style={styles.subscriptionPendingTextContent}>
                        <Text style={styles.subscriptionPendingTitle}>Statut du paiement</Text>
                        {subscriptionPaymentMessage ? (
                          <Text style={styles.subscriptionPendingText}>{subscriptionPaymentMessage}</Text>
                        ) : null}
                        {subscriptionPaymentOrderNumber ? (
                          <Text style={styles.subscriptionPendingReference}>
                            Reference {subscriptionPaymentOrderNumber}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {/* Zone fixe en bas : actions toujours visibles au-dessus du clavier */}
            <View style={styles.subscriptionFixedFooter}>
              {shouldShowPaymentStatusPanel && subscriptionPaymentStatus ? (
                <View style={styles.subscriptionFooterStatusPanel}>
                  <View style={styles.subscriptionFooterStatusIcon}>
                    {subscriptionPaymentStatus.showActivity ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Ionicons
                        name={subscriptionPaymentStatus.icon}
                        size={18}
                        color={Colors.primary}
                      />
                    )}
                  </View>
                  <View style={styles.subscriptionFooterStatusContent}>
                    <Text style={styles.subscriptionFooterStatusTitle}>
                      {subscriptionPaymentStatus.title}
                    </Text>
                    <Text style={styles.subscriptionFooterStatusText}>
                      {subscriptionPaymentStatus.message}
                    </Text>
                    {subscriptionPaymentOrderNumber ? (
                      <Text style={styles.subscriptionFooterStatusReference}>
                        Reference {subscriptionPaymentOrderNumber}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
              <View style={styles.paymentButtonContainer}>
                {subscriptionModalStep === 'payment' && (
                  <TouchableOpacity
                    style={[styles.subscriptionSecondaryButton, proBusy && styles.subscriptionButtonDisabled]}
                    onPress={handleBackToSubscriptionMethod}
                    disabled={proBusy}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.subscriptionSecondaryButtonText}>Retour</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.subscriptionPrimaryButton, proBusy && styles.subscriptionButtonDisabled]}
                  onPress={
                    subscriptionModalStep === 'method'
                      ? subscriptionPaymentOrderNumber
                        ? handleSubmitSubscriptionPayment
                        : handleContinueSubscriptionPayment
                      : handleSubmitSubscriptionPayment
                  }
                  disabled={proBusy}
                  activeOpacity={0.85}
                >
                  {subscriptionModalStep === 'payment' && (
                    isSubscribingPro ||
                    isCheckingSubscriptionPayment ||
                    isRestoringSubscriptionPayment
                  ) ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.subscriptionPrimaryButtonText}>
                      {subscriptionPaymentOrderNumber
                        ? isSubscriptionPaymentAutoChecking
                          ? 'Actualiser maintenant'
                          : 'Actualiser le statut'
                        : subscriptionModalStep === 'method'
                          ? 'Suivant'
                          : isSubscriptionCardPayment
                            ? 'Payer par carte'
                            : "Payer l'abonnement"}
                    </Text>
                  )}
                </TouchableOpacity>

                {false && subscriptionModalStep === 'payment' && subscriptionPaymentOrderNumber && !isSubscriptionPaymentAutoChecking && (
                  <TouchableOpacity
                    style={[styles.subscriptionSecondaryButton, proBusy && styles.subscriptionButtonDisabled]}
                    onPress={handleCheckSubscriptionPayment}
                    disabled={proBusy}
                    activeOpacity={0.85}
                  >
                    {isCheckingSubscriptionPayment ? (
                      <ActivityIndicator color={Colors.primary} />
                    ) : (
                      <Text style={styles.subscriptionSecondaryButtonText}>Actualiser le statut</Text>
                    )}
                  </TouchableOpacity>
                )}

              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      <TutorialOverlay
        visible={profileGuideVisible}
        title="Votre espace Zwanga"
        message="Consultez vos statistiques, vos avis et vos documents KYC depuis cet écran. Glissez vers le bas pour tout rafraîchir."
        onDismiss={handleDismissProfileGuide}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    borderBottomLeftRadius: BorderRadius.xxl,
    borderBottomRightRadius: BorderRadius.xxl,
    overflow: 'hidden',
    position: 'relative',
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    zIndex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  settingsButton: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  userInfo: {
    alignItems: 'center',
    zIndex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: Spacing.md,
  },
  avatarWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
    backgroundColor: Colors.white,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.gray[200],
  },
  avatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  avatarEmoji: {
    fontSize: 40,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    backgroundColor: Colors.success,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  userName: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    marginBottom: 4,
  },
  userPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    opacity: 0.8,
    marginBottom: Spacing.xl,
  },
  userPhone: {
    color: Colors.white,
    fontSize: FontSizes.sm,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
    gap: Spacing.xl,
  },
  headerStatItem: {
    alignItems: 'center',
    gap: 2,
  },
  headerStatValue: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  headerStatLabel: {
    color: Colors.white,
    opacity: 0.7,
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: FontWeights.medium,
  },
  headerStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  mainActionsContainer: {
    paddingHorizontal: Spacing.xl,
    marginTop: -Spacing.xl,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  mainActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    ...CommonStyles.shadowSm,
  },
  mainActionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  mainActionContent: {
    flex: 1,
  },
  mainActionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  mainActionSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
  section: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  sectionHeaderTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  statGridItem: {
    width: '50%',
    padding: Spacing.md,
    alignItems: 'center',
  },
  statGridValue: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    marginBottom: 4,
  },
  statGridLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textAlign: 'center',
  },
  badgesContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  badgesCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  badgesTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.lg,
    fontSize: FontSizes.base,
  },
  badgesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
    justifyContent: 'center',
  },
  badgeItem: {
    alignItems: 'center',
    width: 80,
  },
  badgeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  badgeLabel: {
    fontSize: 10,
    color: Colors.gray[600],
    textAlign: 'center',
    fontWeight: FontWeights.medium,
  },
  reviewsContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  reviewsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  reviewsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  reviewsTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  reviewsSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
  reviewsLinkButton: {
    backgroundColor: Colors.primary + '10',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  reviewsLinkButtonDisabled: {
    opacity: 0.5,
  },
  reviewsLinkText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: FontWeights.bold,
  },
  reviewsLinkTextDisabled: {
    color: Colors.gray[400],
  },
  reviewsEmptyText: {
    textAlign: 'center',
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    paddingVertical: Spacing.lg,
  },
  reviewItem: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  reviewItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reviewAuthor: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  reviewDate: {
    fontSize: 10,
    color: Colors.gray[500],
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reviewRatingText: {
    fontSize: 12,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  reviewComment: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    lineHeight: 18,
  },
  reviewsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reviewsModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    height: '80%',
    padding: Spacing.xl,
  },
  reviewsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  reviewsModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  reviewsModalContent: {
    flex: 1,
  },
  kycContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  kycCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  kycHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  kycHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  kycTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  kycStatusText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    marginBottom: 4,
  },
  kycStatusApproved: {
    color: Colors.success,
  },
  kycStatusPending: {
    color: Colors.warning,
  },
  kycRejectionContainer: {
    backgroundColor: Colors.danger + '10',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginVertical: Spacing.sm,
  },
  kycRejectionTitle: {
    color: Colors.danger,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
    marginBottom: 2,
  },
  kycRejectionText: {
    color: Colors.danger,
    fontSize: FontSizes.xs,
  },
  kycHelperText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginBottom: Spacing.lg,
  },
  kycButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '10',
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    gap: 8,
  },
  kycButtonDisabled: {
    opacity: 0.6,
  },
  kycButtonLocked: {
    backgroundColor: Colors.gray[100],
  },
  kycButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  kycButtonTextMuted: {
    color: Colors.gray[500],
  },
  vehiclesContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  vehiclesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  vehicleAddButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.sm,
    ...CommonStyles.shadowSm,
  },
  vehicleItemLeft: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleDeleteButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.danger + '10',
  },
  vehicleTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  vehiclePlate: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginTop: 2,
  },
  vehicleColor: {
    fontSize: 10,
    color: Colors.gray[400],
    textTransform: 'uppercase',
    marginTop: 2,
  },
  vehicleStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  vehicleStatusText: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  vehicleEmptyText: {
    textAlign: 'center',
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    paddingVertical: Spacing.xl,
  },
  menuContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  menuCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...CommonStyles.shadowSm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[50],
  },
  menuIcon: {
    width: 36,
    height: 36,
    backgroundColor: Colors.gray[50],
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  menuText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  logoutContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  logoutButton: {
    backgroundColor: Colors.danger + '10',
    paddingVertical: 16,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
  },
  logoutButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutText: {
    color: Colors.danger,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  vehicleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  vehicleModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    maxHeight: '92%',
    minHeight: 0,
    width: '100%',
  },
  vehicleModalHeader: {
    alignItems: 'flex-end',
    marginBottom: Spacing.md,
  },
  vehicleModalHero: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  vehicleModalBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  vehicleModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  vehicleModalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    textAlign: 'center',
  },
  vehicleModalContent: {
    gap: Spacing.md,
  },
  vehicleInputGroup: {
    gap: 4,
  },
  vehicleInputLabel: {
    fontSize: 12,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
  },
  vehicleInput: {
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: FontSizes.base,
  },
  vehicleSaveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  vehicleSaveButtonDisabled: {
    opacity: 0.6,
  },
  vehicleSaveButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  pinModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  pinModalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 400,
    ...CommonStyles.shadowLg,
  },
  pinModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  pinModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  pinModalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  formSection: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  inputLabelSmall: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
    color: Colors.gray[500],
    marginBottom: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.gray[50],
    height: 56,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    height: '100%',
  },
  pinModalButton: {
    backgroundColor: Colors.gray[300],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  pinModalButtonActive: {
    backgroundColor: Colors.primary,
  },
  pinModalButtonDisabled: {
    backgroundColor: Colors.gray[300],
    opacity: 0.5,
  },
  pinModalButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  pinModalForgotButton: {
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  pinModalForgotText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    textDecorationLine: 'underline',
  },
  smsCodeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  smsInput: {
    flex: 1,
    height: 60,
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    backgroundColor: Colors.gray[50],
  },
  smsInputFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  pinModalResendButton: {
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  pinModalResendText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  proCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '24',
    padding: Spacing.md,
    gap: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  proCardActive: {
    borderColor: Colors.success + '40',
    backgroundColor: '#FFFFFF',
  },
  proHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  proIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proIconActive: {
    backgroundColor: Colors.success,
  },
  proTitleContent: {
    flex: 1,
  },
  proTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  proTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  proBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.success + '15',
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: Colors.successDark,
  },
  proSubtitle: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    lineHeight: 17,
  },
  proBenefitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  proBenefitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  proBenefitText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  proFundingText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    lineHeight: 17,
  },
  proPrimaryButton: {
    minHeight: 46,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  proPrimaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  proSecondaryButton: {
    minHeight: 46,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '35',
    backgroundColor: Colors.primary + '08',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  proSecondaryButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  proSecondaryPrice: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: 10,
    fontWeight: FontWeights.semibold,
  },
  proActivePanel: {
    minHeight: 46,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.success + '10',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  proActiveText: {
    flex: 1,
    color: Colors.successDark,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  documentPackCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.info + '25',
    padding: Spacing.md,
    gap: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  documentPackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  documentPackIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.info + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentPackContent: {
    flex: 1,
  },
  documentPackTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  documentPackSubtitle: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    lineHeight: 17,
  },
  documentPackButton: {
    minHeight: 44,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.info + '35',
    backgroundColor: Colors.info + '08',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  documentPackButtonText: {
    color: Colors.info,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  subscriptionModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  subscriptionModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  subscriptionModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    maxHeight: '82%',
    paddingTop: Spacing.sm,
    overflow: 'hidden',
    ...CommonStyles.shadowLg,
  },
  subscriptionModalHandle: {
    width: 48,
    height: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[300],
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  subscriptionModalHero: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 6,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  subscriptionHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  subscriptionHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '18',
    backgroundColor: Colors.primary + '10',
  },
  subscriptionHeaderBadgeText: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  subscriptionModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white + 'D9',
  },
  subscriptionModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: Spacing.md,
  },
  subscriptionModalHeaderTextBlock: {
    flex: 1,
    gap: Spacing.xs,
  },
  subscriptionModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  subscriptionModalSubtitle: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  subscriptionModalPricePill: {
    minWidth: 112,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: Colors.primary + '16',
    backgroundColor: Colors.white + 'F2',
    ...CommonStyles.shadowSm,
  },
  subscriptionModalPrice: {
    color: Colors.gray[900],
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  subscriptionModalPriceCaption: {
    marginTop: 2,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  subscriptionStepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.white,
  },
  subscriptionStepPill: {
    flex: 1,
    minHeight: 34,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[100],
    backgroundColor: Colors.gray[50],
  },
  subscriptionStepPillActive: {
    borderColor: Colors.primary + '35',
    backgroundColor: Colors.primary + '08',
  },
  subscriptionStepText: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  subscriptionStepTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  subscriptionModalScroll: {
    flexShrink: 1,
    maxHeight: 320,
  },
  subscriptionModalContent: {
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  subscriptionSummaryCard: {
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary + '07',
    borderWidth: 1,
    borderColor: Colors.primary + '16',
    padding: Spacing.lg,
  },
  subscriptionSummaryPrice: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  subscriptionSummaryText: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    lineHeight: 20,
  },
  subscriptionSectionLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  subscriptionPaymentGrid: {
    gap: Spacing.sm,
  },
  subscriptionPaymentOption: {
    minHeight: 58,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  subscriptionPaymentOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  subscriptionPaymentOptionText: {
    flex: 1,
  },
  subscriptionSelectedMethodCard: {
    minHeight: 58,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '25',
    backgroundColor: Colors.primary + '08',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  subscriptionChangeMethodButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  subscriptionChangeMethodText: {
    color: Colors.primary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  subscriptionPaymentOptionLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  subscriptionPaymentOptionHint: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  subscriptionPhoneSection: {
    gap: Spacing.sm,
  },
  subscriptionPhoneInputWrapper: {
    minHeight: 52,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  subscriptionPhoneInput: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
  },
  subscriptionInputHint: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    lineHeight: 17,
  },
  subscriptionProgressPanel: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: 0,
  },
  subscriptionProgressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 54,
  },
  subscriptionProgressRail: {
    width: 30,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  subscriptionProgressDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionProgressLine: {
    width: 2,
    flex: 1,
    minHeight: 24,
    marginVertical: 3,
    borderRadius: 1,
  },
  subscriptionProgressTextBlock: {
    flex: 1,
    paddingLeft: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  subscriptionProgressTitle: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  subscriptionProgressDescription: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  subscriptionPendingPanel: {
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.warning + '12',
    borderWidth: 1,
    borderColor: Colors.warning + '30',
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  subscriptionPendingTextContent: {
    flex: 1,
  },
  subscriptionPendingTitle: {
    color: Colors.warningDark,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
  },
  subscriptionPendingText: {
    marginTop: 2,
    color: Colors.gray[700],
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  subscriptionPendingReference: {
    marginTop: 4,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  subscriptionPrimaryButton: {
    minHeight: 48,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  subscriptionPrimaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  subscriptionSecondaryButton: {
    minHeight: 46,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '35',
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  subscriptionSecondaryButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  subscriptionButtonDisabled: {
    opacity: 0.6,
  },
  paymentActionContainer: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  subscriptionFixedFooter: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
    backgroundColor: Colors.white,
    gap: Spacing.sm,
  },
  subscriptionFooterStatusPanel: {
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '08',
    borderWidth: 1,
    borderColor: Colors.primary + '22',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  subscriptionFooterStatusIcon: {
    width: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionFooterStatusContent: {
    flex: 1,
    gap: 2,
  },
  subscriptionFooterStatusTitle: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  subscriptionFooterStatusText: {
    color: Colors.gray[700],
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  subscriptionFooterStatusReference: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  paymentButtonContainer: {
    gap: Spacing.sm,
  },
  becomeDriverCard: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...CommonStyles.shadowMd,
  },
  becomeDriverGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    paddingVertical: Spacing.lg,
    position: 'relative',
  },
  becomeDriverContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  becomeDriverIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  becomeDriverTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  becomeDriverTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    marginBottom: 4,
  },
  becomeDriverSubtitle: {
    fontSize: FontSizes.xs,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: Spacing.sm,
  },
  becomeDriverProgress: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: 4,
  },
  becomeDriverProgressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  becomeDriverProgressText: {
    fontSize: FontSizes.xs,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: FontWeights.medium,
  },
  becomeDriverProgressTextCompleted: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  becomeDriverArrow: {
    marginLeft: Spacing.sm,
  },
});
