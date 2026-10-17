import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/styles';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useGetBookingByIdQuery } from '@/store/api/bookingApi';
import { useAppSelector } from '@/store/hooks';
import { dismissDriverInvitation } from '@/services/driverNotifications';
import { isInvitationId } from './driverInvitation';

/** Compatibility with notifications already sent: resolve the booking, never answer it. */
export function IncomingBookingRedirect() {
  const { id, driverId } = useLocalSearchParams<{ id?: string; driverId?: string }>();
  const router = useRouter();
  const active = useScreenIsActive();
  const userId = useAppSelector(state => state.auth.user?.id);
  const validId = isInvitationId(id) ? id : '';
  const wrongRecipient = Boolean(driverId && driverId !== userId);
  const enabled = Boolean(active && userId && validId && !wrongRecipient);
  const query = useGetBookingByIdQuery(validId, { skip: !enabled, refetchOnMountOrArgChange: true });
  const booking = query.currentData;
  const authorized = Boolean(userId && booking?.id === validId && booking.trip?.driverId === userId
    && booking.tripId === booking.trip.id);
  const redirected = useRef(false);

  useEffect(() => {
    if (!enabled || !authorized || !booking || query.isFetching || query.isError || redirected.current) return;
    redirected.current = true;
    void dismissDriverInvitation({ kind: 'booking', id: validId, driverId: userId! }).catch(() => {});
    // Ongoing rides already have an inline pending-booking panel. Future/past rides
    // open the existing passenger list, with the selected reservation first.
    router.replace({
      pathname: booking.trip?.status === 'ongoing' ? '/trip/navigate/[id]' : '/trip/manage/[id]',
      params: { id: booking.tripId, bookingId: validId, section: 'passengers' },
    });
  }, [authorized, booking, enabled, query.isError, query.isFetching, router, userId, validId]);

  const loading = enabled && (query.isFetching || query.isLoading || authorized) && !query.isError;
  return <SafeAreaView style={styles.screen}>
    <View style={styles.content}>
      {loading ? <ActivityIndicator color={Colors.primary} /> : null}
      <Text accessibilityLiveRegion="polite" style={styles.message}>
        {loading ? 'Ouverture de la réservation…' : query.isError
          ? 'Impossible de charger la réservation.' : 'Cette réservation n’est pas disponible pour votre compte.'}
      </Text>
      {!loading && query.isError && enabled && <TouchableOpacity accessibilityRole="button" style={styles.button}
        onPress={() => { void query.refetch(); }}><Text style={styles.buttonText}>Réessayer</Text></TouchableOpacity>}
      {!loading && <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.buttonText}>Retour à l’accueil</Text>
      </TouchableOpacity>}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.white, justifyContent: 'center' },
  content: { padding: 24, gap: 16, alignItems: 'center' },
  message: { fontSize: 16, color: Colors.gray[700], textAlign: 'center' },
  button: { minHeight: 44, padding: 12, justifyContent: 'center' },
  buttonText: { color: Colors.primaryDark, fontSize: 16, fontWeight: '600' },
});
