import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/styles';

export function SignupAnnouncementsCheckbox({ checked, disabled, onChange }: {
  checked: boolean; disabled: boolean; onChange: (checked: boolean) => void;
}) {
  return <TouchableOpacity style={styles.row} disabled={disabled} onPress={() => onChange(!checked)}
    accessibilityRole="checkbox" accessibilityLabel="Me prévenir des mises à jour, obligatoire"
    accessibilityState={{ checked, disabled }}>
    <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={25} color={Colors.primary} />
    <Text style={styles.label}>Me prévenir des mises à jour <Text style={styles.required}>*</Text>
      {'\n'}<Text style={styles.hint}>Obligatoire à l’inscription. Modifiable dans les paramètres.</Text>
    </Text>
  </TouchableOpacity>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 8 },
  label: { flex: 1, fontSize: 14, lineHeight: 21, color: Colors.gray[800], fontWeight: '600' },
  required: { color: Colors.primary }, hint: { fontSize: 12, fontWeight: '400', color: Colors.gray[600] },
});
