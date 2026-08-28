import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { bookingApi } from '@/store/api/bookingApi';
import { useGetMyTripsQuery } from '@/store/api/tripApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated, selectUser } from '@/store/selectors';
import type { Booking, Trip, TripPaymentMode } from '@/types';

const DRIVER_PAYMENT_NOTICE_REFRESH_MS = 15_000;
const DRIVER_PAYMENT_NOTICE_WINDOW_MS = 36 * 60 * 60 * 1_000;
const DRIVER_PAYMENT_NOTICE_STORAGE_PREFIX = 'zwanga:driver-payment-notices:';
const DRIVER_PAYMENT_NOTICE_MAX_TRIPS = 6;

type SeenDriverPaymentNotices = Record<string, string>;

type DriverPaymentNotice = {
  key: string;
  bookingId: string;
  tripId: string;
  passengerName: string;
  amount: number;
  currency: string;
  mode: TripPaymentMode;
  paidAt?: string | null;
};

function getStorageKey(userId: string) {
  return `${DRIVER_PAYMENT_NOTICE_STORAGE_PREFIX}${userId}`;
}

function normalizeAmount(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function formatMoney(value: number, currency?: string | null) {
  const normalizedCurrency = currency?.trim().toUpperCase() || 'CDF';
  const suffix = normalizedCurrency === 'CDF' ? 'FC' : normalizedCurrency;
  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 2,
  }).format(value)} ${suffix}`;
}

function getPaymentModeLabel(mode?: TripPaymentMode | null) {
  if (mode === 'points') return 'Jetons Zwanga';
  if (mode === 'electronic') return 'Paiement electronique';
  return 'Especes';
}

function hasPassengerArrived(booking: Booking) {
  return Boolean(
    booking.status === 'completed' ||
      booking.droppedOff ||
      booking.droppedOffConfirmedByPassenger ||
      booking.droppedOffAt,
  );
}

function isBookingPaymentConfirmed(booking: Booking) {
  if (booking.paymentStatus === 'succeeded') return true;
  return booking.paymentMode === 'cash' && booking.paymentStatus === 'not_required' && hasPassengerArrived(booking);
}

function isDriverUser(user: ReturnType<typeof selectUser>) {
  return Boolean(user?.isDriver || user?.role === 'driver' || user?.role === 'both');
}

function isTripEligibleForNotice(trip: Trip) {
  if (trip.status === 'ongoing' || trip.status === 'upcoming') return true;

  const timestamp = Date.parse(trip.completedAt ?? trip.departureTime);
  if (!Number.isFinite(timestamp)) return false;

  return Date.now() - timestamp <= DRIVER_PAYMENT_NOTICE_WINDOW_MS;
}

function buildPaymentNotice(booking: Booking, trip: Trip): DriverPaymentNotice | null {
  if (!isBookingPaymentConfirmed(booking)) return null;

  const amount = normalizeAmount(booking.paymentAmount) ?? trip.price * booking.numberOfSeats;
  return {
    key: `booking-payment:${booking.id}`,
    bookingId: booking.id,
    tripId: booking.tripId,
    passengerName: booking.passengerName?.trim() || 'Passager',
    amount,
    currency: booking.paymentCurrency ?? 'CDF',
    mode: booking.paymentMode ?? 'cash',
    paidAt: booking.paidAt ?? booking.updatedAt,
  };
}

export function DriverPaymentNoticeCoordinator() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectUser);
  const driverUser = isDriverUser(user);
  const [seenNotices, setSeenNotices] = useState<SeenDriverPaymentNotices>({});
  const [isSeenLoaded, setIsSeenLoaded] = useState(false);
  const [activeNotice, setActiveNotice] = useState<DriverPaymentNotice | null>(null);
  const [isClosingForTripNavigation, setIsClosingForTripNavigation] = useState(false);
  const seenNoticesRef = useRef<SeenDriverPaymentNotices>({});
  const pendingTripNavigationRef = useRef<string | null>(null);
  const scanInFlightRef = useRef(false);

  const { data: myTrips = [] } = useGetMyTripsQuery(undefined, {
    skip: !isAuthenticated || !driverUser,
    pollingInterval: DRIVER_PAYMENT_NOTICE_REFRESH_MS,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const relevantTrips = useMemo(
    () =>
      myTrips
        .filter(isTripEligibleForNotice)
        .sort((left, right) => Date.parse(right.departureTime) - Date.parse(left.departureTime))
        .slice(0, DRIVER_PAYMENT_NOTICE_MAX_TRIPS),
    [myTrips],
  );
  const relevantTripIdsKey = relevantTrips.map((trip) => trip.id).join('|');

  useEffect(() => {
    seenNoticesRef.current = seenNotices;
  }, [seenNotices]);

  useEffect(() => {
    let cancelled = false;
    setIsSeenLoaded(false);

    if (!isAuthenticated || !driverUser || !user?.id) {
      setSeenNotices({});
      setIsSeenLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    void AsyncStorage.getItem(getStorageKey(user.id))
      .then((rawValue) => {
        if (cancelled) return;
        if (!rawValue) {
          setSeenNotices({});
          return;
        }
        const parsed = JSON.parse(rawValue) as SeenDriverPaymentNotices;
        setSeenNotices(parsed && typeof parsed === 'object' ? parsed : {});
      })
      .catch((error) => {
        console.warn('[DriverPaymentNotice] Etat local illisible:', error);
        if (!cancelled) setSeenNotices({});
      })
      .finally(() => {
        if (!cancelled) setIsSeenLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [driverUser, isAuthenticated, user?.id]);

  const markNoticeSeen = useCallback(
    (notice: DriverPaymentNotice) => {
      if (!user?.id) return;

      setSeenNotices((current) => {
        const next = { ...current, [notice.key]: new Date().toISOString() };
        void AsyncStorage.setItem(getStorageKey(user.id), JSON.stringify(next));
        return next;
      });
    },
    [user?.id],
  );

  const closeNotice = useCallback(() => {
    if (activeNotice) markNoticeSeen(activeNotice);
    setActiveNotice(null);
  }, [activeNotice, markNoticeSeen]);

  const navigateToTrip = useCallback(
    (tripId: string) => {
      router.push(`/trip/manage/${tripId}` as any);
    },
    [router],
  );

  const handleModalDismiss = useCallback(() => {
    const tripId = pendingTripNavigationRef.current;
    if (!tripId) return;

    pendingTripNavigationRef.current = null;
    InteractionManager.runAfterInteractions(() => {
      navigateToTrip(tripId);
      setIsClosingForTripNavigation(false);
    });
  }, [navigateToTrip]);

  const openTrip = useCallback(() => {
    if (!activeNotice) return;
    markNoticeSeen(activeNotice);
    const tripId = activeNotice.tripId;

    if (Platform.OS === 'ios') {
      pendingTripNavigationRef.current = tripId;
      setIsClosingForTripNavigation(true);
    }

    setActiveNotice(null);

    if (Platform.OS !== 'ios') {
      navigateToTrip(tripId);
    }
  }, [activeNotice, markNoticeSeen, navigateToTrip]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !driverUser ||
      !isSeenLoaded ||
      !relevantTripIdsKey ||
      activeNotice ||
      isClosingForTripNavigation
    ) {
      return;
    }

    let cancelled = false;

    const scanPayments = async () => {
      if (scanInFlightRef.current || cancelled) return;
      scanInFlightRef.current = true;

      try {
        const tripById = new Map(relevantTrips.map((trip) => [trip.id, trip]));
        const tripIds = relevantTripIdsKey.split('|').filter(Boolean);
        const results = await Promise.allSettled(
          tripIds.map(async (tripId) => {
            const request = dispatch(
              bookingApi.endpoints.getTripBookings.initiate(tripId, {
                forceRefetch: true,
                subscribe: false,
              }),
            );

            try {
              return {
                tripId,
                bookings: await request.unwrap(),
              };
            } finally {
              request.unsubscribe();
            }
          }),
        );

        if (cancelled) return;

        for (const result of results) {
          if (result.status !== 'fulfilled') continue;
          const trip = tripById.get(result.value.tripId);
          if (!trip) continue;

          const notice = result.value.bookings
            .map((booking) => buildPaymentNotice(booking, trip))
            .find((candidate): candidate is DriverPaymentNotice =>
              Boolean(candidate && !seenNoticesRef.current[candidate.key]),
            );

          if (notice) {
            setActiveNotice(notice);
            return;
          }
        }
      } catch (error) {
        console.warn('[DriverPaymentNotice] Verification impossible:', error);
      } finally {
        scanInFlightRef.current = false;
      }
    };

    void scanPayments();
    const interval = setInterval(() => void scanPayments(), DRIVER_PAYMENT_NOTICE_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    activeNotice,
    dispatch,
    driverUser,
    isAuthenticated,
    isClosingForTripNavigation,
    isSeenLoaded,
    relevantTripIdsKey,
    relevantTrips,
  ]);

  const shouldKeepModalMounted = Boolean(activeNotice || isClosingForTripNavigation);
  const isModalVisible = Boolean(activeNotice && !isClosingForTripNavigation);

  if (!shouldKeepModalMounted) return null;

  return (
    <Modal
      visible={isModalVisible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onDismiss={handleModalDismiss}
      onRequestClose={closeNotice}
    >
      <View style={styles.overlay}>
        {activeNotice ? (
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}>
            <View style={styles.icon}>
              <Ionicons name="cash-outline" size={28} color={Colors.white} />
            </View>
            <Text style={styles.title}>Paiement passager confirme</Text>
            <Text style={styles.message}>
              {activeNotice.passengerName} a confirme le paiement du trajet.
            </Text>

            <ScrollView bounces={false} style={styles.details} contentContainerStyle={styles.detailsContent}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Montant</Text>
                <Text style={styles.detailValue}>{formatMoney(activeNotice.amount, activeNotice.currency)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Moyen</Text>
                <Text style={styles.detailValue}>{getPaymentModeLabel(activeNotice.mode)}</Text>
              </View>
            </ScrollView>

            <TouchableOpacity activeOpacity={0.88} onPress={openTrip} style={styles.primaryButton}>
              <Ionicons name="navigate-outline" size={18} color={Colors.white} />
              <Text style={styles.primaryButtonText}>Voir le trajet</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.88} onPress={closeNotice} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Compris</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: 'rgba(17, 24, 39, 0.58)',
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    padding: Spacing.xl,
    borderRadius: BorderRadius.xxl,
    backgroundColor: Colors.white,
  },
  icon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.success,
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.gray[900],
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  message: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  details: {
    width: '100%',
    maxHeight: 140,
    marginTop: Spacing.lg,
  },
  detailsContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.gray[200],
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  detailLabel: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  detailValue: {
    flex: 1,
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    textAlign: 'right',
  },
  primaryButton: {
    width: '100%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    marginTop: Spacing.lg,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  secondaryButton: {
    width: '100%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.gray[100],
    marginTop: Spacing.sm,
  },
  secondaryButtonText: {
    color: Colors.gray[700],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
  },
});
