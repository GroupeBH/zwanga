import {
  formatSubscriptionAmount,
  formatPointsAmount,
  getPlanLabel,
  getStoredPaymentKey,
  getMostRecentPendingSubscriptionPayment,
} from '../../features/subscription-payment/paymentModel';
import { PaymentChannel, PaymentStage } from '../../features/subscription-payment/paymentTypes';
import { useDialog } from '@/components/ui/DialogProvider';
import { useGetPendingSubscriptionPaymentsQuery } from '@/store/api/paymentApi';
import {
  useGetPremiumOverviewQuery,
  useGetSubscriptionPlansQuery,
  useLazyCheckSubscriptionPaymentStatusQuery,
  useSubscribeToProMutation,
  useSubscribeToProWithPointsMutation,
} from '@/store/api/subscriptionApi';
import { useGetProfileSummaryQuery } from '@/store/api/userApi';
import { useGetMyWalletQuery } from '@/store/api/walletApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import type { SubscriptionPaymentMethod } from '@/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';



export function useSubscriptionPaymentState() {
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
  const { data: premiumOverview, refetch: refetchPremiumOverview } =
    useGetPremiumOverviewQuery(undefined, { skip: !isDriver });
  const {
    data: paymentHistory,
    refetch: refetchPaymentHistory,
  } = useGetPendingSubscriptionPaymentsQuery(undefined, { skip: !isDriver });
  const {
    data: walletSummary,
    refetch: refetchWallet,
  } = useGetMyWalletQuery(undefined, { skip: !isDriver });
  const [subscribeToPro, { isLoading: isSubscribing }] = useSubscribeToProMutation();
  const [subscribeToProWithPoints, { isLoading: isPayingWithPoints }] =
    useSubscribeToProWithPointsMutation();
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
  const scrollRef = useRef<ScrollView>(null);
  const phoneFieldOffsetRef = useRef(0);
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
  const isPointsPayment = selectedChannel === 'points';
  const subscriptionPointsAmount = Number(
    proPlan?.tokensAmount ?? proPlan?.pointsAmount ?? proPlan?.amount ?? 0,
  );
  const walletBalance = Number(walletSummary?.account.balance ?? 0);
  const pointsCurrency =
    proPlan?.tokensCurrency ||
    proPlan?.pointsCurrency ||
    walletSummary?.account.currency ||
    'PTS';
  const subscriptionPointsLabel = formatPointsAmount(
    proPlan?.tokensAmount ?? proPlan?.pointsAmount ?? proPlan?.amount ?? 0,
    pointsCurrency,
  );
  const walletBalanceLabel = formatPointsAmount(walletSummary?.account.balance ?? 0, pointsCurrency);
  const subscriptionRewardTokens = Number(proPlan?.subscriptionRewardTokens ?? 25);
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

  return {
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
    pollingRunIdRef,
    mountedRef,
    setIsAutoChecking,
    storageKey,
    setOrderNumber,
    setPaymentUrl,
    setStage,
    setMessage,
    setAutoCheckAttempt,
    currentUser,
    setSelectedChannel,
    setPaymentMethod,
    refetchPremiumOverview,
    refetchProfile,
    refetchWallet,
    subscriptionRewardTokens,
    showDialog,
    checkPaymentStatus,
    paymentHistory,
    selectedChannel,
    setRefreshing,
    refetchPaymentHistory,
    walletSummary,
    subscriptionPointsAmount,
    walletBalance,
    walletBalanceLabel,
    subscriptionPointsLabel,
    subscribeToProWithPoints,
    phone,
    setPhone,
    subscribeToPro,
    scrollRef,
    phoneFieldOffsetRef,
    prefilledPhoneRef,
    recentPendingPayment,
    restoredKeyRef,
    returnedPaymentStatus,
    handledPaymentStatusRef,
    insets,
    router,
    refreshing,
    isCompactHeight,
    planLabel,
    priceLabel,
    isTightHeight,
  };
}
