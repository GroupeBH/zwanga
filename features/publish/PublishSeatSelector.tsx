import { Colors } from '@/constants/styles';
import type { TripRequestVehicleType } from '@/types';
import { getPassengerVehicleSeatCapacity } from '@/utils/passengerSeats';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getPublishSeats, MIN_PUBLISH_SEATS } from './publishSeatPolicy';

export function PublishSeatSelector({ seats, setSeats, vehicleType }: {
  seats: string;
  setSeats: React.Dispatch<React.SetStateAction<string>>;
  vehicleType: TripRequestVehicleType | null | undefined;
}) {
  const count = Number(getPublishSeats(seats, vehicleType));
  const maximum = getPassengerVehicleSeatCapacity(vehicleType);
  const change = (delta: number) => setSeats(current =>
    getPublishSeats(String(Number(getPublishSeats(current, vehicleType)) + delta), vehicleType));
  return <View style={styles.row}>
    <View style={styles.copy}>
      <Text style={styles.title}>Places proposées</Text>
      {maximum && <Text style={styles.hint}>{maximum} maximum</Text>}
    </View>
    <View style={styles.counter}>
      {[-1, 0, 1].map(delta => {
        if (!delta) return <Text key="count" style={styles.value} accessibilityLiveRegion="polite"
          accessibilityLabel={`${count} place${count > 1 ? 's' : ''} proposée${count > 1 ? 's' : ''}`}>{count}</Text>;
        const disabled = delta < 0 ? count <= MIN_PUBLISH_SEATS : count >= (maximum ?? Number.MAX_SAFE_INTEGER);
        return <TouchableOpacity key={delta} accessibilityRole="button"
          accessibilityLabel={delta < 0 ? 'Retirer une place' : 'Ajouter une place'}
          accessibilityState={{ disabled }} disabled={disabled} onPress={() => change(delta)}
          style={[styles.button, disabled && styles.disabled]} activeOpacity={0.7}>
          <Ionicons name={delta < 0 ? 'remove' : 'add'} size={22} color={Colors.primaryDark} />
        </TouchableOpacity>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  copy: { flex: 1, minWidth: 96 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.gray[900] },
  hint: { fontSize: 12, lineHeight: 18, color: Colors.gray[600], marginTop: 4 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  button: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray[50] },
  disabled: { opacity: 0.35 },
  value: { minWidth: 30, textAlign: 'center', fontSize: 22, fontWeight: '700', color: Colors.gray[900] },
});
