import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '@/features/screen-styles/app/driver-earnings';
import { formatAmount } from './payoutModel';

type Props = { amount?: number; currency: string };

export function CashRevenueSummary({ amount, currency }: Props) {
  const hasTotal = typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;
  return (
    <View style={styles.cashSection}>
      <View style={styles.cashHeading}><Text style={styles.rowTitle}>Cash reçu des passagers</Text>
      <Text style={styles.cashAmount} testID="driver-cash-received">
        {hasTotal ? formatAmount(amount, currency) : '—'}
      </Text></View>
      <Text style={styles.rowMeta}>
        {hasTotal
          ? 'Déjà reçu et confirmé · Non retirable'
          : 'Total indisponible · Hors solde retirable'}
      </Text>
    </View>
  );
}
