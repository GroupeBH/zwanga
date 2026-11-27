import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated, selectUser } from '@/store/selectors';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { usePassengerRideProgress } from '@/hooks/passenger-navigation/usePassengerRideProgress';
import { RideModal } from '@/features/navigation/RideModal';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import { ACTION_COLORS } from '@/constants/actionColors';
import { isValidElement } from 'react';
import { useRideOverlay } from '@/features/navigation/RideOverlayProvider';
import { useScreenAnnouncement } from '@/hooks/notifications/usePaymentAnnouncement';
import type { PassengerRideNotice } from '@/features/passenger-navigation/passengerRideProgress';

export function PassengerRideProgressCoordinator() {
  const user = useAppSelector(selectUser);
  const authenticated = useAppSelector(selectIsAuthenticated);
  return authenticated && user?.id ? <ProgressSession key={`${user.id}:${getTokenSessionVersion()}`} userId={user.id} /> : null;
}

function ProgressSession({ userId }: { userId: string }) {
  const { notice, visible, close } = usePassengerRideProgress(userId);
  return <RideModal inApp transparent visible={visible} priority={RIDE_OVERLAY_PRIORITY.information} onRequestClose={close}>
    {notice && <ProgressPanel notice={notice} close={close} />}
  </RideModal>;
}

function ProgressPanel({ notice, close }: { notice: PassengerRideNotice; close: () => void }) {
  const { active } = useRideOverlay();
  const shown = isValidElement<{ notice: PassengerRideNotice }>(active?.children) &&
    active.children.type === ProgressPanel && active.children.props.notice === notice;
  useScreenAnnouncement({ key: `passenger-progress:${notice.bookingId}:${notice.stage}`, text: notice.message }, shown, 'response');
  return (
    <View style={styles.overlay}><View style={styles.card}>
      <ScrollView bounces={false}>
        <Ionicons name={notice?.stage === 'dropoff' ? 'flag' : 'checkmark-circle'} size={34} color="#168454" accessible={false} />
        <Text style={styles.title} accessibilityRole="header">{notice?.title}</Text>
        <Text style={styles.message}>{notice?.message}</Text>
      </ScrollView>
      <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={close}><Text style={styles.buttonText}>Compris</Text></TouchableOpacity>
    </View></View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(17,24,39,0.5)' },
  card: { width: '100%', maxWidth: 420, maxHeight: '80%', padding: 24, borderRadius: 24, backgroundColor: '#FFFFFF' },
  title: { color: '#1E294A', fontSize: 22, fontWeight: '700', marginTop: 12 },
  message: { color: '#536071', fontSize: 16, marginTop: 8, marginBottom: 20 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 16, backgroundColor: ACTION_COLORS.orange },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
