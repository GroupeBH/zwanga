import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import type { PickupArrivalEstimate } from './pickupArrivalEstimate';

export function PassengerPickupEstimateBanner({ estimate, compact = false }: { estimate: PickupArrivalEstimate | null; compact?: boolean }) {
  if (!estimate) return null;
  const estimated = estimate.status === 'estimated';
  return <View style={[styles.banner, compact && styles.compact]} accessible accessibilityLiveRegion="polite"
    accessibilityLabel={`Arrivée estimée du conducteur. ${estimate.value}. ${estimate.detail}`}>
    <Ionicons name="time-outline" size={22} color={estimated ? Colors.primary : Colors.gray[600]} />
    <View style={styles.copy}>
      <Text style={styles.label}>Arrivée estimée du conducteur</Text>
      <Text style={[styles.value, compact && styles.compactValue, estimated && styles.estimated]}>{estimate.value}</Text>
      {!compact && <Text style={styles.detail}>{estimate.detail}</Text>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12,
    backgroundColor: Colors.gray[50], borderRadius: 16 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  label: { fontSize: 12, color: Colors.gray[600] },
  value: { fontSize: 18, fontWeight: '700', color: Colors.gray[800] },
  estimated: { color: Colors.primary },
  detail: { fontSize: 12, lineHeight: 17, color: Colors.gray[600] },
  compact: { padding: 0, backgroundColor: 'transparent', alignItems: 'center', gap: 6 },
  compactValue: { fontSize: 14 },
});
