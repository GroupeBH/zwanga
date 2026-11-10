import { memo, useMemo } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ACTION_COLORS } from '@/constants/actionColors';
import { useRequestPickupRipple } from '@/hooks/request-detail/useRequestPickupRipple';

/** Screen-space overlay: static native map markers never need bitmap recapture for the waves. */
export const RequestPickupBeacon = memo(function RequestPickupBeacon({ point, enabled }: {
  point: { x: number; y: number }; enabled: boolean;
}) {
  const progress = useRequestPickupRipple(enabled);
  const waves = useMemo(() => [progress, Animated.modulo(Animated.add(progress, 0.5), 1)].map(phase => ({
    opacity: phase.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.32, 0] }),
    transform: [{ scale: phase.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1.8] }) }],
  })), [progress]);
  return <View pointerEvents="none" style={[s.anchor, { left: point.x, top: point.y }]}
    testID="request-pickup-beacon" accessible accessibilityLabel="Votre départ : le conducteur vient vous chercher ici">
    {waves.map((style, index) => <Animated.View key={index} style={[s.wave, style]} testID={`request-pickup-wave-${index}`} />)}
    <View style={s.label}><Text style={s.labelText}>Votre départ</Text></View>
    <View style={s.person}><Ionicons name="person" size={16} color="#FFFFFF" /></View>
  </View>;
});
const s = StyleSheet.create({
  anchor: { position: 'absolute', width: 0, height: 0 },
  wave: { position: 'absolute', width: 80, height: 80, left: -40, top: -40, borderRadius: 40,
    backgroundColor: '#FF6B35', borderColor: '#E64B14', borderWidth: 1.5 },
  label: { position: 'absolute', bottom: 25, left: -62, width: 124, paddingVertical: 6, paddingHorizontal: 8,
    backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F5D5C7' },
  labelText: { fontSize: 13, fontWeight: '700', color: '#1E2A4A', textAlign: 'center' },
  person: { position: 'absolute', left: -17, top: -17, width: 34, height: 34, borderRadius: 17,
    backgroundColor: ACTION_COLORS.orange, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
});
