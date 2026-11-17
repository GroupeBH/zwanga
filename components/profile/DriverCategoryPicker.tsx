import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';
import { DRIVER_CATEGORIES } from '@/features/profile/driverCategory';
import type { DriverCategory } from '@/types';

export function DriverCategoryPicker({ value, onChange, disabled = false }: {
  value: DriverCategory | null; onChange: (value: DriverCategory) => void; disabled?: boolean;
}) {
  return <View style={styles.group}>
    <Text style={styles.title}>Vous conduisez comme…</Text>
    {DRIVER_CATEGORIES.map(option => <TouchableOpacity key={option.value}
      style={[styles.option, value === option.value && styles.selected]} disabled={disabled}
      accessibilityRole="radio" accessibilityState={{ selected: value === option.value, disabled }}
      accessibilityLabel={option.label} onPress={() => onChange(option.value)}>
      <Ionicons name={value === option.value ? 'radio-button-on' : 'radio-button-off'} size={21} color={Colors.primary} />
      <View style={styles.copy}><Text style={styles.label}>{option.label}</Text><Text style={styles.hint}>{option.hint}</Text></View>
    </TouchableOpacity>)}
  </View>;
}
const styles = StyleSheet.create({
  group: { gap: 8 }, title: { fontSize: 14, fontWeight: '600', color: Colors.gray[800] },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, padding: 10,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200] },
  selected: { borderColor: Colors.primary, backgroundColor: '#FFF5EF' }, copy: { flex: 1 },
  label: { color: Colors.gray[900], fontSize: 14, fontWeight: '600' },
  hint: { color: Colors.gray[600], fontSize: 12, lineHeight: 17 },
});
