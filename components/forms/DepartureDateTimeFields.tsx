import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';

export function DepartureDateTimeFields({ dateLabel, timeLabel, hasChosenTime, onOpen }: {
  dateLabel: string; timeLabel: string; hasChosenTime: boolean; onOpen: (mode: 'date' | 'time') => void;
}) {
  return <View style={styles.fields}>
    {(['date', 'time'] as const).map(mode => <TouchableOpacity key={mode}
      style={[styles.field, mode === 'date' ? styles.dateField : styles.timeField]}
      onPress={() => onOpen(mode)} activeOpacity={0.75} accessibilityRole="button"
      accessibilityLabel={mode === 'date' ? `Date de départ : ${dateLabel}` : `Heure de départ : ${timeLabel}`}
      accessibilityHint={mode === 'date' ? 'Ouvrir le calendrier' : 'Ouvrir le choix de l’heure'}>
      <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={20} color={Colors.primary} />
      <View style={styles.copy}>
        <Text style={styles.label}>{mode === 'date' ? 'Date' : 'Heure'}</Text>
        <Text style={[styles.value, mode === 'time' && !hasChosenTime && styles.placeholder]}>
          {mode === 'date' ? dateLabel : timeLabel}
        </Text>
      </View>
      <Ionicons name="chevron-down" size={15} color={Colors.gray[500]} />
    </TouchableOpacity>)}
  </View>;
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { flexGrow: 1, minHeight: 64, borderRadius: 12, padding: 12, flexDirection: 'row',
    alignItems: 'center', gap: 8, backgroundColor: Colors.gray[50] },
  dateField: { flexBasis: 150 }, timeField: { flexBasis: 130 },
  copy: { flex: 1, minWidth: 0 }, label: { fontSize: 12, color: Colors.gray[600], marginBottom: 3 },
  value: { fontSize: 15, fontWeight: '600', color: Colors.gray[900] }, placeholder: { color: Colors.primaryDark },
});
