import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';
import type { useCashExceptionDisclosure } from './useCashExceptionDisclosure';

export function CashExceptionDisclosure({ disclosure, busy }: {
  disclosure: ReturnType<typeof useCashExceptionDisclosure>; busy: boolean;
}) {
  const { known, unavailable, exception, acknowledged, toggle, refresh } = disclosure;
  if (!known) return <View style={styles.box}>
    <Text style={styles.hint}>{unavailable ? 'Conditions indisponibles. Reconnectez-vous puis actualisez.' : 'Vérification des conditions…'}</Text>
    {unavailable && <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.control} onPress={refresh}>
      <Text style={styles.label}>Actualiser</Text>
    </TouchableOpacity>}
  </View>;
  if (!exception) return null;
  return <View style={styles.box}>
    <Text style={styles.warning} accessibilityRole="alert">{exception.message}</Text>
    <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="J’ai lu les conséquences du cash exceptionnel"
      accessibilityState={{ checked: acknowledged, disabled: busy }} disabled={busy}
      style={styles.control} onPress={toggle}>
      <Ionicons name={acknowledged ? 'checkbox' : 'square-outline'} size={22} color={Colors.gray[800]} />
      <Text style={styles.label}>J’ai lu les conséquences</Text>
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', gap: 6, paddingVertical: 6 },
  warning: { color: Colors.dangerDark, fontSize: 14, lineHeight: 21 },
  hint: { color: Colors.gray[700], fontSize: 12, lineHeight: 18 },
  control: { minHeight: 44, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flexShrink: 1, color: Colors.gray[800], fontSize: 14, fontWeight: '600' },
});
