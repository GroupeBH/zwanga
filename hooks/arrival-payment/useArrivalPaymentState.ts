import {
  normalizeAmount,
  roundMoney,
  formatPaymentPhone,
  hasPassengerArrived,
  getArrivalTimestamp,
  isFinanciallyPending,
  getStorageKey,
} from '../../features/arrival-payment/paymentModel';
import {
  PaymentChannel,
  StoredBookingPaymentState,
  StoredPaymentState,
  PaymentCompletionSummary,
} from '../../features/arrival-payment/paymentTypes';
import { ARRIVAL_BOOKING_REFRESH_MS, RECENT_ARRIVAL_WINDOW_MS } from '../../features/arrival-payment/paymentPolicy';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { getPassengerInterruptionChoice } from '@/features/trip/interruptionChoice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ZWANGA_POINT_VALUE_CDF } from '@/constants/paymentFeatures';
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
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated, selectUser } from '@/store/selectors';
import type { TripPaymentMode } from '@/types';



export function useArrivalPaymentState() {
  const dispatch = useAppDispatch();
  const requestedInterruption = useAppSelector((state) => state.trips.interruptionChoice);
  const isAppActive = useAppIsActive();
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
  const [resolvedInterruption, setResolvedInterruption] = useState<string | null>(null);
  const activeBookingIdRef = useRef<string | null>(null);
  const pendingInvoicePaymentIdRef = useRef<string | null | undefined>(undefined);
  const paymentCheckInFlightRef = useRef(false);

  const {
    data: bookings = [],
    refetch: refetchBookings,
  } = useGetMyBookingsQuery(undefined, {
    skip: !isAuthenticated,
    pollingInterval: isAppActive ? ARRIVAL_BOOKING_REFRESH_MS : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
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

  const interruptionChoice = useMemo(() => {
    if (!isAuthenticated || !isAppActive) return null;
    if (requestedInterruption) {
      const requestedBooking = bookings.find((booking) => booking.id === requestedInterruption.bookingId);
      const requested = requestedBooking && getPassengerInterruptionChoice(requestedBooking, user?.id, true);
      if (requested?.requestId === requestedInterruption.requestId) return requested;
    }
    for (const booking of bookings) {
      const choice = getPassengerInterruptionChoice(booking, user?.id);
      if (choice && `${choice.requestId}:${choice.bookingId}` !== resolvedInterruption) return choice;
    }
    return null;
  }, [bookings, isAppActive, isAuthenticated, requestedInterruption, resolvedInterruption, user?.id]);

  const {
    data: wallet,
    isFetching: isWalletFetching,
    refetch: refetchWallet,
  } = useGetMyWalletQuery(undefined, {
    skip: !isAuthenticated || !arrivalBooking,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const {
    data: paymentHistory = [],
    refetch: refetchPaymentHistory,
  } = useGetPaymentHistoryQuery(undefined, {
    skip: !isAuthenticated || !arrivalBooking,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
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

  return {
    refetchBookings,
    refetchWallet,
    refetchPaymentHistory,
    bookings,
    wallet,
    paymentHistory,
    setCompletionSummary,
    persistBookingState,
    setPaymentError,
    setStatusMessage,
    checkBookingPaymentStatus,
    updatePaymentMode,
    setIsStoredStateLoaded,
    isAuthenticated,
    user,
    setStoredState,
    arrivalBooking,
    activeBookingIdRef,
    storedState,
    setSelectedMode,
    setSelectedChannel,
    setPaymentPhone,
    activeStoredState,
    isAppActive,
    paymentCheckInFlightRef,
    setIsCheckingPayment,
    checkWalletTopUpStatus,
    paymentAmount,
    isBusy,
    hasPendingProviderPayment,
    paymentAlreadySucceeded,
    selectedMode,
    selectedChannel,
    requiredPoints,
    isWalletFetching,
    missingPoints,
    mobileMoneyPhone,
    initiateWalletTopUp,
    moneyComplement,
    paymentCurrency,
    initiateBookingPayment,
    completionSummary,
    acknowledgeBooking,
    router,
    pendingInvoicePaymentIdRef,
    setIsClosingForInvoice,
    interruptionChoice,
    isClosingForInvoice,
    insets,
    setResolvedInterruption,
    dispatch,
    arePointsRecommended,
    pointsCoveragePercentage,
    walletBalance,
    pointsUsed,
    amountCoveredByPoints,
    paymentPhone,
    hasCardPaymentToResume,
    statusMessage,
    paymentError,
  };
}
