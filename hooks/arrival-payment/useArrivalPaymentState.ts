import {
  normalizeAmount,
  roundMoney,
  formatPaymentPhone,
  hasPassengerArrived,
  selectArrivedPaymentBooking,
} from '../../features/arrival-payment/paymentModel';
import { PaymentChannel, PaymentCompletionSummary } from '../../features/arrival-payment/paymentTypes';
import { sharedBookingsOptions as sharedActivityQueryOptions } from '@/features/activity/activityQueryOptions';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useNearArrivalPayment } from './useNearArrivalPayment';
import { selectDeclaredArrivalBooking } from '@/features/arrival-payment/declaredArrivalPayment';
import type { RideOutboxEntry } from '@/features/ride-recovery/rideRecoveryModel';
import { getPassengerInterruptionChoice } from '@/features/trip/interruptionChoice';
import { usePaymentPersistence } from './usePaymentPersistence';
import { useBookingPaymentMode } from './useBookingPaymentMode';
import { useArrivalPaymentRefresh } from './useArrivalPaymentRefresh';
import { selectPaymentBooking } from '@/features/arrival-payment/selectPaymentBooking';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ZWANGA_POINT_VALUE_CDF } from '@/constants/paymentFeatures';
import {
  useGetMyActivityBookingsQuery as useGetMyBookingsQuery,
  useInitiateBookingPaymentMutation,
  useLazyCheckBookingPaymentStatusQuery,
  useUpdateBookingPaymentModeMutation,
} from '@/store/api/bookingApi';
import { useGetBookingPaymentHistoryQuery } from '@/store/api/paymentApi';
import {
  useGetMyWalletQuery,
  useInitiateWalletTopUpMutation,
  useLazyCheckWalletTopUpStatusQuery,
} from '@/store/api/walletApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated, selectUser } from '@/store/selectors';
import type { Booking } from '@/types';
const EMPTY_BOOKINGS: Booking[] = [];
const EMPTY_DECLARATIONS: RideOutboxEntry[] = [];



