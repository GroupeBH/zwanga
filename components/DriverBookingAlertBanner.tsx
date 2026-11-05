import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { RideAlert } from '@/features/notifications/rideAlert';
import { selectBookingEntryAlert } from '@/features/navigation/pendingBookingEntry';
import { driverNotificationCard } from '@/features/notifications/driverNotificationCard';
import { useGetBookingByIdQuery } from '@/store/api/bookingApi';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { dismissDriverInvitation } from '@/services/driverNotifications';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { reportRideAudioFailure } from '@/services/rideAudioDiagnostics';
import { hasPassengerFinishedRide, ownsTrip } from '@/features/activity/tripParticipation';

/** A persistent in-app source for the ringtone, independent of SystemUI's banner timer. */
export function DriverBookingAlertBanner({ userId, alerts, visible, path }: {
  userId?: string; alerts: RideAlert[]; visible: boolean; path: string;
}) {
  const router = useRouter(), insets = useSafeAreaInsets();
  const candidate = userId ? selectBookingEntryAlert(alerts, userId, new Set()) : undefined;
  const alert = alerts.find(item => item.key === candidate?.alertKey);
  const reads = useDisplayReadsEnabled(visible && !!candidate);
  // Share RTK's booking cache with entry/detail. One pending booking only; no
  // polling after resolution, while covered, offline or in the background.
  const query = useGetBookingByIdQuery(candidate?.id ?? '', displayReadOptions(reads, 15000));
  const version = getTokenSessionVersion();
  const action = useRef('');
  const dismissing = useRef('');
  const current = useRef({ mounted: true, userId, visible, path, key: candidate?.key });
  current.current = { ...current.current, userId, visible, path, key: candidate?.key };
  useEffect(() => {
    current.current.mounted = true;
    return () => { current.current.mounted = false; };
  }, []);
  useEffect(() => { action.current = ''; }, [path, visible, candidate?.id]);
  const booking = query.currentData;
  const unavailable = !!candidate && !query.isFetching && (query.isError
    ? [403, 404, 410].includes(Number(query.error && 'status' in query.error ? query.error.status : 0))
    : booking?.id === candidate.id && (booking.status !== 'pending' || hasPassengerFinishedRide(booking) || booking.passengerId === userId ||
      (!!booking.trip && (!ownsTrip(booking.trip, userId!) || booking.trip.id !== booking.tripId ||
        booking.trip.isExpired || !['upcoming', 'ongoing'].includes(booking.trip.status)))));
  useEffect(() => {
    if (!visible || !unavailable || !candidate || !userId || dismissing.current === candidate.key) return;
    dismissing.current = candidate.key;
    void dismissDriverInvitation({ kind: 'booking', id: candidate.id, driverId: userId })
      .catch(() => reportRideAudioFailure('DRIVER_ALERT_DISMISS_FAILED'));
  }, [visible, unavailable, candidate, userId]);
  if (!visible || !candidate || !alert || unavailable) return null;
  const card = driverNotificationCard('booking', { ...alert.data,
    ...(booking?.id === candidate.id && booking.trip && ownsTrip(booking.trip, userId!) ? {
      rideDeparture: booking.trip.departure?.name || alert.data.rideDeparture,
      rideArrival: booking.trip.arrival?.name || alert.data.rideArrival,
    } : {}),
  });
  const details = card.body.replace(/\n?Ouvrez Zwanga pour répondre\.$/, '').trim();
  return <View style={[s.anchor, { paddingTop: insets.top + 8 }]} testID="driver-booking-alert-banner">
    <Pressable accessibilityRole="button" accessibilityLabel="Nouvelle réservation Zwanga. Voir la réservation pour répondre."
      style={({ pressed }) => [s.banner, pressed && s.pressed]} onPress={() => {
        if (!current.current.mounted || !current.current.visible || current.current.userId !== userId ||
          current.current.path !== path || current.current.key !== candidate.key || version !== getTokenSessionVersion() ||
          (alert.expiresAt && Date.parse(alert.expiresAt) <= Date.now()) || action.current === candidate.key) return;
        action.current = candidate.key;
        // Read-only destination validates ownership and current status. This tap
        // never accepts/refuses a passenger or acknowledges their pending booking.
        router.navigate({ pathname: '/incoming-driver', params: { kind: 'booking', id: candidate.id, driverId: userId! } });
      }}>
      <Text style={s.brand}>ZWANGA · NOUVELLE RÉSERVATION</Text>
      <Text style={s.details} numberOfLines={2}>{details || 'Un passager a réservé une place dans votre trajet.'}</Text>
      <Text style={s.action}>{query.isError ? 'Voir la réservation · Réessayer' : 'Voir la réservation →'}</Text>
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  // Participate in layout: a persistent alert must not cover Back or booking actions.
  anchor: { paddingHorizontal: 12, paddingBottom: 8, backgroundColor: '#FFFFFF' },
  banner: { backgroundColor: '#FFFFFF', borderLeftWidth: 4, borderLeftColor: '#CE4613', borderRadius: 16,
    paddingVertical: 12, paddingHorizontal: 16, gap: 5, shadowColor: '#14213D', shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 3 }, shadowRadius: 8, elevation: 8 },
  brand: { color: '#A7360C', fontSize: 12, fontWeight: '700' },
  details: { color: '#202734', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  action: { color: '#A7360C', fontSize: 14, fontWeight: '700', paddingTop: 3 },
  pressed: { opacity: 0.8 },
});
