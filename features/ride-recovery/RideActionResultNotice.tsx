import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import type { RideOutboxEntry, RideSnapshot } from './rideRecoveryModel';
import { rideActionResultContent, type RideActionResult } from './rideActionResultModel';

/** Inline feedback: never captures touches on the map or competes with payment/SOS. */
export function RideActionResultNotice({ result, entry, snapshot, onClose }: {
  result: RideActionResult; entry?: RideOutboxEntry; snapshot?: RideSnapshot; onClose: () => void;
}) {
  const content = rideActionResultContent(result, entry, snapshot);
  // Normal progress is already shown next to the stage button and in the trip state.
  // Keep failures visible even if that button disappears after a server update.
  if (content.tone !== 'danger') return null;
  return <ScrollView style={styles.bounds} contentContainerStyle={styles.notice} bounces={false}>
    <Ionicons name="alert-circle-outline" size={20} color={Colors.danger} accessible={false} />
    <View style={styles.copy} accessibilityLiveRegion="polite">
      <Text style={styles.title}>{content.title}{result.actor === 'driver' && result.passengerName ? ` · ${result.passengerName}` : ''}</Text>
      <Text style={styles.message}>{content.message}</Text>
    </View>
    <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Masquer le message">
      <Ionicons name="close" size={20} color={Colors.gray[700]} />
    </TouchableOpacity>
  </ScrollView>;
}

const styles = StyleSheet.create({
  bounds: { flexGrow: 0, flexShrink: 1, maxHeight: 110 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF3F3', borderRadius: 12, paddingLeft: 10, paddingVertical: 6 },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: '700', color: Colors.gray[900] },
  message: { fontSize: 12, lineHeight: 17, color: Colors.gray[700] },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
