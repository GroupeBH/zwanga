import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ExpoLinking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import {
  ELECTRONIC_PAYMENTS_ENABLED,
  ZWANGA_POINT_VALUE_CDF,
} from '@/constants/paymentFeatures';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useGetMyBookingsQuery,
  useInitiateBookingPaymentMutation,
  useLazyCheckBookingPaymentStatusQuery,
  useUpdateBookingPaymentModeMutation,
} from '@/store/api/bookingApi';
import { useGetPaymentHistoryQuery } from '@/store/api/paymentApi';
import {
  useGetMyWalletQuery,
  useInitiateWalletTopUpMutation,
  useLazyCheckWalletTopUpStatusQuery,
} from '@/store/api/walletApi';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated, selectUser } from '@/store/selectors';
import type {
  Booking,
  BookingPaymentResponse,
  PaymentHistoryItem,
  SubscriptionPaymentMethod,
  TripPaymentMode,
  WalletLedgerEntry,
  WalletSummary,
} from '@/types';
import { openExternalUrlSafely } from '@/utils/safeExternalUrl';

const ARRIVAL_PAYMENT_REFRESH_MS = 5_000;
const RECENT_ARRIVAL_WINDOW_MS = 24 * 60 * 60 * 1_000;
const PAYMENT_STATE_STORAGE_PREFIX = 'zwanga:passenger-arrival-payment:';
const BOOKING_CARD_PAYMENT_RETURN_PATH = 'booking/payment';
const DRC_PAYMENT_PHONE_REGEX = /^\+243\d{9}$/;

WebBrowser.maybeCompleteAuthSession();

type PaymentChannel = 'mpesa' | 'airtel' | 'orange' | 'card';

type StoredBookingPaymentState = {
  requiredActionAt?: string;
  acknowledgedAt?: string;
  bookingPaymentOrderNumber?: string;
  bookingPaymentMethod?: SubscriptionPaymentMethod;
  bookingPaymentChannel?: PaymentChannel;
  bookingPaymentUrl?: string;
  walletTopUpOrderNumber?: string;
};

type StoredPaymentState = Record<string, StoredBookingPaymentState>;

type PaymentOption = {
  id: TripPaymentMode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
};

type ElectronicPaymentChannel = {
  id: PaymentChannel;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
};

type PaymentCompletionSummary = {
  bookingId: string;
  mode: TripPaymentMode;
  channel?: PaymentChannel;
  amount: number;
  currency: string;
  walletBalance: number | null;
  earnedPoints: number;
  earnedPointsKnown: boolean;
  invoiceUrl?: string | null;
  paymentHistoryId?: string | null;
  paymentReference?: string | null;
  driverNotice: string;
};

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: 'electronic',
    icon: 'phone-portrait-outline',
    title: 'Mobile Money',
    description: 'Paiement securisé via FlexPay',
  },
  {
    id: 'points',
    icon: 'wallet-outline',
    title: 'Jetons Zwanga',
    description: 'Utilisez vos jetons et complétez si nécessaire',
  },
  {
    id: 'cash',
    icon: 'cash-outline',
    title: 'Espèces',
    description: 'Remettez le montant au conducteur',
  },
];

const ELECTRONIC_PAYMENT_CHANNELS: ElectronicPaymentChannel[] = [
  {
    id: 'mpesa',
    icon: 'phone-portrait-outline',
    title: 'M-Pesa',
    description: 'Confirmation par code PIN sur votre telephone',
  },
  {
    id: 'airtel',
    icon: 'phone-portrait-outline',
    title: 'Airtel Money',
    description: 'Confirmation par code PIN sur votre telephone',
  },
  {
    id: 'orange',
    icon: 'phone-portrait-outline',
    title: 'Orange Money',
    description: 'Confirmation par code PIN sur votre telephone',
  },
  {
    id: 'card',
    icon: 'card-outline',
    title: 'Carte',
    description: 'Paiement securise par carte bancaire',
  },
];

