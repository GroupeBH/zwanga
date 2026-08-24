import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import {
  useGetMyWalletQuery,
  useInitiateWalletTopUpMutation,
  useLazyCheckWalletTopUpStatusQuery,
} from '@/store/api/walletApi';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated, selectUser } from '@/store/selectors';
import type { Booking, TripPaymentMode } from '@/types';
import { openExternalUrlSafely } from '@/utils/safeExternalUrl';

const ARRIVAL_PAYMENT_REFRESH_MS = 5_000;
const RECENT_ARRIVAL_WINDOW_MS = 24 * 60 * 60 * 1_000;
const PAYMENT_STATE_STORAGE_PREFIX = 'zwanga:passenger-arrival-payment:';
const DRC_PAYMENT_PHONE_REGEX = /^\+243\d{9}$/;

type StoredBookingPaymentState = {
  requiredActionAt?: string;
  acknowledgedAt?: string;
  bookingPaymentOrderNumber?: string;
  walletTopUpOrderNumber?: string;
};

type StoredPaymentState = Record<string, StoredBookingPaymentState>;

type PaymentOption = {
  id: TripPaymentMode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
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
    description: 'Utilisez vos jetons et completez si necessaire',
  },
  {
    id: 'cash',
    icon: 'cash-outline',
    title: 'Especes',
    description: 'Remettez le montant au conducteur',
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

function getStorageKey(userId: string) {
  return `${PAYMENT_STATE_STORAGE_PREFIX}${userId}`;
}

export function PassengerArrivalPaymentCoordinator() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectUser);
  const [storedState, setStoredState] = useState<StoredPaymentState>({});
  const [isStoredStateLoaded, setIsStoredStateLoaded] = useState(false);
  const [selectedMode, setSelectedMode] = useState<TripPaymentMode>('cash');
  const [statusMessage, setStatusMessage] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const activeBookingIdRef = useRef<string | null>(null);
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

  const persistBookingState = useCallback(
    (bookingId: string, patch: Partial<Record<keyof StoredBookingPaymentState, string | null>>) => {
      if (!user?.id) return;

      setStoredState((current) => {
        const nextBookingState = { ...(current[bookingId] ?? {}) };
        Object.entries(patch).forEach(([key, value]) => {
          const typedKey = key as keyof StoredBookingPaymentState;
          if (value) {
            nextBookingState[typedKey] = value;
          } else {
            delete nextBookingState[typedKey];
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
        walletTopUpOrderNumber: null,
      });
    },
    [persistBookingState],
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
        acknowledgeBooking(bookingId);
        return true;
      }

      setStatusMessage('Les jetons sont en cours de verification. Le modal restera ouvert.');
      return false;
    },
    [acknowledgeBooking, refetchBookings, refetchWallet, updatePaymentMode],
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
        console.warn('[PassengerArrivalPayment] Etat local illisible:', error);
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
    setSelectedMode(arrivalBooking?.paymentMode ?? 'cash');
    setStatusMessage('');
    setPaymentError('');
  }, [arrivalBooking?.id, arrivalBooking?.paymentMode]);

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
            setStatusMessage('Recharge confirmee. Paiement de la course en cours...');
            await refetchWallet();
            await settleWithPoints(bookingId);
            return;
          }

          if (response.payment.status === 'failed' || response.payment.status === 'cancelled') {
            persistBookingState(bookingId, { walletTopUpOrderNumber: null });
            setPaymentError(response.payment.message ?? 'La recharge des jetons a echoue.');
            return;
          }

          setStatusMessage(
            response.payment.message ?? 'Confirmez le complement Mobile Money sur votre telephone.',
          );
          return;
        }

        if (bookingPaymentOrderNumber) {
          const response = await checkBookingPaymentStatus(bookingPaymentOrderNumber).unwrap();
          if (cancelled) return;

          if (response.payment.status === 'succeeded') {
            acknowledgeBooking(bookingId);
            await refetchBookings();
            return;
          }

          if (response.payment.status === 'failed' || response.payment.status === 'cancelled') {
            persistBookingState(bookingId, { bookingPaymentOrderNumber: null });
            setPaymentError(response.payment.message ?? 'Le paiement Mobile Money a echoue.');
            return;
          }

          setStatusMessage(
            response.payment.message ?? 'Confirmez le paiement Mobile Money sur votre telephone.',
          );
        }
      } catch (error) {
        console.warn('[PassengerArrivalPayment] Verification du paiement impossible:', error);
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
    acknowledgeBooking,
    activeStoredState?.bookingPaymentOrderNumber,
    activeStoredState?.walletTopUpOrderNumber,
    arrivalBooking?.id,
    checkBookingPaymentStatus,
    checkWalletTopUpStatus,
    persistBookingState,
    refetchBookings,
    refetchWallet,
    settleWithPoints,
  ]);

  const handlePayment = useCallback(async () => {
    if (!arrivalBooking || paymentAmount === null || isBusy || hasPendingProviderPayment) return;

    setPaymentError('');
    setStatusMessage('');

    if (paymentAlreadySucceeded) {
      acknowledgeBooking(arrivalBooking.id);
      return;
    }

    try {
      if (selectedMode === 'cash') {
        await updatePaymentMode({
          bookingId: arrivalBooking.id,
          paymentMode: 'cash',
        }).unwrap();
        await refetchBookings();
        acknowledgeBooking(arrivalBooking.id);
        return;
      }

      if (selectedMode === 'points') {
        if (requiredPoints === null || isWalletFetching) return;

        if (missingPoints <= 0) {
          await settleWithPoints(arrivalBooking.id);
          return;
        }

        const phone = formatPaymentPhone(user?.phone);
        if (!phone || !DRC_PAYMENT_PHONE_REGEX.test(phone)) {
          setPaymentError(
            'Un numero congolais valide est necessaire dans votre profil pour payer le complement.',
          );
          return;
        }

        setStatusMessage(
          `Recharge de ${formatPoints(missingPoints)} pour completer le paiement...`,
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
            `Confirmez le complement de ${formatMoney(moneyComplement, paymentCurrency)} sur votre telephone.`,
        );
        return;
      }

      if (!ELECTRONIC_PAYMENTS_ENABLED) return;
      const phone = formatPaymentPhone(user?.phone);
      if (!phone || !DRC_PAYMENT_PHONE_REGEX.test(phone)) {
        setPaymentError(
          'Un numero congolais valide est necessaire dans votre profil pour Mobile Money.',
        );
        return;
      }
      if (arrivalBooking.paymentMode !== 'electronic') {
        await updatePaymentMode({
          bookingId: arrivalBooking.id,
          paymentMode: 'electronic',
        }).unwrap();
      }

      const response = await initiateBookingPayment({
        bookingId: arrivalBooking.id,
        method: 'mobile_money',
        phone,
      }).unwrap();

      if (response.payment.status !== 'succeeded' && response.payment.orderNumber) {
        persistBookingState(arrivalBooking.id, {
          bookingPaymentOrderNumber: response.payment.orderNumber,
        });
      }
      if (response.payment.paymentUrl) {
        await openExternalUrlSafely(response.payment.paymentUrl, {
          logLabel: 'PassengerArrivalPayment',
        });
      }

      if (response.payment.status === 'succeeded') {
        acknowledgeBooking(arrivalBooking.id);
        await refetchBookings();
        return;
      }

      setStatusMessage(
        response.payment.message ?? 'Confirmez le paiement Mobile Money sur votre telephone.',
      );
    } catch (error: any) {
      const message = error?.data?.message ?? error?.error ?? 'Le paiement n a pas pu etre effectue.';
      setPaymentError(Array.isArray(message) ? message.join('\n') : String(message));
    }
  }, [
    acknowledgeBooking,
    arrivalBooking,
    initiateBookingPayment,
    initiateWalletTopUp,
    hasPendingProviderPayment,
    isBusy,
    isWalletFetching,
    missingPoints,
    moneyComplement,
    paymentAlreadySucceeded,
    paymentAmount,
    paymentCurrency,
    persistBookingState,
    refetchBookings,
    refetchWallet,
    requiredPoints,
    selectedMode,
    settleWithPoints,
    updatePaymentMode,
    user?.phone,
  ]);

  if (!arrivalBooking) return null;

  const destination =
    arrivalBooking.passengerDestination ??
    arrivalBooking.trip?.arrival?.address ??
    arrivalBooking.trip?.arrival?.name ??
    'Votre destination';
  const actionLabel = paymentAlreadySucceeded
    ? 'Terminer'
    : selectedMode === 'cash'
      ? 'Confirmer le paiement en espèces'
      : selectedMode === 'points'
        ? missingPoints > 0
          ? `Ajouter ${formatMoney(moneyComplement, paymentCurrency)} et payer`
          : `Payer avec ${formatPoints(requiredPoints ?? 0)}`
        : `Payer ${formatMoney(paymentAmount ?? 0, paymentCurrency)}`;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.md }]}>
          <View style={styles.handle} />
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
                <Text style={styles.eyebrow}>ARRIVEE CONFIRMEE</Text>
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
                Choisissez comment regler ce trajet. Cette fenetre restera ouverte jusqu a votre action.
              </Text>
            </View>

            {paymentAlreadySucceeded ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={22} color={Colors.successDark} />
                <View style={styles.successCopy}>
                  <Text style={styles.successTitle}>Paiement deja confirme</Text>
                  <Text style={styles.successText}>Vous pouvez terminer ce recapitulatif.</Text>
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
                        Utilisez-les et ne payez que le complement restant.
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
                              ? `${pointsCoveragePercentage} % du montant deja couvert`
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
                  <Text style={styles.breakdownLabel}>Complement Mobile Money</Text>
                  <Text style={[styles.breakdownValue, moneyComplement > 0 && styles.complementValue]}>
                    {formatMoney(moneyComplement, paymentCurrency)}
                  </Text>
                </View>
                {moneyComplement > 0 && (
                  <Text style={styles.pointsHint}>
                    Seul le complement achetera les jetons manquants. Vos jetons actuels seront ensuite ajoutes pour regler la totalite du trajet.
                  </Text>
                )}
              </View>
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
            disabled={
              isBusy ||
              hasPendingProviderPayment ||
              paymentAmount === null ||
              (selectedMode === 'points' && isWalletFetching)
            }
            onPress={() => void handlePayment()}
            style={[
              styles.payButton,
              (isBusy ||
                hasPendingProviderPayment ||
                paymentAmount === null ||
                (selectedMode === 'points' && isWalletFetching)) &&
                styles.payButtonDisabled,
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
              {isBusy || hasPendingProviderPayment ? 'Verification...' : actionLabel}
            </Text>
          </TouchableOpacity>
        </View>
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
