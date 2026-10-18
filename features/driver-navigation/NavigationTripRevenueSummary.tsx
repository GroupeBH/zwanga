import { Colors } from '@/constants/styles';
import type { DriverTripRevenueSummary } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { getTripRevenueRows } from '../driver-payments/tripRevenuePresentation';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { formatTripRevenueAmount } from './navigationPresentation';

const tones = {
  success: { background: Colors.success + '18', foreground: Colors.successDark },
  warning: { background: Colors.warning + '18', foreground: Colors.warningDark },
  info: { background: Colors.info + '18', foreground: Colors.infoDark },
};

export function NavigationTripRevenueSummary({ summary }: { summary: DriverTripRevenueSummary }) {
  const rows = getTripRevenueRows(summary);
  return (
    <View style={styles.tripRevenueSummary}>
      {rows.map(row => (
        <View key={row.key} style={styles.tripRevenueRow}>
          <View style={[styles.tripRevenueIcon, { backgroundColor: tones[row.tone].background }]}>
            <Ionicons name={row.icon} size={20} color={tones[row.tone].foreground} />
          </View>
          <View style={styles.tripRevenueCopy}>
            <Text style={styles.tripRevenueLabel}>{row.label}</Text>
            <Text style={styles.tripRevenueHint}>{row.hint}</Text>
          </View>
          <Text style={[styles.tripRevenueAmount, { color: tones[row.tone].foreground }]}>
            {formatTripRevenueAmount(row.amount, summary.currency)}
          </Text>
        </View>
      ))}
      {rows.length === 0 ? (
        <View style={styles.tripRevenueEmpty}>
          <Ionicons name="checkmark-circle-outline" size={20} color={Colors.gray[500]} />
          <Text style={styles.tripRevenueHint}>
            {summary.totalExpectedAmount <= 0 ? 'Aucun montant à encaisser pour ce trajet.' : 'Consultez Revenus pour vérifier le bilan de ce trajet.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
