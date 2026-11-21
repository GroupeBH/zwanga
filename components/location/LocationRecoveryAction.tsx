import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { useLocationRecovery } from '@/hooks/location-picker/useLocationRecovery';
import { ACTION_COLORS } from '@/constants/actionColors';

export function LocationRecoveryAction({ recovery }: { recovery: ReturnType<typeof useLocationRecovery> }) {
  if (!recovery.issue && !recovery.error) return null;
  const label = recovery.issue === 'settings' ? 'Autoriser ma position' : 'Activer ma localisation';
  return <View>
    {recovery.error ? <Text accessibilityLiveRegion="polite" style={s.error}>{recovery.error}</Text> : null}
    <TouchableOpacity style={s.button} accessibilityRole="button" disabled={recovery.busy}
      accessibilityState={{ busy: recovery.busy, disabled: recovery.busy }} onPress={() => void recovery.recover()}>
      {recovery.busy ? <ActivityIndicator color={ACTION_COLORS.orange} />
        : <Ionicons name="locate-outline" size={20} color={ACTION_COLORS.orange} />}
      <Text style={s.label}>{recovery.busy ? 'Vérification…' : label}</Text>
    </TouchableOpacity>
  </View>;
}
const s = StyleSheet.create({
  button: { minHeight: 44, paddingVertical: 8, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '700', color: ACTION_COLORS.orange },
  error: { fontSize: 14, color: '#9A3412' },
});
