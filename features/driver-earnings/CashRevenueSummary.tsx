import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '@/features/screen-styles/app/driver-earnings';
import { formatAmount } from './payoutModel';

type Props = { amount?: number; currency: string };

export function CashRevenueSummary({ amount, currency }: Props) {
  const hasTotal = typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;
  return (
    <View style={styles.cashSection}>
      <Text style={styles.rowTitle}>Cash reçu des passagers</Text>
      <Text style={styles.cashAmount} testID="driver-cash-received">
        {hasTotal ? formatAmount(amount, currency) : '—'}
      </Text>
      <Text style={styles.cashLabel}>Non retirable · Déjà reçu en espèces</Text>
      <Text style={styles.rowMeta}>
        {hasTotal
          ? 'Total des réceptions confirmées par vous, pour votre suivi et celui de Zwanga. Exclu du solde retirable.'
          : 'Le total cash est indisponible. Les espèces reçues restent exclues du solde retirable.'}
      </Text>
    </View>
  );
}
