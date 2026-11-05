import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '@/constants/styles';
import { bookingProposalError } from './bookingPriceProposal';

type Props = { listedPrice: number; seats: number; value: string; onChange: (value: string) => void; disabled: boolean };

export function BookingPriceProposalField({ listedPrice, seats, value, onChange, disabled }: Props) {
  const [editing, setEditing] = useState(Boolean(value));
  if (!(listedPrice > 0)) return null;
  const error = value ? bookingProposalError(value, listedPrice, seats) : null;
  return <View style={styles.container}>
    <Text style={styles.hint}>Prix affiché : {listedPrice.toLocaleString('fr-FR')} FC par place</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: editing, disabled }}
      disabled={disabled} style={styles.toggle} onPress={() => { setEditing(!editing); onChange(''); }}>
      <Text style={styles.action}>{editing ? 'Garder le prix affiché' : 'Proposer mon prix'}</Text>
    </Pressable>
    {editing && <>
      <Text style={styles.label}>Combien pouvez-vous payer par place ?</Text>
      <View style={styles.inputRow}>
        <TextInput accessibilityLabel="Mon prix par place en francs congolais" keyboardType="number-pad"
          placeholder="Ex. 2000" placeholderTextColor={Colors.gray[500]} maxLength={8}
          value={value} onChangeText={onChange} editable={!disabled} style={styles.input} />
        <Text style={styles.label}>FC / place</Text>
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>Le conducteur pourra accepter ou refuser. Aucun paiement maintenant.</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 8, marginVertical: 12 },
  hint: { fontSize: 13, lineHeight: 19, color: Colors.gray[600] },
  label: { fontSize: 14, color: Colors.gray[800], fontWeight: '600' },
  toggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  action: { fontSize: 15, fontWeight: '700', color: Colors.primaryDark },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1,
    borderColor: Colors.gray[300], borderRadius: 12, paddingHorizontal: 12 },
  input: { flex: 1, minHeight: 48, fontSize: 20, color: Colors.gray[900] },
  error: { color: Colors.danger, fontSize: 13, lineHeight: 18 },
});
