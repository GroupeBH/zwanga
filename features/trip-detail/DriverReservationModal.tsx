import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RideModal } from '@/features/navigation/RideModal';
import { useRideOverlayStore } from '@/features/navigation/RideOverlayProvider';
import { usePendingTripReservation } from '@/hooks/trip-detail/usePendingTripReservation';
import type { useDriverTripWorkspace } from '@/hooks/trip-detail/useDriverTripWorkspace';
import { CompactCardAvatar } from '@/components/trip/CompactCardAvatar';
import { bookingFareLabel, bookingProposalPrice } from './bookingPriceProposal';
import { homeDepartureLabel } from '@/features/home/homeCardPresentation';
import { Colors } from '@/constants/styles';

export function DriverReservationModal({ workspace, blocked = false }: {
  workspace: ReturnType<typeof useDriverTripWorkspace>; blocked?: boolean;
}) {
  const host = useRideOverlayStore(), insets = useSafeAreaInsets();
  const panel = usePendingTripReservation(workspace, !blocked && Boolean(host));
  const { booking } = panel, trip = workspace.state.trip;
  if (!booking || !trip) return null;
  const proposal = bookingProposalPrice(booking) !== null;
  return <RideModal inApp transparent visible={panel.visible} animationType="none" onRequestClose={panel.dismiss}>
    <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.panel} testID="driver-reservation-modal">
        <View style={styles.header}>
          <View style={styles.copy}><Text style={styles.title}>Nouvelle réservation</Text></View>
          <TouchableOpacity style={styles.close} onPress={panel.dismiss} disabled={panel.busy} accessibilityRole="button"
            accessibilityLabel="Voir cette réservation plus tard" accessibilityHint="Elle reste dans la liste des passagers.">
            <Ionicons name="close" size={24} color={Colors.gray[700]} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <View style={styles.identity}>
            <CompactCardAvatar name={booking.passengerName || 'Passager'} uri={booking.passengerAvatar} />
            <View style={styles.copy}><Text style={styles.name}>{booking.passengerName || 'Passager'}</Text>
              <Text style={styles.muted}>{booking.numberOfSeats} place{booking.numberOfSeats > 1 ? 's' : ''} · {homeDepartureLabel(trip.departureTime)}</Text></View>
          </View>
          <Text style={styles.muted}>{proposal ? 'Prix proposé par le passager' : 'Prix de la réservation'}</Text>
          <Text style={styles.fare}>{bookingFareLabel(booking, trip.price)}</Text>
          <View style={styles.route}>
            <Text style={styles.muted}>Départ du passager</Text>
            <Text style={styles.address}>{booking.passengerOrigin || trip.departure?.address || 'À préciser'}</Text>
            <Text style={styles.muted}>Arrivée du passager</Text>
            <Text style={styles.address}>{booking.passengerDestination || trip.arrival?.address || 'À préciser'}</Text>
          </View>
          {panel.error ? <Text accessibilityRole="alert" style={styles.error}>{panel.error}</Text> : null}
          {!panel.busy && !workspace.ready && <Text accessibilityLiveRegion="polite" style={styles.muted}>Vérification de la réservation…</Text>}
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la réservation" disabled={panel.disabled}
            accessibilityState={{ disabled: panel.disabled }} style={[styles.button, styles.reject, panel.disabled && styles.disabled]}
            onPress={() => { void panel.answer(false); }}><Text style={styles.rejectText}>Refuser</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={proposal ? 'Accepter ce prix et la réservation' : 'Accepter la réservation'}
            disabled={panel.disabled} accessibilityState={{ disabled: panel.disabled, busy: panel.busy }}
            style={[styles.button, styles.accept, panel.disabled && styles.disabled]} onPress={() => { void panel.answer(true); }}>
            {panel.busy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.acceptText}>{proposal ? 'Accepter ce prix' : 'Accepter'}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </RideModal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 16 },
  panel: { maxHeight: '100%', width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: 24, backgroundColor: Colors.white, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 18, paddingBottom: 12, gap: 4 },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 21, fontWeight: '700', color: Colors.gray[900] }, close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 }, body: { paddingHorizontal: 18, paddingBottom: 18, gap: 8 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }, name: { fontSize: 18, fontWeight: '700', color: Colors.gray[900] },
  muted: { fontSize: 14, color: Colors.gray[600] }, route: { paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.gray[100], gap: 4 },
  address: { fontSize: 16, fontWeight: '600', color: Colors.gray[900], marginBottom: 6 }, fare: { fontSize: 19, fontWeight: '700', color: Colors.gray[900] },
  footer: { flexDirection: 'row', padding: 16, gap: 10, borderTopWidth: 1, borderColor: Colors.gray[100] },
  button: { flex: 1, minHeight: 50, padding: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  reject: { backgroundColor: Colors.gray[100] }, accept: { backgroundColor: Colors.primary },
  rejectText: { fontSize: 16, fontWeight: '700', color: Colors.gray[800], textAlign: 'center' },
  acceptText: { fontSize: 16, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  error: { fontSize: 14, color: Colors.danger }, disabled: { opacity: 0.55 },
});
