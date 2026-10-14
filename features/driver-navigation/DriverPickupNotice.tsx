import type { useDriverNavigationController } from '@/hooks/driver-navigation/useDriverNavigationController';
import { Colors } from '@/constants/styles';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Non-blocking context. The primary declaration remains in RideRecoveryControl. */
export function DriverPickupNotice({ model, hidden }: { model: ReturnType<typeof useDriverNavigationController>; hidden?: boolean }) {
  const { data, mapState } = model.session.foundation;
  const bypass = mapState.pickupBypassConfirmation;
  const notice = mapState.pickupNotice;
  if (hidden || !data.isScreenActive || mapState.backgroundDisclosureVisible || mapState.tripEndNotice || (!bypass && !notice)) return null;
  const waypoint = bypass?.waypoint ?? notice?.waypoint;
  if (!waypoint || waypoint.completed || waypoint.booking.pickedUp || waypoint.booking.droppedOff) return null;
  const busy = Boolean(mapState.pickupBypassAction) || data.isPausingTrip || data.isCancellingPickupBypassBooking;
  const title = bypass ? 'Le passager est-il monté ?' : notice?.type === 'passenger_ready_pickup' || notice?.type === 'parties_nearby'
    ? 'Le passager vous attend' : notice?.type === 'driver_arrived_pickup' ? 'Vous êtes au lieu de départ' : 'Le départ est tout près';
  const countdown = notice?.type === 'driver_arrived_pickup' ? mapState.pickupNoticeCountdown : null;
  return <View style={styles.notice}>
    <View style={styles.row}>
      <View style={styles.copy} accessibilityLiveRegion="polite">
        <Text style={styles.title}>{title} · {waypoint.passenger.name || 'Passager'}</Text>
        {bypass ? <Text style={styles.detail}>S’il est monté, appuyez sur « Le passager est monté ».</Text>
          : countdown !== null && <Text style={styles.detail}>{countdown > 0 ? `Attente : ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}` : 'Le temps d’attente est terminé'}</Text>}
      </View>
      <TouchableOpacity style={styles.close} disabled={busy} accessibilityRole="button" accessibilityLabel="Masquer le rappel du passager"
        onPress={bypass ? model.pickupActions.dismissPickupBypassConfirmation : model.pickupActions.dismissPickupNotice}>
        <Ionicons name="close" size={20} color={Colors.gray[600]} />
      </TouchableOpacity>
    </View>
    {bypass && <TouchableOpacity disabled={busy} style={styles.secondary} accessibilityRole="button"
      accessibilityLabel={data.trip?.tripRequestId ? 'Arrêter le trajet' : 'Annuler cette réservation'}
      onPress={() => { if (busy) return; void (data.trip?.tripRequestId ? model.interruptionActions.pauseTripWithoutPassengerConfirmation() : model.pickupActions.handleCancelBypassedPickup()); }}>
      {busy ? <ActivityIndicator size="small" color={Colors.danger} /> : <Text style={styles.secondaryText}>{data.trip?.tripRequestId ? 'Arrêter le trajet' : 'Annuler cette réservation'}</Text>}
    </TouchableOpacity>}
  </View>;
}

const styles = StyleSheet.create({
  notice: { backgroundColor: Colors.white, borderRadius: 12, paddingLeft: 10, paddingRight: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  copy: { flex: 1, minWidth: 0, paddingVertical: 6 },
  title: { color: Colors.gray[800], fontSize: 12, fontWeight: '600' },
  detail: { color: Colors.gray[600], fontSize: 12, lineHeight: 17, marginTop: 2 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondary: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 12 },
  secondaryText: { color: Colors.danger, fontSize: 12, fontWeight: '600' },
});
