import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import type { DriverEarning } from '@/types';
import { styles } from '@/features/screen-styles/app/driver-earnings';
import { formatAmount, formatDate } from './payoutModel';

export function DriverEarningRow({ earning }: { earning: DriverEarning }) {
  // Cash ledger entries are funded by Zwanga, never the passenger's cash receipt.
  const subsidy = earning.paymentMode === 'cash';
  const cancelled = earning.status === 'cancelled';
  const label = subsidy ? 'Participation Zwanga' :
    earning.paymentMode === 'points' ? 'Paiement en jetons' : 'Paiement électronique';
  const status = cancelled ? 'Annulé · Non crédité' : earning.status === 'paid' ? 'Versé' : 'Crédit net';
  return (
    <View style={styles.earningRow}>
      <View style={styles.earningIcon}>
        <Ionicons name={subsidy ? 'gift-outline' : 'car-outline'} size={20} color={Colors.primary} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowMeta}>{formatDate(earning.availableAt ?? earning.createdAt)}</Text>
        <Text style={styles.rowMeta}>
          {subsidy ? 'Financée par Zwanga, hors espèces reçues' : `Brut ${formatAmount(earning.grossAmount, earning.currency)}`}
        </Text>
        <Text style={[styles.earningAmount, cancelled && styles.cancelledAmount]}>
          {status} : {cancelled ? '' : '+'}{formatAmount(earning.netAmount, earning.currency)}
        </Text>
      </View>
    </View>
  );
}