function normalizeAmount(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatMoney(value: number, currency?: string | null) {
  const normalizedCurrency = currency?.trim().toUpperCase() || 'CDF';
  const suffix = normalizedCurrency === 'CDF' ? 'FC' : normalizedCurrency;
  return `${formatNumber(value)} ${suffix}`;
}

function formatPoints(value: number) {
  return `${formatNumber(value)} jeton${value > 1 ? 's' : ''}`;
}

function formatPaymentPhone(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.startsWith('243') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+243${digits.slice(1)}`;
  if (digits.length === 9) return `+243${digits}`;
  return value?.trim();
}

function normalizePaymentPhone(value?: string | null) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed.startsWith('+') ? '+' : '';
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

function getPaymentMethodForChannel(channel: PaymentChannel): SubscriptionPaymentMethod {
  return channel === 'card' ? 'card' : 'mobile_money';
}

function isPaymentChannel(value: unknown): value is PaymentChannel {
  return value === 'mpesa' || value === 'airtel' || value === 'orange' || value === 'card';
}

function getPaymentChannelLabel(channel?: PaymentChannel) {
  switch (channel) {
    case 'mpesa':
      return 'M-Pesa';
    case 'airtel':
      return 'Airtel Money';
    case 'orange':
      return 'Orange Money';
    case 'card':
      return 'Carte';
    default:
      return 'Mobile Money';
  }
}

function getPaymentModeLabel(mode?: TripPaymentMode | null, channel?: PaymentChannel) {
  if (mode === 'points') return 'Jetons Zwanga';
  if (mode === 'cash') return 'Paiement en especes';
  if (mode === 'electronic') return getPaymentChannelLabel(channel);
  return 'Paiement';
}

function getPaymentFailureMessage(message?: string | null) {
  return message || "Le paiement n'a pas ete confirme. Vous pouvez reessayer.";
}

function isPaymentSucceeded(response: BookingPaymentResponse) {
  return response.payment.status === 'succeeded' || response.booking.paymentStatus === 'succeeded';
}

function createBookingCardPaymentRedirectUrls(bookingId: string) {
  const baseUrl = ExpoLinking.createURL(BOOKING_CARD_PAYMENT_RETURN_PATH);
  const separator = baseUrl.includes('?') ? '&' : '?';
  const withStatus = (status: 'success' | 'cancel' | 'decline') =>
    `${baseUrl}${separator}status=${status}&bookingId=${encodeURIComponent(bookingId)}`;

  return {
    approveUrl: withStatus('success'),
    cancelUrl: withStatus('cancel'),
    declineUrl: withStatus('decline'),
    returnUrl: baseUrl,
  };
}

function getCardPaymentResultFromUrl(url?: string | null) {
  if (!url) return null;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('status=success') || lowerUrl.includes('/success')) return 'success';
  if (lowerUrl.includes('status=cancel') || lowerUrl.includes('/cancel')) return 'cancel';
  if (lowerUrl.includes('status=decline') || lowerUrl.includes('/decline')) return 'decline';
  return null;
}

function hasPassengerArrived(booking: Booking) {
  return Boolean(
    booking.status === 'completed' ||
      booking.droppedOff ||
      booking.droppedOffConfirmedByPassenger ||
      booking.droppedOffAt,
  );
}

function getArrivalTimestamp(booking: Booking) {
  const timestamp = booking.droppedOffAt ?? booking.droppedOffConfirmedAt ?? booking.updatedAt;
  const parsed = timestamp ? new Date(timestamp).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function isFinanciallyPending(booking: Booking) {
  const amount = normalizeAmount(booking.paymentAmount);
  if (amount === 0) return false;
  if (booking.paymentStatus === 'succeeded') return false;
  if (booking.paymentMode === 'cash' && booking.paymentStatus === 'not_required') return false;
  return true;
}

function matchesBookingEntity(value: string | null | undefined, booking: Booking) {
  if (!value) return false;
  return [
    booking.id,
    booking.tripId,
    booking.paymentReference,
    booking.paymentTransactionId,
  ]
    .filter(Boolean)
    .some((candidate) => String(candidate) === String(value));
}

function findBookingPaymentHistory(
  payments: PaymentHistoryItem[] | undefined,
  booking: Booking,
) {
  return (
    payments
      ?.filter((payment) => {
        if (payment.purpose !== 'trip_booking') return false;
        return (
          matchesBookingEntity(payment.relatedEntityId, booking) ||
          matchesBookingEntity(payment.reference, booking) ||
          matchesBookingEntity(payment.orderNumber, booking)
        );
      })
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null
  );
}

function getLedgerEntryAmount(entry?: WalletLedgerEntry | null) {
  const amount = normalizeAmount(entry?.amount);
  return amount === null ? 0 : amount;
}

function findBookingRewardEntry(wallet: WalletSummary | undefined | null, booking: Booking) {
  return (
    wallet?.recentEntries
      ?.filter((entry) => {
        if (entry.type !== 'loyalty_reward') return false;
        if (getLedgerEntryAmount(entry) <= 0) return false;
        return (
          matchesBookingEntity(entry.relatedEntityId, booking) ||
          matchesBookingEntity(entry.paymentTransactionId, booking)
        );
      })
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null
  );
}

function getStorageKey(userId: string) {
  return `${PAYMENT_STATE_STORAGE_PREFIX}${userId}`;
}

export function PassengerArrivalPaymentCoordinator() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectUser);
  const [storedState, setStoredState] = useState<StoredPaymentState>({});
  const [isStoredStateLoaded, setIsStoredStateLoaded] = useState(false);
  const [selectedMode, setSelectedMode] = useState<TripPaymentMode>('cash');
  const [selectedChannel, setSelectedChannel] = useState<PaymentChannel>('mpesa');
  const [paymentPhone, setPaymentPhone] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<PaymentCompletionSummary | null>(null);
  const [isClosingForInvoice, setIsClosingForInvoice] = useState(false);
  const activeBookingIdRef = useRef<string | null>(null);
  const pendingInvoicePaymentIdRef = useRef<string | null | undefined>(undefined);
  const paymentCheckInFlightRef = useRef(false);

  const {
    data: bookings = [],
    refetch: refetchBookings,
  } = useGetMyBookingsQuery(undefined, {
    skip: !isAuthenticated,
    pollingInterval: ARRIVAL_PAYMENT_REFRESH_MS,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const arrivalBooking = useMemo(() => {
    if (!isStoredStateLoaded) return null;

    return [...bookings]
      .filter((booking) => {
        if (!hasPassengerArrived(booking)) return false;
        if (storedState[booking.id]?.acknowledgedAt) return false;

        const isRecent = Date.now() - getArrivalTimestamp(booking) <= RECENT_ARRIVAL_WINDOW_MS;
        const isAlreadyPresented = Boolean(storedState[booking.id]?.requiredActionAt);
        return isFinanciallyPending(booking) || isRecent || isAlreadyPresented;
      })
      .sort((left, right) => getArrivalTimestamp(right) - getArrivalTimestamp(left))[0] ?? null;
  }, [bookings, isStoredStateLoaded, storedState]);

  const {
    data: wallet,
    isFetching: isWalletFetching,
    refetch: refetchWallet,
  } = useGetMyWalletQuery(undefined, {
    skip: !isAuthenticated || !arrivalBooking,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const {
    data: paymentHistory = [],
    refetch: refetchPaymentHistory,
  } = useGetPaymentHistoryQuery(undefined, {
    skip: !isAuthenticated || !arrivalBooking,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const [updatePaymentMode, { isLoading: isUpdatingPaymentMode }] =
    useUpdateBookingPaymentModeMutation();
  const [initiateBookingPayment, { isLoading: isInitiatingBookingPayment }] =
    useInitiateBookingPaymentMutation();
  const [checkBookingPaymentStatus] = useLazyCheckBookingPaymentStatusQuery();
  const [initiateWalletTopUp, { isLoading: isInitiatingWalletTopUp }] =
    useInitiateWalletTopUpMutation();
  const [checkWalletTopUpStatus] = useLazyCheckWalletTopUpStatusQuery();

  const isBusy =
    isUpdatingPaymentMode ||
    isInitiatingBookingPayment ||
    isInitiatingWalletTopUp ||
    isCheckingPayment;

  const paymentAmount = normalizeAmount(arrivalBooking?.paymentAmount);
  const paymentCurrency = arrivalBooking?.paymentCurrency ?? 'CDF';
  const walletBalance = Math.max(0, normalizeAmount(wallet?.account.balance) ?? 0);
  const requiredPoints = paymentAmount === null
    ? null
    : roundMoney(paymentAmount / ZWANGA_POINT_VALUE_CDF);
  const pointsUsed = requiredPoints === null ? 0 : Math.min(walletBalance, requiredPoints);
  const missingPoints = requiredPoints === null
    ? 0
    : roundMoney(Math.max(0, requiredPoints - pointsUsed));
  const amountCoveredByPoints = roundMoney(pointsUsed * ZWANGA_POINT_VALUE_CDF);
  const moneyComplement = roundMoney(missingPoints * ZWANGA_POINT_VALUE_CDF);
  const pointsCoveragePercentage =
    paymentAmount && paymentAmount > 0
      ? Math.min(100, Math.round((amountCoveredByPoints / paymentAmount) * 100))
      : 0;
  const arePointsRecommended = pointsCoveragePercentage >= 75;
  const paymentAlreadySucceeded =
    arrivalBooking?.paymentStatus === 'succeeded' || paymentAmount === 0;
  const activeStoredState = arrivalBooking ? storedState[arrivalBooking.id] : undefined;
  const hasPendingProviderPayment = Boolean(
    activeStoredState?.bookingPaymentOrderNumber || activeStoredState?.walletTopUpOrderNumber,
  );
  const hasCardPaymentToResume = Boolean(
    activeStoredState?.bookingPaymentOrderNumber &&
      activeStoredState.bookingPaymentMethod === 'card' &&
      activeStoredState.bookingPaymentUrl,
  );
  const mobileMoneyPhone = formatPaymentPhone(paymentPhone || user?.phone);

  const persistBookingState = useCallback(
    (bookingId: string, patch: Partial<Record<keyof StoredBookingPaymentState, string | null>>) => {
      if (!user?.id) return;

      setStoredState((current) => {
        const nextBookingState = { ...(current[bookingId] ?? {}) };
        Object.entries(patch).forEach(([key, value]) => {
          const typedKey = key as keyof StoredBookingPaymentState;
          if (value) {
            (nextBookingState as Record<string, string | undefined>)[typedKey] = value;
          } else {
            delete (nextBookingState as Record<string, string | undefined>)[typedKey];
          }
        });
        const next = { ...current, [bookingId]: nextBookingState };
        void AsyncStorage.setItem(getStorageKey(user.id), JSON.stringify(next));
        return next;
      });
    },
    [user?.id],
  );

  const acknowledgeBooking = useCallback(
    (bookingId: string) => {
      persistBookingState(bookingId, {
        acknowledgedAt: new Date().toISOString(),
        bookingPaymentOrderNumber: null,
        bookingPaymentUrl: null,
        walletTopUpOrderNumber: null,
      });
    },
    [persistBookingState],
  );

  const showCompletionSummary = useCallback(
    async (
      sourceBooking: Booking,
      options: {
        mode?: TripPaymentMode | null;
        channel?: PaymentChannel;
        paymentReference?: string | null;
      } = {},
    ) => {
      const [bookingsResult, walletResult, historyResult] = await Promise.allSettled([
        refetchBookings(),
        refetchWallet(),
        refetchPaymentHistory(),
      ]);

      const latestBookings =
        bookingsResult.status === 'fulfilled' && Array.isArray(bookingsResult.value.data)
          ? bookingsResult.value.data
          : bookings;
      const latestWallet =
        walletResult.status === 'fulfilled' && walletResult.value.data
          ? walletResult.value.data
          : wallet;
      const latestPaymentHistory =
        historyResult.status === 'fulfilled' && Array.isArray(historyResult.value.data)
          ? historyResult.value.data
          : paymentHistory;

      const latestBooking =
        latestBookings.find((booking) => booking.id === sourceBooking.id) ?? sourceBooking;
      const payment = findBookingPaymentHistory(latestPaymentHistory, latestBooking);
      const rewardEntry = findBookingRewardEntry(latestWallet, latestBooking);
      const earnedPoints = getLedgerEntryAmount(rewardEntry);
      const amount = normalizeAmount(latestBooking.paymentAmount) ?? normalizeAmount(payment?.amount) ?? 0;
      const currency = latestBooking.paymentCurrency ?? payment?.currency ?? 'CDF';
      const mode = latestBooking.paymentMode ?? options.mode ?? 'cash';
      const balance = normalizeAmount(latestWallet?.account.balance);
      const paymentHistoryId = payment?.id ?? null;

      setCompletionSummary({
        bookingId: latestBooking.id,
        mode,
        channel: options.channel,
        amount,
        currency,
        walletBalance: balance,
        earnedPoints,
        earnedPointsKnown: Boolean(rewardEntry),
        invoiceUrl: paymentHistoryId ? `/payment-history?paymentId=${paymentHistoryId}` : null,
        paymentHistoryId,
        paymentReference:
          latestBooking.paymentReference ?? payment?.reference ?? options.paymentReference ?? null,
        driverNotice:
          mode === 'cash'
            ? 'Le conducteur est informe que vous avez confirme le paiement en especes.'
            : 'Le conducteur est informe des que le paiement est confirme.',
      });
    },
    [
      bookings,
      paymentHistory,
      refetchBookings,
      refetchPaymentHistory,
      refetchWallet,
      wallet,
    ],
  );

  const handleCompletedBookingPayment = useCallback(
    async (
      response: BookingPaymentResponse,
      options: { mode?: TripPaymentMode | null; channel?: PaymentChannel } = {},
    ) => {
      if (isPaymentSucceeded(response) || normalizeAmount(response.payment.amount) === 0) {
        persistBookingState(response.booking.id, {
          bookingPaymentOrderNumber: null,
          bookingPaymentUrl: null,
        });
        await showCompletionSummary(response.booking, {
          mode: options.mode ?? response.booking.paymentMode,
          channel: options.channel,
          paymentReference: response.payment.reference,
        });
        return true;
      }

      if (response.payment.status === 'failed' || response.payment.status === 'cancelled') {
        persistBookingState(response.booking.id, {
          bookingPaymentOrderNumber: null,
          bookingPaymentUrl: null,
        });
        setPaymentError(getPaymentFailureMessage(response.payment.message));
        return true;
      }

      return false;
    },
    [persistBookingState, showCompletionSummary],
  );

  const openCardPaymentUrl = useCallback(
    async (
      paymentUrl: string,
      orderNumber: string | null,
      returnUrl: string,
      channel: PaymentChannel,
    ) => {
      setStatusMessage('Page carte ouverte. Finalisez le paiement; nous verifierons le retour.');

      const result = await WebBrowser.openAuthSessionAsync(paymentUrl, returnUrl);
      if (result.type !== 'success') {
        if (orderNumber) {
          setStatusMessage("Retour dans l'app detecte. Verification du paiement carte en cours...");
          return false;
        }

        setPaymentError('Le paiement par carte a ete ferme avant la confirmation.');
        return true;
      }

      const paymentResult = getCardPaymentResultFromUrl(result.url);
      if (paymentResult === 'cancel' || paymentResult === 'decline') {
        setPaymentError(
          paymentResult === 'cancel'
            ? 'Paiement carte annule. Vous pouvez reessayer.'
            : 'Paiement carte refuse. Verifiez votre carte ou choisissez un autre moyen.',
        );
        return true;
      }

      if (!orderNumber) {
        setStatusMessage('Retour carte recu. Zwanga finalisera la confirmation automatiquement.');
        return false;
      }

      const statusResponse = await checkBookingPaymentStatus(orderNumber).unwrap();
      const finished = await handleCompletedBookingPayment(statusResponse, {
        mode: 'electronic',
        channel,
      });

      if (!finished) {
        setStatusMessage(
          statusResponse.payment.message ??
            'Paiement carte en cours de validation. Nous continuons la verification.',
        );
      }

      return finished;
    },
    [checkBookingPaymentStatus, handleCompletedBookingPayment],
  );

  const settleWithPoints = useCallback(
    async (bookingId: string) => {
      const updatedBooking = await updatePaymentMode({
        bookingId,
        paymentMode: 'points',
      }).unwrap();

      await Promise.all([refetchBookings(), refetchWallet()]);
      if (
        updatedBooking.paymentStatus === 'succeeded' ||
        updatedBooking.paymentStatus === 'not_required' ||
        normalizeAmount(updatedBooking.paymentAmount) === 0
      ) {
        await showCompletionSummary(updatedBooking, { mode: 'points' });
        return true;
      }

      setStatusMessage('Les jetons sont en cours de vérification. Le modal restera ouvert.');
      return false;
    },
    [refetchBookings, refetchWallet, showCompletionSummary, updatePaymentMode],
  );

  useEffect(() => {
    let cancelled = false;
    setIsStoredStateLoaded(false);

    if (!isAuthenticated || !user?.id) {
      setStoredState({});
      setIsStoredStateLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    void AsyncStorage.getItem(getStorageKey(user.id))
      .then((rawValue) => {
        if (cancelled) return;
        if (!rawValue) {
          setStoredState({});
          return;
        }
        const parsed = JSON.parse(rawValue) as StoredPaymentState;
        setStoredState(parsed && typeof parsed === 'object' ? parsed : {});
      })
      .catch((error) => {
        console.warn('[PassengerArrivalPayment] État local illisible:', error);
        if (!cancelled) setStoredState({});
      })
      .finally(() => {
        if (!cancelled) setIsStoredStateLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    const bookingId = arrivalBooking?.id ?? null;
    if (activeBookingIdRef.current === bookingId) return;

    activeBookingIdRef.current = bookingId;
    const storedChannel = bookingId ? storedState[bookingId]?.bookingPaymentChannel : null;
    setSelectedMode(arrivalBooking?.paymentMode ?? 'cash');
    setSelectedChannel(isPaymentChannel(storedChannel) ? storedChannel : 'mpesa');
    setPaymentPhone(normalizePaymentPhone(user?.phone));
    setCompletionSummary((current) =>
      current && bookingId && current.bookingId !== bookingId ? null : current,
    );
    setStatusMessage('');
    setPaymentError('');
  }, [arrivalBooking?.id, arrivalBooking?.paymentMode, storedState, user?.phone]);

  useEffect(() => {
    if (!arrivalBooking || storedState[arrivalBooking.id]?.requiredActionAt) return;
    persistBookingState(arrivalBooking.id, { requiredActionAt: new Date().toISOString() });
  }, [arrivalBooking, persistBookingState, storedState]);

  useEffect(() => {
    const bookingId = arrivalBooking?.id;
    const walletTopUpOrderNumber = activeStoredState?.walletTopUpOrderNumber;
    const bookingPaymentOrderNumber = activeStoredState?.bookingPaymentOrderNumber;
    if (!bookingId || (!walletTopUpOrderNumber && !bookingPaymentOrderNumber)) return;

    let cancelled = false;

    const checkPayment = async () => {
      if (paymentCheckInFlightRef.current || cancelled) return;
      paymentCheckInFlightRef.current = true;
      setIsCheckingPayment(true);

      try {
        if (walletTopUpOrderNumber) {
          const response = await checkWalletTopUpStatus(walletTopUpOrderNumber).unwrap();
          if (cancelled) return;

          if (response.payment.status === 'succeeded') {
            persistBookingState(bookingId, { walletTopUpOrderNumber: null });
            setStatusMessage('Recharge confirmée. Paiement de la course en cours...');
            await refetchWallet();
            await settleWithPoints(bookingId);
            return;
          }

          if (response.payment.status === 'failed' || response.payment.status === 'cancelled') {
            persistBookingState(bookingId, { walletTopUpOrderNumber: null });
            setPaymentError(response.payment.message ?? 'La recharge des jetons a échoué.');
            return;
          }

          setStatusMessage(
            response.payment.message ?? 'Confirmez le complément Mobile Money sur votre téléphone.',
          );
          return;
        }

        if (bookingPaymentOrderNumber) {
          const response = await checkBookingPaymentStatus(bookingPaymentOrderNumber).unwrap();
          if (cancelled) return;

          const finished = await handleCompletedBookingPayment(response, {
            mode: 'electronic',
            channel: activeStoredState?.bookingPaymentChannel,
          });
          if (finished) {
            return;
          }

          if (response.payment.status === 'failed' || response.payment.status === 'cancelled') {
            persistBookingState(bookingId, { bookingPaymentOrderNumber: null });
            setPaymentError(response.payment.message ?? 'Le paiement Mobile Money a échoué.');
            return;
          }

          setStatusMessage(
            response.payment.message ?? 'Confirmez le paiement Mobile Money sur votre téléphone.',
          );
        }
      } catch (error) {
        console.warn('[PassengerArrivalPayment] Vérification du paiement impossible:', error);
      } finally {
        paymentCheckInFlightRef.current = false;
        if (!cancelled) setIsCheckingPayment(false);
      }
    };

    void checkPayment();
    const interval = setInterval(() => void checkPayment(), ARRIVAL_PAYMENT_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    activeStoredState?.bookingPaymentChannel,
    activeStoredState?.bookingPaymentOrderNumber,
    activeStoredState?.walletTopUpOrderNumber,
    arrivalBooking?.id,
    checkBookingPaymentStatus,
    checkWalletTopUpStatus,
    handleCompletedBookingPayment,
    persistBookingState,
    refetchWallet,
    settleWithPoints,
  ]);

  const handlePayment = useCallback(async () => {
    if (!arrivalBooking || paymentAmount === null || isBusy || hasPendingProviderPayment) return;

    setPaymentError('');
    setStatusMessage('');

    if (paymentAlreadySucceeded) {
      await showCompletionSummary(arrivalBooking, {
        mode: arrivalBooking.paymentMode ?? selectedMode,
        channel: selectedMode === 'electronic' ? selectedChannel : undefined,
      });
      return;
    }

    try {
      if (selectedMode === 'cash') {
        const updatedBooking = await updatePaymentMode({
          bookingId: arrivalBooking.id,
          paymentMode: 'cash',
        }).unwrap();
        await showCompletionSummary(updatedBooking, { mode: 'cash' });
        return;
      }

      if (selectedMode === 'points') {
        if (requiredPoints === null || isWalletFetching) return;

        if (missingPoints <= 0) {
          await settleWithPoints(arrivalBooking.id);
          return;
        }

        const phone = mobileMoneyPhone;
        if (!phone || !DRC_PAYMENT_PHONE_REGEX.test(phone)) {
          setPaymentError(
            'Un numéro congolais valide est nécessaire dans votre profil pour payer le complément.',
          );
          return;
        }

        setStatusMessage(
          `Recharge de ${formatPoints(missingPoints)} pour compléter le paiement...`,
        );
        const response = await initiateWalletTopUp({
          amount: missingPoints,
          method: 'mobile_money',
          phone,
        }).unwrap();

        if (response.payment.status !== 'succeeded' && response.payment.orderNumber) {
          persistBookingState(arrivalBooking.id, {
            walletTopUpOrderNumber: response.payment.orderNumber,
          });
        }
        if (response.payment.paymentUrl) {
          await openExternalUrlSafely(response.payment.paymentUrl, {
            logLabel: 'PassengerArrivalPointsComplement',
          });
        }

        if (response.payment.status === 'succeeded') {
          await refetchWallet();
          await settleWithPoints(arrivalBooking.id);
          return;
        }

        setStatusMessage(
          response.payment.message ??
            `Confirmez le complément de ${formatMoney(moneyComplement, paymentCurrency)} sur votre téléphone.`,
        );
        return;
      }

      if (!ELECTRONIC_PAYMENTS_ENABLED) return;
      const method = getPaymentMethodForChannel(selectedChannel);
      const phone = method === 'mobile_money' ? mobileMoneyPhone : undefined;
      if (method === 'mobile_money' && (!phone || !DRC_PAYMENT_PHONE_REGEX.test(phone))) {
        setPaymentError(
          'Un numero congolais valide est necessaire pour Mobile Money. Exemple: +243891234567.',
        );
        return;
      }
      if (arrivalBooking.paymentMode !== 'electronic') {
        await updatePaymentMode({
          bookingId: arrivalBooking.id,
          paymentMode: 'electronic',
        }).unwrap();
      }

      const cardRedirectUrls =
        method === 'card' ? createBookingCardPaymentRedirectUrls(arrivalBooking.id) : null;
      const response = await initiateBookingPayment({
        bookingId: arrivalBooking.id,
        method,
        phone,
        ...(cardRedirectUrls
          ? {
              approveUrl: cardRedirectUrls.approveUrl,
              cancelUrl: cardRedirectUrls.cancelUrl,
              declineUrl: cardRedirectUrls.declineUrl,
            }
          : {}),
      }).unwrap();

      if (response.payment.status !== 'succeeded' && response.payment.orderNumber) {
        persistBookingState(arrivalBooking.id, {
          bookingPaymentOrderNumber: response.payment.orderNumber,
          bookingPaymentMethod: method,
          bookingPaymentChannel: selectedChannel,
          bookingPaymentUrl: response.payment.paymentUrl,
        });
      }
      if (response.payment.paymentUrl) {
        if (method === 'card' && cardRedirectUrls) {
          const finished = await openCardPaymentUrl(
            response.payment.paymentUrl,
            response.payment.orderNumber,
            cardRedirectUrls.returnUrl,
            selectedChannel,
          );
          if (finished) return;
        } else {
          await openExternalUrlSafely(response.payment.paymentUrl, {
            logLabel: 'PassengerArrivalPayment',
          });
        }
      }

      const finished = await handleCompletedBookingPayment(response, {
        mode: 'electronic',
        channel: selectedChannel,
      });
      if (finished) {
        return;
      }

      setStatusMessage(
        response.payment.message ??
          (method === 'card'
            ? 'Paiement carte en cours de validation.'
            : 'Confirmez le paiement Mobile Money sur votre telephone.'),
      );
    } catch (error: any) {
      const message = error?.data?.message ?? error?.error ?? "Le paiement n'a pas pu être effectué.";
      setPaymentError(Array.isArray(message) ? message.join('\n') : String(message));
    }
  }, [
    arrivalBooking,
    handleCompletedBookingPayment,
    initiateBookingPayment,
    initiateWalletTopUp,
    hasPendingProviderPayment,
    isBusy,
    isWalletFetching,
    missingPoints,
    mobileMoneyPhone,
    moneyComplement,
    openCardPaymentUrl,
    paymentAlreadySucceeded,
    paymentAmount,
    paymentCurrency,
    persistBookingState,
    refetchWallet,
    requiredPoints,
    selectedChannel,
    selectedMode,
    settleWithPoints,
    showCompletionSummary,
    updatePaymentMode,
  ]);

  const handleDismissSummary = useCallback(() => {
    if (!completionSummary) return;
    acknowledgeBooking(completionSummary.bookingId);
    setCompletionSummary(null);
  }, [acknowledgeBooking, completionSummary]);

  const navigateToInvoice = useCallback(
    (paymentHistoryId?: string | null) => {
      router.push(
        paymentHistoryId
          ? ({
              pathname: '/payment-history',
              params: { paymentId: paymentHistoryId },
            } as any)
          : ('/payment-history' as any),
      );
    },
    [router],
  );

  const handleModalDismiss = useCallback(() => {
    const paymentHistoryId = pendingInvoicePaymentIdRef.current;
    if (paymentHistoryId === undefined) return;

    pendingInvoicePaymentIdRef.current = undefined;
    InteractionManager.runAfterInteractions(() => {
      navigateToInvoice(paymentHistoryId);
      setIsClosingForInvoice(false);
    });
  }, [navigateToInvoice]);

  const handleOpenInvoice = useCallback(() => {
    if (!completionSummary) return;
    const paymentHistoryId = completionSummary.paymentHistoryId;

    if (Platform.OS === 'ios') {
      pendingInvoicePaymentIdRef.current = paymentHistoryId ?? null;
      setIsClosingForInvoice(true);
    }

    acknowledgeBooking(completionSummary.bookingId);
    setCompletionSummary(null);

    if (Platform.OS !== 'ios') {
      navigateToInvoice(paymentHistoryId);
    }
  }, [acknowledgeBooking, completionSummary, navigateToInvoice]);

  const handleResumeCardPayment = useCallback(async () => {
    if (
      !arrivalBooking ||
      !activeStoredState?.bookingPaymentUrl ||
      !activeStoredState.bookingPaymentOrderNumber ||
      isBusy
    ) {
      return;
    }

    setPaymentError('');
    const redirectUrls = createBookingCardPaymentRedirectUrls(arrivalBooking.id);
    await openCardPaymentUrl(
      activeStoredState.bookingPaymentUrl,
      activeStoredState.bookingPaymentOrderNumber,
      redirectUrls.returnUrl,
      activeStoredState.bookingPaymentChannel ?? 'card',
    );
  }, [
    activeStoredState?.bookingPaymentChannel,
    activeStoredState?.bookingPaymentOrderNumber,
    activeStoredState?.bookingPaymentUrl,
    arrivalBooking,
    isBusy,
    openCardPaymentUrl,
  ]);

  const shouldKeepModalMounted = Boolean(arrivalBooking || completionSummary || isClosingForInvoice);
  const isModalVisible = Boolean((arrivalBooking || completionSummary) && !isClosingForInvoice);

  if (!shouldKeepModalMounted) return null;

  const destination =
    arrivalBooking?.passengerDestination ??
    arrivalBooking?.trip?.arrival?.address ??
    arrivalBooking?.trip?.arrival?.name ??
    'Votre destination';
  const actionLabel = paymentAlreadySucceeded
    ? 'Terminer'
    : selectedMode === 'cash'
      ? 'Confirmer le paiement en espèces'
      : selectedMode === 'points'
        ? missingPoints > 0
          ? `Ajouter ${formatMoney(moneyComplement, paymentCurrency)} et payer`
          : `Payer avec ${formatPoints(requiredPoints ?? 0)}`
        : selectedChannel === 'card'
          ? 'Payer par carte'
          : `Payer par ${getPaymentChannelLabel(selectedChannel)}`;
  const needsMobileMoneyPhone =
    !paymentAlreadySucceeded &&
    ((selectedMode === 'electronic' && selectedChannel !== 'card') ||
      (selectedMode === 'points' && moneyComplement > 0));
  const isPaymentPhoneInvalid =
    needsMobileMoneyPhone && (!mobileMoneyPhone || !DRC_PAYMENT_PHONE_REGEX.test(mobileMoneyPhone));
  const isPayButtonDisabled =
    isBusy ||
    hasPendingProviderPayment ||
    paymentAmount === null ||
    isPaymentPhoneInvalid ||
    (selectedMode === 'points' && isWalletFetching);

  return (
    <Modal
      visible={isModalVisible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onDismiss={handleModalDismiss}
      onRequestClose={completionSummary ? handleDismissSummary : () => undefined}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoidingView}
        >
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.md }]}>
            <View style={styles.handle} />
            {completionSummary ? (
              <>
                <ScrollView
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.content}
                >
                  <View style={styles.header}>
                    <View style={[styles.arrivalIcon, styles.summaryIcon]}>
                      <Ionicons name="checkmark" size={30} color={Colors.white} />
                    </View>
                    <View style={styles.headerCopy}>
                      <Text style={styles.eyebrow}>PAIEMENT CONFIRME</Text>
                      <Text style={styles.title}>Trajet termine</Text>
                    </View>
                  </View>

                  <View style={styles.amountCard}>
                    <Text style={styles.amountLabel}>Montant regle</Text>
                    <Text style={styles.amountValue}>
                      {formatMoney(completionSummary.amount, completionSummary.currency)}
                    </Text>
                    <Text style={styles.amountHint}>
                      Moyen utilise: {getPaymentModeLabel(completionSummary.mode, completionSummary.channel)}
                    </Text>
                  </View>

                  <View style={styles.summaryRows}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Nouveau solde</Text>
                      <Text style={styles.summaryValue}>
                        {completionSummary.walletBalance === null
                          ? 'Actualisation en cours'
                          : formatPoints(completionSummary.walletBalance)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Jetons gagnes</Text>
                      <Text style={styles.summaryValue}>
                        {completionSummary.earnedPointsKnown
                          ? formatPoints(completionSummary.earnedPoints)
                          : 'Calcul en cours'}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Reference</Text>
                      <Text style={styles.summaryValue} numberOfLines={1}>
                        {completionSummary.paymentReference ?? 'A venir'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.successBox}>
                    <Ionicons name="notifications-outline" size={22} color={Colors.successDark} />
                    <View style={styles.successCopy}>
                      <Text style={styles.successTitle}>Conducteur informe</Text>
                      <Text style={styles.successText}>{completionSummary.driverNotice}</Text>
                    </View>
                  </View>
                </ScrollView>

                <View style={styles.summaryActions}>
                  {completionSummary.invoiceUrl ? (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={handleOpenInvoice}
                      style={[styles.payButton, styles.invoiceButton]}
                    >
                      <Ionicons name="receipt-outline" size={20} color={Colors.primary} />
                      <Text style={[styles.payButtonText, styles.invoiceButtonText]}>Voir la facture</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity activeOpacity={0.88} onPress={handleDismissSummary} style={styles.payButton}>
                    <Ionicons name="checkmark" size={20} color={Colors.white} />
                    <Text style={styles.payButtonText}>Terminer</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : arrivalBooking ? (
              <>
                <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.header}>
              <View style={styles.arrivalIcon}>
                <Ionicons name="flag" size={28} color={Colors.white} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>ARRIVÉE CONFIRMÉE</Text>
                <Text style={styles.title}>Vous êtes arrivé</Text>
              </View>
            </View>

            <View style={styles.destinationRow}>
              <Ionicons name="location" size={18} color={Colors.primary} />
              <Text style={styles.destination} numberOfLines={2}>{destination}</Text>
            </View>

            <View style={styles.amountCard}>
              <Text style={styles.amountLabel}>Montant du trajet</Text>
              <Text style={styles.amountValue}>
                {paymentAmount === null
                  ? 'Calcul en cours...'
                  : formatMoney(paymentAmount, paymentCurrency)}
              </Text>
              <Text style={styles.amountHint}>
                Choisissez comment régler ce trajet. Cette fenêtre restera ouverte jusqu’à votre action.
              </Text>
            </View>

            {paymentAlreadySucceeded ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={22} color={Colors.successDark} />
                <View style={styles.successCopy}>
                  <Text style={styles.successTitle}>Paiement déjà confirmé</Text>
                  <Text style={styles.successText}>Vous pouvez terminer ce récapitulatif.</Text>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Moyen de paiement</Text>
                {arePointsRecommended ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={isBusy || hasPendingProviderPayment}
                    onPress={() => {
                      setSelectedMode('points');
                      setPaymentError('');
                      setStatusMessage('');
                    }}
                    style={styles.pointsRecommendation}
                  >
                    <View style={styles.pointsRecommendationIcon}>
                      <Ionicons name="sparkles" size={18} color={Colors.primaryDark} />
                    </View>
                    <View style={styles.pointsRecommendationCopy}>
                      <Text style={styles.pointsRecommendationTitle}>
                        Vos jetons couvrent {pointsCoveragePercentage} % du trajet
                      </Text>
                      <Text style={styles.pointsRecommendationText}>
                        Utilisez-les et ne payez que le complément restant.
                      </Text>
                    </View>
                    <View style={styles.pointsRecommendationAction}>
                      <Text style={styles.pointsRecommendationActionText}>Utiliser</Text>
                      <Ionicons name="chevron-forward" size={16} color={Colors.primaryDark} />
                    </View>
                  </TouchableOpacity>
                ) : null}
                <View style={styles.options}>
                  {PAYMENT_OPTIONS.filter(
                    (option) => option.id !== 'electronic' || ELECTRONIC_PAYMENTS_ENABLED,
                  ).map((option) => {
                    const isSelected = selectedMode === option.id;
                    const isRecommended = arePointsRecommended && option.id === 'points';
                    return (
                      <TouchableOpacity
                        key={option.id}
                        activeOpacity={0.85}
                        disabled={isBusy || hasPendingProviderPayment}
                        onPress={() => {
                          setSelectedMode(option.id);
                          setPaymentError('');
                          setStatusMessage('');
                        }}
                        style={[
                          styles.option,
                          isRecommended && styles.optionRecommended,
                          isSelected && styles.optionSelected,
                        ]}
                      >
                        <View style={[styles.optionIcon, isSelected && styles.optionIconSelected]}>
                          <Ionicons
                            name={option.icon}
                            size={22}
                            color={isSelected ? Colors.primary : Colors.gray[600]}
                          />
                        </View>
                        <View style={styles.optionCopy}>
                          <View style={styles.optionTitleRow}>
                            <Text style={[styles.optionTitle, isSelected && styles.optionTitleSelected]}>
                              {option.title}
                            </Text>
                            {isRecommended ? (
                              <View style={styles.recommendedBadge}>
                                <Text style={styles.recommendedBadgeText}>RECOMMANDE</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.optionDescription}>
                            {isRecommended
                              ? `${pointsCoveragePercentage} % du montant déjà couvert`
                              : option.description}
                          </Text>
                        </View>
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={22}
                          color={isSelected ? Colors.primary : Colors.gray[300]}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {!paymentAlreadySucceeded && selectedMode === 'points' && (
              <View style={styles.pointsCard}>
                <View style={styles.pointsHeader}>
                  <View>
                    <Text style={styles.pointsLabel}>Vos jetons disponibles</Text>
                    <Text style={styles.pointsBalance}>
                      {isWalletFetching ? 'Actualisation...' : formatPoints(walletBalance)}
                    </Text>
                  </View>
                  <View style={styles.walletBadge}>
                    <Ionicons name="wallet" size={18} color={Colors.primary} />
                  </View>
                </View>
                <View style={styles.breakdownDivider} />
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Jetons utilises</Text>
                  <Text style={styles.breakdownValue}>{formatPoints(pointsUsed)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Montant couvert</Text>
                  <Text style={styles.breakdownValue}>
                    {formatMoney(amountCoveredByPoints, paymentCurrency)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Complément Mobile Money</Text>
                  <Text style={[styles.breakdownValue, moneyComplement > 0 && styles.complementValue]}>
                    {formatMoney(moneyComplement, paymentCurrency)}
                  </Text>
                </View>
                {moneyComplement > 0 && (
                  <Text style={styles.pointsHint}>
                    Seul le complément achètera les jetons manquants. Vos jetons actuels seront ensuite ajoutés pour régler la totalité du trajet.
                  </Text>
                )}
              </View>
            )}

            {!paymentAlreadySucceeded && selectedMode === 'electronic' && ELECTRONIC_PAYMENTS_ENABLED && (
              <View style={styles.electronicCard}>
                <Text style={styles.paymentFieldLabel}>Canal de paiement</Text>
                <View style={styles.channelGrid}>
                  {ELECTRONIC_PAYMENT_CHANNELS.map((channel) => {
                    const isSelected = selectedChannel === channel.id;
                    return (
                      <TouchableOpacity
                        key={channel.id}
                        activeOpacity={0.86}
                        disabled={isBusy || hasPendingProviderPayment}
                        onPress={() => {
                          setSelectedChannel(channel.id);
                          setPaymentError('');
                          setStatusMessage('');
                        }}
                        style={[styles.channelOption, isSelected && styles.channelOptionSelected]}
                      >
                        <Ionicons
                          name={channel.icon}
                          size={20}
                          color={isSelected ? Colors.primary : Colors.gray[600]}
                        />
                        <View style={styles.channelCopy}>
                          <Text style={[styles.channelTitle, isSelected && styles.channelTitleSelected]}>
                            {channel.title}
                          </Text>
                          <Text style={styles.channelDescription} numberOfLines={2}>
                            {channel.description}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {needsMobileMoneyPhone && (
              <View style={styles.phoneCard}>
                <Text style={styles.paymentFieldLabel}>Numero Mobile Money</Text>
                <View style={[styles.phoneInputRow, isPaymentPhoneInvalid && styles.phoneInputRowInvalid]}>
                  <Ionicons name="call-outline" size={18} color={Colors.gray[500]} />
                  <TextInput
                    value={paymentPhone}
                    onChangeText={(value) => {
                      setPaymentPhone(normalizePaymentPhone(value));
                      setPaymentError('');
                    }}
                    onBlur={() => setPaymentPhone(formatPaymentPhone(paymentPhone) ?? paymentPhone)}
                    placeholder="+243891234567"
                    placeholderTextColor={Colors.gray[400]}
                    keyboardType="phone-pad"
                    editable={!isBusy && !hasPendingProviderPayment}
                    style={styles.phoneInput}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
                <Text style={[styles.phoneHint, isPaymentPhoneInvalid && styles.phoneHintInvalid]}>
                  {isPaymentPhoneInvalid
                    ? 'Entrez un numero congolais valide commencant par +243.'
                    : selectedMode === 'points'
                      ? 'Ce numero servira seulement si un complement est necessaire.'
                      : selectedChannel === 'card'
                        ? 'Aucun numero requis pour le paiement par carte.'
                        : `Demande envoyee via ${getPaymentChannelLabel(selectedChannel)}.`}
                </Text>
              </View>
            )}

            {hasCardPaymentToResume && (
              <TouchableOpacity
                activeOpacity={0.88}
                disabled={isBusy}
                onPress={() => void handleResumeCardPayment()}
                style={styles.resumePaymentButton}
              >
                <Ionicons name="open-outline" size={18} color={Colors.primary} />
                <Text style={styles.resumePaymentText}>Rouvrir la page carte</Text>
              </TouchableOpacity>
            )}

            {statusMessage ? (
              <View style={styles.statusBox}>
                <ActivityIndicator size="small" color={Colors.infoDark} />
                <Text style={styles.statusText}>{statusMessage}</Text>
              </View>
            ) : null}
            {paymentError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={20} color={Colors.dangerDark} />
                <Text style={styles.errorText}>{paymentError}</Text>
              </View>
            ) : null}
          </ScrollView>

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={isPayButtonDisabled}
            onPress={() => {
              Keyboard.dismiss();
              void handlePayment();
            }}
            style={[
              styles.payButton,
              isPayButtonDisabled && styles.payButtonDisabled,
            ]}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Ionicons
                name={paymentAlreadySucceeded ? 'checkmark' : selectedMode === 'cash' ? 'cash' : 'lock-closed'}
                size={20}
                color={Colors.white}
              />
            )}
            <Text style={styles.payButtonText}>
              {isBusy || hasPendingProviderPayment ? 'Vérification...' : actionLabel}
            </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.58)',
  },
  keyboardAvoidingView: {
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[300],
    marginBottom: Spacing.lg,
  },
  content: {
    paddingBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  arrivalIcon: {
    width: 54,
    height: 54,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  summaryIcon: {
    backgroundColor: Colors.success,
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: Colors.successDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.7,
  },
  title: {
    color: Colors.gray[900],
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    marginTop: 2,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[50],
  },
  destination: {
    flex: 1,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  amountCard: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#FFF5F0',
    borderWidth: 1,
    borderColor: '#FFD9CA',
  },
  amountLabel: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  amountValue: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.bold,
    marginTop: Spacing.xs,
  },
  amountHint: {
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  pointsRecommendation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#F2C94C',
    backgroundColor: '#FFF9DF',
  },
  pointsRecommendationIcon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFE9C8',
  },
  pointsRecommendationCopy: { flex: 1 },
  pointsRecommendationTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  pointsRecommendationText: {
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 17,
    marginTop: 2,
  },
  pointsRecommendationAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pointsRecommendationActionText: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  options: { gap: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#FFF8F5',
  },
  optionRecommended: {
    borderColor: '#F2C94C',
    backgroundColor: '#FFFCED',
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  optionIconSelected: { backgroundColor: '#FFEAE1' },
  optionCopy: { flex: 1 },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  optionTitle: {
    color: Colors.gray[800],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  optionTitleSelected: { color: Colors.primaryDark },
  recommendedBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  recommendedBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.4,
  },
  optionDescription: {
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 17,
    marginTop: 2,
  },
  pointsCard: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#FFFBEA',
    borderWidth: 1,
    borderColor: '#FCE7A3',
  },
  pointsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pointsLabel: { color: Colors.gray[600], fontSize: FontSizes.xs },
  pointsBalance: {
    color: Colors.gray[900],
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    marginTop: 2,
  },
  walletBadge: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  breakdownDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EAD997',
    marginVertical: Spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  breakdownLabel: { color: Colors.gray[600], fontSize: FontSizes.sm },
  breakdownValue: {
    color: Colors.gray[800],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    textAlign: 'right',
  },
  complementValue: { color: Colors.primaryDark },
  pointsHint: {
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 18,
    marginTop: Spacing.xs,
  },
  electronicCard: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
  },
  paymentFieldLabel: {
    color: Colors.gray[800],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.sm,
  },
  channelGrid: {
    gap: Spacing.sm,
  },
  channelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  channelOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#FFF8F5',
  },
  channelCopy: {
    flex: 1,
  },
  channelTitle: {
    color: Colors.gray[800],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  channelTitleSelected: {
    color: Colors.primaryDark,
  },
  channelDescription: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    lineHeight: 17,
    marginTop: 2,
  },
  phoneCard: {
    marginTop: Spacing.md,
  },
  phoneInputRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  phoneInputRowInvalid: {
    borderColor: Colors.danger,
    backgroundColor: '#FEF2F2',
  },
  phoneInput: {
    flex: 1,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    paddingVertical: 0,
  },
  phoneHint: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    lineHeight: 17,
    marginTop: Spacing.xs,
  },
  phoneHintInvalid: {
    color: Colors.dangerDark,
  },
  resumePaymentButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.primary + '08',
  },
  resumePaymentText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: '#EAF9F0',
  },
  successCopy: { flex: 1 },
  successTitle: { color: Colors.successDark, fontWeight: FontWeights.bold },
  successText: { color: Colors.gray[600], fontSize: FontSizes.xs, marginTop: 2 },
  summaryRows: {
    marginTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.gray[200],
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  summaryLabel: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  summaryValue: {
    flex: 1,
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    textAlign: 'right',
  },
  summaryActions: {
    gap: Spacing.sm,
  },
  invoiceButton: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    shadowOpacity: 0,
    elevation: 0,
  },
  invoiceButtonText: {
    color: Colors.primary,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: '#EAF4FC',
  },
  statusText: { flex: 1, color: Colors.infoDark, fontSize: FontSizes.sm, lineHeight: 19 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: '#FEF2F2',
  },
  errorText: { flex: 1, color: Colors.dangerDark, fontSize: FontSizes.sm, lineHeight: 19 },
  payButton: {
    minHeight: 56,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },
  payButtonDisabled: { opacity: 0.55 },
  payButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
});