export function useArrivalPaymentState() {
  const dispatch = useAppDispatch();
  const requestedInterruption = useAppSelector((state) => state.trips.interruptionChoice);
  const isAppActive = useAppIsActive();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectUser);
  const declarations = useAppSelector(state => state.rideRecovery.userId === user?.id
    ? state.rideRecovery.entries : EMPTY_DECLARATIONS);
  const { storedState, isStoredStateLoaded, persistBookingState, isSessionCurrent } = usePaymentPersistence(user?.id, isAuthenticated);
  const [deferredBookingId, setDeferredBookingId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<PaymentChannel>('mpesa');
  const [paymentPhone, setPaymentPhone] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<PaymentCompletionSummary | null>(null);
  const [isClosingForInvoice, setIsClosingForInvoice] = useState(false);
  const [resolvedInterruption, setResolvedInterruption] = useState<string | null>(null);
  const activeBookingIdRef = useRef<string | null>(null);
  const submissionBookingIdRef = useRef<string | null>(null);
  const pendingInvoicePaymentIdRef = useRef<string | null | undefined>(undefined);

  const [updatePaymentMode, { isLoading: isUpdatingPaymentMode }] = useUpdateBookingPaymentModeMutation();
  const [initiateBookingPayment, { isLoading: isInitiatingBookingPayment }] = useInitiateBookingPaymentMutation();
  const [checkBookingPaymentStatus] = useLazyCheckBookingPaymentStatusQuery();
  const [initiateWalletTopUp, { isLoading: isInitiatingWalletTopUp }] = useInitiateWalletTopUpMutation();
  const [checkWalletTopUpStatus] = useLazyCheckWalletTopUpStatusQuery();
  const isBusy = isUpdatingPaymentMode || isInitiatingBookingPayment || isInitiatingWalletTopUp || isCheckingPayment;

  const {
    data: activityBookings = EMPTY_BOOKINGS,
    refetch: refetchBookings,
  } = useGetMyBookingsQuery(undefined, {
    ...sharedActivityQueryOptions,
    skip: !isAuthenticated,
  });
  const bookings = useMemo(() => activityBookings.filter(booking => booking.passengerId === user?.id), [activityBookings, user?.id]);

  const isResumeReady = useArrivalPaymentRefresh(isAuthenticated && isAppActive, refetchBookings);
  const earlyBooking = useNearArrivalPayment(bookings, user?.id, isAuthenticated && isResumeReady && isStoredStateLoaded, storedState);
  const arrivedBooking = useMemo(() => {
    if (!isAuthenticated || !isStoredStateLoaded) return null;
    // A successful server refresh must not swap this form for an older cash booking.
    const pinned = bookings.find(booking => booking.id === activeBookingIdRef.current);
    const pinnedArrival = pinned && selectArrivedPaymentBooking([pinned], storedState);
    if (pinnedArrival) return pinnedArrival;
    return selectArrivedPaymentBooking(bookings, storedState);
  }, [bookings, isAuthenticated, isStoredStateLoaded, storedState]);
  const declaredBooking = useMemo(() => isAuthenticated && isStoredStateLoaded
    ? selectDeclaredArrivalBooking(bookings, declarations, user?.id, storedState) : null,
  [bookings, declarations, isAuthenticated, isStoredStateLoaded, storedState, user?.id]);
  // Do not replace an in-flight payment with another booking. Otherwise prefer the
  // reservation the passenger has just confirmed over an older payment reminder.
  const arrivalBooking = selectPaymentBooking({ bookings, arrived: arrivedBooking, declared: declaredBooking,
    early: earlyBooking, pinnedId: submissionBookingIdRef.current ?? activeBookingIdRef.current,
    deferredId: deferredBookingId, stored: storedState,
    busy: isBusy || Boolean(completionSummary) || Boolean(submissionBookingIdRef.current) });
  // Wait only for authoritative server arrival, not a second (driver) declaration.
  // A durable offline tap may open the sheet, but must not enable payment on its own.
  const waitingForArrivalConfirmation = Boolean(declaredBooking && arrivalBooking?.id === declaredBooking.id && !hasPassengerArrived(declaredBooking));
  const isBeforeArrival = Boolean(arrivalBooking && !waitingForArrivalConfirmation && !hasPassengerArrived(arrivalBooking));

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
    skip: !isAuthenticated || !arrivalBooking || waitingForArrivalConfirmation,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const {
    data: paymentHistory = [],
    refetch: refetchPaymentHistory,
  } = useGetBookingPaymentHistoryQuery({
    bookingId: arrivalBooking?.id ?? '',
    reference: arrivalBooking?.paymentReference,
    tripId: arrivalBooking?.tripId,
    transactionId: arrivalBooking?.paymentTransactionId,
  }, {
    skip: !isAuthenticated || !arrivalBooking || waitingForArrivalConfirmation,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });

  const paymentAmount = waitingForArrivalConfirmation ? null : normalizeAmount(arrivalBooking?.paymentAmount);
  const paymentCurrency = arrivalBooking?.paymentCurrency ?? 'CDF';
  const walletBalance = Math.max(0, (normalizeAmount(wallet?.account.balance) ?? 0) - (normalizeAmount(wallet?.account.reservedCashCommissionBalance) ?? 0));
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
  const paymentAlreadySucceeded = !waitingForArrivalConfirmation && (
    arrivalBooking?.paymentStatus === 'succeeded' || paymentAmount === 0 ||
    (arrivalBooking?.paymentMode === 'cash' && Boolean(arrivalBooking.cashReceivedAt)));
  const activeStoredState = arrivalBooking ? storedState[arrivalBooking.id] : undefined;
  const { selectedMode, setSelectedMode, reportPaymentFailure, canChangeFailedPaymentMode } =
    useBookingPaymentMode(arrivalBooking, activeStoredState, isBusy);
  const hasPendingProviderPayment = Boolean(
    activeStoredState?.bookingPaymentOrderNumber || activeStoredState?.walletTopUpOrderNumber,
  );
  const hasCardPaymentToResume = Boolean(
    activeStoredState?.bookingPaymentOrderNumber &&
      activeStoredState.bookingPaymentMethod === 'card' &&
      activeStoredState.bookingPaymentUrl,
  );
  const mobileMoneyPhone = formatPaymentPhone(paymentPhone || user?.phone);

  const acknowledgeBooking = useCallback(
    (bookingId: string) => {
      const acknowledgedAt = new Date().toISOString();
      persistBookingState(bookingId, {
        acknowledgedAt,
        bookingPaymentOrderNumber: null,
        bookingPaymentUrl: null,
        walletTopUpOrderNumber: null,
      });
      // Do not chain unrelated historical confirmations after closing this one.
      const next = selectArrivedPaymentBooking(bookings, {
        ...storedState, [bookingId]: { ...storedState[bookingId], acknowledgedAt },
      });
      setDeferredBookingId(next?.id ?? null);
    },
    [bookings, persistBookingState, storedState],
  );
  const deferEarlyPayment = useCallback(() => {
    if (!arrivalBooking || !isBeforeArrival || isBusy || hasPendingProviderPayment) return;
    persistBookingState(arrivalBooking.id, { preArrivalDismissedAt: new Date().toISOString() });
  }, [arrivalBooking, hasPendingProviderPayment, isBeforeArrival, isBusy, persistBookingState]);
  const presentedBookingId = completionSummary?.bookingId ?? arrivalBooking?.id;

  return {
    isResumeReady,
    isSessionCurrent,
    isPaymentDeferred: Boolean(presentedBookingId && presentedBookingId === deferredBookingId),
    deferPayment: () => { if (presentedBookingId) setDeferredBookingId(presentedBookingId); },
    resumePayment: () => setDeferredBookingId(null),
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
    isAuthenticated,
    user,
    arrivalBooking,
    waitingForArrivalConfirmation,
    isBeforeArrival,
    deferEarlyPayment,
    activeBookingIdRef,
    submissionBookingIdRef,
    storedState,
    setSelectedMode,
    reportPaymentFailure,
    canChangeFailedPaymentMode,
    setSelectedChannel,
    setPaymentPhone,
    activeStoredState,
    isAppActive,
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
