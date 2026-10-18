import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';

export function PublishPassengerOptions({ requiresPassengerKyc, setRequiresPassengerKyc, description, setDescription }: {
  requiresPassengerKyc: boolean;
  setRequiresPassengerKyc: React.Dispatch<React.SetStateAction<boolean>>;
  description: string;
  setDescription: React.Dispatch<React.SetStateAction<string>>;
}) {
  const [noteExpanded, setNoteExpanded] = useState(Boolean(description));
  return <View style={s.container}>
    <View style={s.row}>
      <View style={s.copy}>
        <Text style={s.label}>Passagers vérifiés uniquement</Text>
        {requiresPassengerKyc && <Text style={s.hint}>Identité vérifiée avant réservation ou embarquement.</Text>}
      </View>
      <Switch accessibilityLabel="Passagers vérifiés uniquement" value={requiresPassengerKyc}
        onValueChange={setRequiresPassengerKyc} trackColor={{ false: Colors.gray[300], true: Colors.primary }} />
    </View>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: noteExpanded }} style={s.noteButton}
      onPress={() => setNoteExpanded(current => !current)} activeOpacity={0.7}>
      <Text style={s.noteLabel}>{description ? 'Note aux passagers' : 'Ajouter une note (facultatif)'}</Text>
      <Text style={s.noteLabel} accessible={false}>{noteExpanded ? '−' : '+'}</Text>
    </TouchableOpacity>
    {noteExpanded && <TextInput accessibilityLabel="Note aux passagers, facultative" style={s.input}
      placeholder="Bagages, rendez-vous…" placeholderTextColor={Colors.gray[500]} value={description}
      onChangeText={setDescription} multiline numberOfLines={2} textAlignVertical="top" />}
  </View>;
}
const s = StyleSheet.create({
  container: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.gray[300], paddingTop: 8, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  copy: { flex: 1 }, label: { fontSize: 14, fontWeight: '600', color: Colors.gray[900] },
  hint: { fontSize: 12, lineHeight: 18, color: Colors.gray[600], marginTop: 3 },
  noteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  noteLabel: { fontSize: 13, color: Colors.primaryDark, fontWeight: '600', flexShrink: 1 },
  input: { minHeight: 76, backgroundColor: Colors.white, borderRadius: 10, padding: 12, fontSize: 14, lineHeight: 20, color: Colors.gray[900] },
});
