import { memo } from 'react';
import { Text, View } from 'react-native';
import { styles } from '@/features/screen-styles/components/PassengerArrivalPaymentCoordinator';
import { formatMoney, formatPoints, getPaymentModeLabel } from './paymentModel';
import type { PaymentCompletionSummary } from './paymentTypes';

/** Receipt details live in the payment sheet, never in another modal. */
export const ArrivalPaymentReceipt = memo(function ArrivalPaymentReceipt({ summary }: { summary: PaymentCompletionSummary }) {
  const rows = [
    ['Moyen de paiement', summary.mixedTokenAmount ? 'Jetons + espèces' : summary.amount === 0 ? 'Aucun (trajet gratuit)' : getPaymentModeLabel(summary.mode, summary.channel)],
    ...(summary.mixedTokenAmount ? [
      ['Déjà réglé en jetons', `${formatPoints(summary.mixedTokenQuantity ?? 0)} · ${formatMoney(summary.mixedTokenAmount, summary.currency)}`],
      [summary.cashInstructions ? 'À remettre au conducteur' : 'Espèces reçues', formatMoney(summary.cashRemainder ?? 0, summary.currency)],
    ] : []),
    ...(summary.mode === 'points' ? [['Solde de jetons', summary.walletBalance === null ? 'Actualisation en cours' : formatPoints(summary.walletBalance)]] : []),
    ...(!summary.cashInstructions ? [['Jetons gagnés', summary.earnedPointsKnown ? formatPoints(summary.earnedPoints)
      : summary.beforeArrival ? 'Calculés à l’arrivée' : 'Calcul en cours']] : []),
    ...(summary.paymentReference ? [['Référence', summary.paymentReference]] : []),
  ];
  return <View>
    <Text style={styles.amountHint}>{summary.driverNotice}</Text>
    <View style={styles.summaryRows}>
      {rows.map(([label, value]) => <View key={label} style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text selectable style={styles.summaryValue}>{value}</Text>
      </View>)}
    </View>
  </View>;
});
