import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';
import { ACTION_COLORS } from '@/constants/actionColors';

/** A choice, not an OS permission indicator. Never preselect it for a new consent. */
export function BackgroundLocationConsent({ checked, disabled = false, onChange }: {
  checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  return <TouchableOpacity accessibilityRole="checkbox"
    accessibilityLabel="J’autorise ma localisation même en veille"
    accessibilityState={{ checked, disabled }} disabled={disabled}
    onPress={() => { if (!disabled) onChange(!checked); }}
    activeOpacity={0.75} style={[styles.row, disabled && styles.disabled]}>
    <View style={[styles.checkbox, checked && styles.checked]}>
      {checked && <Ionicons name="checkmark" size={20} color={Colors.white} />}
    </View>
    <Text style={styles.label}>J’autorise ma localisation même en veille</Text>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  checkbox: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: Colors.gray[600],
    alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checked: { backgroundColor: ACTION_COLORS.orange, borderColor: ACTION_COLORS.orange },
  label: { flex: 1, fontSize: 16, lineHeight: 23, fontWeight: '600', color: Colors.gray[900] },
  disabled: { opacity: 0.5 },
});
