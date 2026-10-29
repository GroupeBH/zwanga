import {
  SeenDriverPaymentNotices,
  DriverPaymentNotice,
  getStorageKey,
  formatMoney,
  getPaymentModeLabel,
  isDriverUser,
  isTripEligibleForNotice,
} from '../features/driver-payments/paymentNoticeModel';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { RideModal as Modal } from '@/features/navigation/RideModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useGetMyActivityTripsQuery as useGetMyTripsQuery } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated, selectUser } from '@/store/selectors';
import { sharedTripsOptions as sharedActivityQueryOptions } from '@/features/activity/activityQueryOptions';
import { usePaymentAnnouncement } from '@/hooks/notifications/usePaymentAnnouncement';
import { driverPaymentAnnouncement } from '@/features/arrival-payment/paymentAnnouncement';
import { useDriverPaymentInbox } from '@/hooks/notifications/useDriverPaymentInbox';
import { boundedSeenPaymentNotices } from '@/features/driver-payments/paymentInbox';

const EMPTY_SEEN = {};

export function DriverPaymentNoticeCoordinator() {
  const isAppActive = useAppIsActive();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectUser);
  const driverUser = isDriverUser(user);
  const [seenNotices, setSeenNotices] = useState<SeenDriverPaymentNotices>({});
  const [isSeenLoaded, setIsSeenLoaded] = useState(false);
  const [seenOwner, setSeenOwner] = useState<string>();
  const [activeNotice, setActiveNotice] = useState<DriverPaymentNotice | null>(null);
  const [noticeOwner, setNoticeOwner] = useState<string>();
  const [isClosingForTripNavigation, setIsClosingForTripNavigation] = useState(false);
  const pendingTripNavigationRef = useRef<string | null>(null);
  const storageWrite = useRef(Promise.resolve());
  const inbox = useDriverPaymentInbox(user?.id, isAuthenticated && driverUser,
    seenOwner === user?.id ? seenNotices : EMPTY_SEEN);

  const { data: myTrips = [] } = useGetMyTripsQuery(undefined, {
    ...sharedActivityQueryOptions,
    skip: !isAuthenticated || !driverUser || !inbox.legacy,
  });

  const relevantTrips = useMemo(
    () =>
      myTrips
        .filter(trip => trip.driverId === user?.id && isTripEligibleForNotice(trip))
        .sort((left, right) => Date.parse(right.departureTime) - Date.parse(left.departureTime)),
    [myTrips, user?.id],
  );

  useEffect(() => {
    let cancelled = false;
    setIsSeenLoaded(false);
    setSeenOwner(undefined);
    setActiveNotice(null);
    setNoticeOwner(undefined);
    pendingTripNavigationRef.current = null;
    setIsClosingForTripNavigation(false);

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
        setSeenNotices(boundedSeenPaymentNotices(JSON.parse(rawValue)));
      })
      .catch(() => {
        console.warn('[DriverPaymentNotice] Etat local illisible.');
        if (!cancelled) setSeenNotices({});
      })
      .finally(() => {
        if (!cancelled) { setSeenOwner(user.id); setIsSeenLoaded(true); }
      });

    return () => {
      cancelled = true;
    };
  }, [driverUser, isAuthenticated, user?.id]);

  const markNoticeSeen = useCallback(
    (notice: DriverPaymentNotice) => {
      if (!user?.id) return;

      setSeenNotices((current) => {
        const next = boundedSeenPaymentNotices({ ...current, [notice.key]: new Date().toISOString() });
        storageWrite.current = storageWrite.current.then(() => AsyncStorage.setItem(getStorageKey(user.id), JSON.stringify(next)))
          .catch(() => { console.warn('[DriverPaymentNotice] Sauvegarde locale différée.'); });
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
    // The in-app panel is already removed: no UIKit or interaction queue to await.
    try { navigateToTrip(tripId); }
    finally { setIsClosingForTripNavigation(false); }
  }, [navigateToTrip]);

  const openTrip = useCallback(() => {
    if (!activeNotice) return;
    markNoticeSeen(activeNotice);
    const tripId = activeNotice.tripId;

    pendingTripNavigationRef.current = tripId;
    setIsClosingForTripNavigation(true);

    setActiveNotice(null);

  }, [activeNotice, markNoticeSeen]);

  const candidates = useMemo(() => inbox.legacy ? relevantTrips.flatMap(trip => trip.paymentNotices)
    .filter(candidate => candidate.mode !== 'cash') : inbox.notices, [inbox.legacy, inbox.notices, relevantTrips]);
  useEffect(() => {
    if (
      !isAuthenticated ||
      !driverUser ||
      !isSeenLoaded ||
      seenOwner !== user?.id ||
      !isAppActive ||
      activeNotice ||
      isClosingForTripNavigation
    ) {
      return;
    }

    const notice = candidates.find(candidate => !seenNotices[candidate.key]);
    if (notice) { setNoticeOwner(user?.id); setActiveNotice(notice); }
  }, [
    activeNotice,
    driverUser,
    isAuthenticated,
    isClosingForTripNavigation,
    isSeenLoaded,
    seenNotices,
    candidates,
    seenOwner,
    isAppActive,
    user?.id,
  ]);

  const noticeStillRelevant = candidates.some(notice => notice.key === activeNotice?.key);
  useEffect(() => { if (activeNotice && !noticeStillRelevant) setActiveNotice(null); }, [activeNotice, noticeStillRelevant]);
  const isModalVisible = Boolean(isAuthenticated && noticeOwner === user?.id && seenOwner === user?.id && driverUser && isSeenLoaded && isAppActive && noticeStillRelevant && activeNotice && !isClosingForTripNavigation);
  usePaymentAnnouncement(driverPaymentAnnouncement(activeNotice, activeNotice?.cashReceived), isModalVisible);

  return (
    <Modal
      inApp
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
            <Text style={styles.title}>{activeNotice.partial ? 'Paiement partiel reçu' : 'Paiement reçu'}</Text>
            <Text style={styles.message}>
              {activeNotice.cashReceived ? 'Votre encaissement en espèces est confirmé.' : 'Le paiement du passager est confirmé.'}
            </Text>
            {activeNotice.partial && <Text style={styles.message}>
              Il reste {formatMoney(activeNotice.cashRemainder ?? 0, activeNotice.currency)} à recevoir en espèces.
            </Text>}

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
