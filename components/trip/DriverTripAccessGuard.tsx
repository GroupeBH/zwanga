import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/styles';
import { sharedBookingsOptions } from '@/features/activity/activityQueryOptions';
import { isActivePassengerBooking, ownsTrip } from '@/features/activity/tripParticipation';
import { useOfflineRideData } from '@/hooks/navigation/useOfflineRideData';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import { useGetMyActivityBookingsQuery } from '@/store/api/bookingApi';
import { useAppSelector } from '@/store/hooks';

/** Do not mount driver controllers (GPS, sockets, actions) until ownership is known. */
export function DriverTripAccessGuard({ children }: React.PropsWithChildren) {
  const { id } = useLocalSearchParams();
  const tripId = typeof id === 'string' ? id : '';
  const userId = useAppSelector(state => state.auth.user?.id);
  const router = useRouter();
  const { currentData: liveTrip, error, isLoading, isFetching, refetch } = useGetTripByIdQuery(tripId, {
    skip: !tripId || !userId,
  });
  const { data: trip } = useOfflineRideData(`trip:${tripId}`, liveTrip, error,
    ownsTrip(liveTrip, userId) && liveTrip?.status === 'ongoing');
  const isOwner = trip?.id === tripId && ownsTrip(trip, userId);
  const { data: bookings } = useGetMyActivityBookingsQuery(undefined, {
    ...sharedBookingsOptions, skip: !userId || !trip || isOwner,
  });
  if (isOwner) return <React.Fragment key={`${userId}:${tripId}`}>{children}</React.Fragment>;

  const booking = bookings?.find(candidate => candidate.tripId === tripId
    && isActivePassengerBooking(candidate, userId));
  if (trip?.id === tripId && trip.status === 'ongoing' && booking) {
    return <Redirect href={`/booking/navigate/${booking.id}`} />;
  }
  const loading = Boolean(userId && tripId && !trip && !error && (isLoading || isFetching));
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        {loading && <ActivityIndicator size="large" color={Colors.primary} />}
        <Text style={styles.title}>{loading ? 'Vérification du trajet…' : 'Navigation conducteur indisponible'}</Text>
        {!loading && <Text style={styles.message}>{trip
          ? 'Seul le conducteur qui a publié ce trajet peut le gérer. Votre compte conducteur ne change pas votre rôle de passager.'
          : 'Impossible de vérifier l’accès à ce trajet. Réessayez ou revenez à l’accueil.'}</Text>}
        {!loading && error && userId && tripId ? <TouchableOpacity accessibilityRole="button"
          style={styles.button} onPress={() => { void refetch(); }}>
          <Text style={styles.buttonText}>Réessayer</Text>
        </TouchableOpacity> : null}
        <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.buttonText}>Retour à l’accueil</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.white, justifyContent: 'center' },
  content: { padding: 24, gap: 16, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', color: Colors.gray[900] },
  message: { fontSize: 16, textAlign: 'center', color: Colors.gray[600] },
  button: { padding: 14, borderRadius: 16, backgroundColor: Colors.primary },
  buttonText: { color: Colors.white, fontWeight: '600' },
});
