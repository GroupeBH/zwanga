import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RideOutboxEntry, RideSnapshot } from './rideRecoveryModel';
import { rideActionResultContent, type RideActionResult } from './rideActionResultModel';

const tones = { success: '#147D58', pending: '#A63E13', danger: '#BE3546' };

/** Non-modal: does not capture map gestures, delay payment or occupy the SOS overlay. */
export function RideActionResultToast({ result, entry, snapshot, onClose }: {
  result: RideActionResult; entry?: RideOutboxEntry; snapshot?: RideSnapshot; onClose: () => void;
}) {
  const content = rideActionResultContent(result, entry, snapshot);
  const insets = useSafeAreaInsets();
  const color = tones[content.tone];
  useEffect(() => {
    const timer = setTimeout(onClose, content.tone === 'danger' ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [result.id, content.phase, content.tone, onClose]);
  return <View pointerEvents="box-none" style={[styles.position, { top: insets.top + 64 }]}>
    <View style={[styles.toast, { borderLeftColor: color }]}>
      {content.phase === 'sending' ? <ActivityIndicator color={color} /> : <Ionicons name={content.icon} size={24} color={color} />}
      <View style={styles.copy} accessible accessibilityLiveRegion="polite">
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.message}>{content.message}</Text>
        {result.actor === 'driver' && <Text style={styles.context}>{result.passengerName || 'Passager'}</Text>}
      </View>
      <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Fermer le message">
        <Ionicons name="close" size={20} color="#52616E" />
      </TouchableOpacity>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  position: { position: 'absolute', left: 12, right: 12, zIndex: 100, alignItems: 'center' },
  toast: { width: '100%', maxWidth: 480, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 14, paddingVertical: 12, paddingRight: 4, borderRadius: 16, borderLeftWidth: 4,
    backgroundColor: '#FFFFFF', elevation: 8, shadowColor: '#16232F', shadowOpacity: 0.12,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  copy: { flex: 1 },
  title: { color: '#16232F', fontSize: 15, lineHeight: 20, fontWeight: '700' },
  message: { color: '#52616E', fontSize: 13, lineHeight: 18, marginTop: 3 },
  context: { color: '#52616E', fontSize: 12, marginTop: 4 },
  close: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
