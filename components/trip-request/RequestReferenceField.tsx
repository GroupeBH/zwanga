import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '@/constants/styles';

export function RequestReferenceField({ target, value, onChangeText, required = false, disabled = false }: {
  target: 'departure' | 'arrival'; value: string; onChangeText: (value: string) => void;
  required?: boolean; disabled?: boolean;
}) {
  const label = `Repère ${target === 'departure' ? 'au départ' : 'à l’arrivée'}`;
  return <View style={s.field}>
    <Text style={s.label}>{label} · {required ? 'obligatoire' : 'facultatif'}</Text>
    <TextInput style={[s.input, required && !value?.trim() && s.required]} value={value} onChangeText={onChangeText}
      editable={!disabled} accessibilityLabel={`${label}, ${required ? 'obligatoire' : 'facultatif'}`}
      placeholder={target === 'departure' ? 'Ex. Devant la pharmacie, avenue…' : 'Ex. École, avenue, portail…'}
      placeholderTextColor={Colors.gray[500]} maxLength={200} autoCapitalize="sentences" returnKeyType="done" />
    {required && !value?.trim() ? <Text style={s.hint}>La commune seule ne suffit pas pour vous retrouver.</Text> : null}
  </View>;
}

const s = StyleSheet.create({
  field: { gap: 5, paddingVertical: 8 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray[700] },
  input: { minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, color: Colors.gray[900], fontSize: 15 },
  required: { borderColor: Colors.primary },
  hint: { fontSize: 12, color: Colors.gray[600] },
});
