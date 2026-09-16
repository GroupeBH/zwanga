import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  role: 'driver' | 'passenger';
  onContact: () => void;
  onSos: () => void;
  disabled?: boolean;
}
export const NavigationAssistanceButtons = memo(function NavigationAssistanceButtons({ role, onContact, onSos, disabled }: Props) {
  return <View style={styles.row}>
    <TouchableOpacity style={[styles.button, disabled && styles.disabled]} onPress={onContact} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={role === 'driver' ? 'Contacter un passager' : 'Contacter le conducteur'}>
      <Ionicons name="call-outline" size={19} color={Colors.primaryDark} />
      <Text style={styles.label}>Contacter</Text>
    </TouchableOpacity>
    <TouchableOpacity style={[styles.button, styles.sos, disabled && styles.disabled]} onPress={onSos} disabled={disabled}
      accessibilityRole="button" accessibilityLabel="SOS : afficher les numéros d’urgence"
      accessibilityHint="Aucun appel n’est lancé avant votre choix.">
      <Text style={styles.sosLabel}>SOS</Text>
    </TouchableOpacity>
  </View>;
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  button: { minHeight: 48, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200], justifyContent: 'center', alignItems: 'center', gap: 3 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.primaryDark },
  sos: { minWidth: 52, backgroundColor: Colors.danger, borderColor: Colors.danger },
  sosLabel: { fontSize: 16, fontWeight: '800', color: Colors.white },
  disabled: { opacity: 0.45 },
});
