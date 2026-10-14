import type { usePassengerNavigationController } from '@/hooks/passenger-navigation/usePassengerNavigationController';
import { Colors } from '@/constants/styles';
import { pickupVehicleDetails } from '@/features/navigation/pickupAwareness';
import { PickupDriverDetails, pickupDriverDetails } from '@/features/navigation/PickupDriverDetails';
import { useAppSelector } from '@/store/hooks';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Meeting/vehicle context stays inline; it never prevents boarding or map use. */
export function PassengerPickupNotice({ model, hidden }: { model: ReturnType<typeof usePassengerNavigationController>; hidden?: boolean }) {
  const { data, state, presentation } = model;
  const booking = data.booking;
  const declared = useAppSelector(store => Boolean(booking && store.auth.user?.id === booking.passengerId && store.rideRecovery.userId === booking.passengerId &&
    store.rideRecovery.entries.some(entry => entry.bookingId === booking.id && entry.tripId === booking.tripId && entry.stage === 'pickup' &&
      entry.decision === 'confirm' && !['blocked', 'disputed'].includes(entry.state))));
  if (hidden || !data.isScreenActive || !state.pickupNotice || !booking || declared || booking.pickedUp || booking.pickedUpConfirmedByPassenger ||
    booking.droppedOff || booking.droppedOffConfirmedByPassenger || !['accepted', 'no_show'].includes(booking.status)) return null;
  const vehicle = pickupVehicleDetails(data.trip ?? booking.trip);
  const countdown = state.pickupNoticeCountdown;
  return <View style={styles.notice}>
    <PickupDriverDetails {...pickupDriverDetails(data.trip ?? booking.trip)} />
    <View style={styles.row}>
      <View style={styles.copy} accessibilityLiveRegion="polite">
        <Text style={styles.title}>{presentation.pickupNoticeTitle}</Text>
        {vehicle.name || vehicle.color ? <Text style={styles.detail}>{[vehicle.name, vehicle.color].filter(Boolean).join(' · ')}</Text> : null}
        <Text style={styles.plate} accessibilityLabel={vehicle.plate ? `Plaque d’immatriculation : ${vehicle.plate}` : undefined}>
          {vehicle.plate ? `Plaque : ${vehicle.plate}` : 'Vérifiez le véhicule avec le conducteur.'}
        </Text>
        {countdown !== null && <Text style={styles.detail}>{countdown > 0 ? `Attente : ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}` : 'Délai d’attente écoulé'}</Text>}
      </View>
      <TouchableOpacity style={styles.close} accessibilityRole="button" accessibilityLabel="Masquer l’information de rendez-vous"
        onPress={() => state.setPickupNotice(null)}>
        <Ionicons name="close" size={20} color={Colors.gray[600]} />
      </TouchableOpacity>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  notice: { marginHorizontal: 12, marginBottom: 6, paddingLeft: 10, paddingTop: 8, backgroundColor: Colors.gray[50], borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  copy: { flex: 1, minWidth: 0, paddingVertical: 8 },
  title: { fontSize: 13, fontWeight: '600', color: Colors.gray[900] },
  detail: { fontSize: 12, lineHeight: 17, color: Colors.gray[600], marginTop: 2 },
  plate: { fontSize: 13, fontWeight: '600', color: Colors.gray[800], marginTop: 2 },
  close: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
