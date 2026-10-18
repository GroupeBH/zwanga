import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';

type Props = { page: number; hasNext: boolean; busy: boolean; error?: boolean;
  onPrevious: () => void; onNext: () => void; onRetry: () => void };
export function HistoryPagination({ page, hasNext, busy, error, onPrevious, onNext, onRetry }: Props) {
  return <View>
    {error && <TouchableOpacity onPress={onRetry} disabled={busy} accessibilityRole="button" style={styles.button}>
      <Text style={styles.text}>Chargement impossible. Réessayer</Text>
    </TouchableOpacity>}
    <View style={styles.row}>
      <TouchableOpacity disabled={busy || page === 1} onPress={onPrevious} accessibilityRole="button"
        style={[styles.button, (busy || page === 1) && styles.disabled]}><Text style={styles.text}>Précédent</Text></TouchableOpacity>
      {busy ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.label}>Page {page}</Text>}
      <TouchableOpacity disabled={busy || !hasNext} onPress={onNext} accessibilityRole="button"
        style={[styles.button, (busy || !hasNext) && styles.disabled]}><Text style={styles.text}>Suivant</Text></TouchableOpacity>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, gap: 8 },
  button: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: Colors.gray[100] },
  text: { color: Colors.primary, fontWeight: '600' }, label: { color: Colors.gray[600] }, disabled: { opacity: 0.4 },
});
