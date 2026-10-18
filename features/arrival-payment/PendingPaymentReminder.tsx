import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/styles';

export function PendingPaymentReminder({ visible, bottom, onResume }: {
  visible: boolean; bottom: number; onResume: () => void;
}) {
  if (!visible) return null;
  return <TouchableOpacity onPress={onResume} accessibilityRole="button" style={[styles.banner, { bottom }]}>
    <Text style={styles.text}>Paiement du trajet · Reprendre</Text>
  </TouchableOpacity>;
}
const styles = StyleSheet.create({
  banner: { position: 'absolute', left: 16, right: 16, zIndex: 9000, elevation: 10,
    backgroundColor: Colors.primary, borderRadius: 16, padding: 14, minHeight: 48 },
  text: { color: Colors.white, textAlign: 'center', fontWeight: '700' },
});
