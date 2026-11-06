import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useScreenAnnouncement } from '@/hooks/notifications/usePaymentAnnouncement';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { baseApi } from '@/store/api/baseApi';
import { selectIsAuthenticated, selectUser } from '@/store/selectors';
import { RideModal } from '@/features/navigation/RideModal';
import { useRideOverlay } from '@/features/navigation/RideOverlayProvider';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import type { RideAlert } from '@/features/notifications/rideAlert';
import { passengerResponseNotice } from '@/features/notifications/passengerResponseNotice';
import { isCounterOfferAlert, isDriverOfferAcceptanceAlert } from '@/features/notifications/rideSound';
import { useGetTripRequestByIdQuery } from '@/store/api/tripRequestApi';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { acknowledgeRideAlerts, dismissRideResponseNotice, getRideAlertsRevision,
  pendingRideResponseNotices, subscribeRideAlerts } from '@/services/rideAlertSession';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getNotificationHref } from '@/utils/notificationNavigation';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { ACTION_COLORS } from '@/constants/actionColors';

/** Normal replies are informational; a new price explicitly asks for a ringing decision. */
export function PassengerRideResponseCoordinator() {
  const active = useAppIsActive();
  const authenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectUser);
  const router = useRouter();
  const dispatch = useAppDispatch();
  useSyncExternalStore(subscribeRideAlerts, getRideAlertsRevision, getRideAlertsRevision);
  const notice = user?.id ? pendingRideResponseNotices(user.id)[0] : undefined;
  const counterOffer = !!notice && isCounterOfferAlert(notice.data);
  const driverAcceptance = !!notice && isDriverOfferAcceptanceAlert(notice.data);
  // A pre-alert cache cannot prove that the newly announced price disappeared.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const observedAt = useMemo(() => Date.now(), [notice?.key]);
  const readsEnabled = useDisplayReadsEnabled(active && authenticated && (counterOffer || driverAcceptance));
  const requestId = counterOffer || driverAcceptance ? notice!.id : undefined;
  const request = useGetTripRequestByIdQuery(requestId ?? '', displayReadOptions(readsEnabled, counterOffer ? 15000 : 0));
  useEffect(() => {
    if (readsEnabled && requestId) dispatch(baseApi.util.invalidateTags([{ type: 'TripRequest', id: requestId }]));
  }, [dispatch, readsEnabled, requestId, observedAt]);
  useEffect(() => {
    if (!active || !(counterOffer || driverAcceptance) || !notice) return;
    const until = Date.parse(String(notice.data.alertExpiresAt ?? notice.expiresAt ?? ''));
    if (!Number.isFinite(until)) return;
    const timeout = setTimeout(() => dismissRideResponseNotice(notice), Math.max(0, Math.min(until - Date.now(), 120000)));
    return () => clearTimeout(timeout);
  }, [active, counterOffer, driverAcceptance, notice]);
  useEffect(() => {
    if (!(counterOffer || driverAcceptance) || !notice || !request.currentData || request.isFetching || request.isError ||
        request.startedTimeStamp === undefined || request.startedTimeStamp < observedAt) return;
    const current = request.currentData;
    if (driverAcceptance && (current.selectedDriverId !== user?.id || current.status !== 'driver_selected' ||
        !current.offers?.some(offer => offer.id === notice.data.offerId && offer.driverId === user?.id && offer.status === 'accepted')))
      dismissRideResponseNotice(notice);
    if (counterOffer && current.passengerId === user?.id && (current.selectedDriverId || current.tripId ||
        !['pending', 'offers_received'].includes(current.status) ||
        !current.offers?.some(offer => offer.id === notice.data.offerId && offer.status === 'pending')))
      dismissRideResponseNotice(notice);
  }, [counterOffer, driverAcceptance, notice, request.currentData, request.isFetching, request.isError, request.startedTimeStamp, observedAt, user?.id]);
  const visible = Boolean(active && authenticated && notice);
  const version = getTokenSessionVersion();
  const current = () => Boolean(notice && user?.id === notice.recipientId && version === getTokenSessionVersion());
  const close = () => { if (current()) dismissRideResponseNotice(notice!); };
  const open = () => {
    if (!current()) return;
    const href = getNotificationHref(notice!.data, user ?? undefined);
    close();
    if (href) router.push(href);
  };
  return <RideModal inApp visible={visible} transparent priority={RIDE_OVERLAY_PRIORITY.information}
    onRequestClose={close} onShow={() => {
      // Ordinary replies are read on display. A price needs an explicit interaction.
      if (current() && !counterOffer) acknowledgeRideAlerts(item => item.key === notice!.key, notice);
    }}>
    {notice ? <PassengerResponsePanel key={notice.key} alert={notice} onClose={close} onOpen={open} /> : null}
  </RideModal>;
}

function PassengerResponsePanel({ alert, onClose, onOpen }: { alert: RideAlert; onClose: () => void; onOpen: () => void }) {
  const { active } = useRideOverlay();
  // The overlay host keeps covered panels mounted. Never speak over payment,
  // confirmation, SOS or another panel that actually owns the visible screen.
  const shown = React.isValidElement<{ alert: RideAlert }>(active?.children) &&
    active.children.type === PassengerResponsePanel && active.children.props.alert.key === alert.key;
  const notice = passengerResponseNotice(alert)!;
  useScreenAnnouncement(notice.speech, shown, 'response');
  return <View style={styles.overlay}>
    <View style={styles.card}>
      <ScrollView bounces={false}>
        <Text style={styles.title} accessibilityRole="header">{notice.title}</Text>
        <Text style={styles.message}>{notice.message}</Text>
      </ScrollView>
      <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={onOpen}>
        <Text style={styles.primaryText}>{isCounterOfferAlert(alert.data) || alert.data.type === 'offer_accepted' ? 'Voir la commande' : 'Voir mon trajet'}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={onClose}>
        <Text style={styles.secondaryText}>{isCounterOfferAlert(alert.data) ? 'Pas maintenant' : 'Compris'}</Text>
      </TouchableOpacity>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, backgroundColor: 'rgba(17, 24, 39, 0.58)' },
  card: { width: '100%', maxWidth: 420, maxHeight: '80%', padding: Spacing.xl, borderRadius: BorderRadius.xxl, backgroundColor: Colors.white },
  title: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.gray[900], textAlign: 'center' },
  message: { fontSize: FontSizes.base, color: Colors.gray[700], textAlign: 'center', marginTop: Spacing.md, marginBottom: Spacing.lg },
  primary: { minHeight: 52, justifyContent: 'center', alignItems: 'center', padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: ACTION_COLORS.orange },
  primaryText: { color: Colors.white, fontSize: FontSizes.base, fontWeight: FontWeights.bold },
  secondary: { minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: Spacing.md, marginTop: Spacing.sm, borderRadius: BorderRadius.lg, backgroundColor: Colors.gray[100] },
  secondaryText: { color: Colors.gray[700], fontSize: FontSizes.base, fontWeight: FontWeights.semibold },
});
