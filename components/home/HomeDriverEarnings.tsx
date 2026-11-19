import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useGetMyDriverSettlementQuery } from '@/store/api/driverSettlementsApi';
import { useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { styles } from '@/features/home/HomeTripsSheet.styles';

export const HomeDriverEarnings = React.memo(function HomeDriverEarnings({ active, onPress, stacked = false }: {
  active: boolean; onPress: () => void; stacked?: boolean;
}) {
  const enabled = useDisplayReadsEnabled(active);
  // One small aggregate, cached for a minute; never download the earnings history on Home.
  const { data, isError } = useGetMyDriverSettlementQuery(undefined, {
    skip: !enabled, refetchOnMountOrArgChange: 60,
  });
  const amount = data?.availableBalance;
  const valid = typeof amount === 'number' && Number.isFinite(amount) && !isError;
  const currency = data?.currency === 'CDF' ? 'FC' : data?.currency;
  const label = valid ? `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency ?? ''}`.trim() : '—';
  return (
    <TouchableOpacity activeOpacity={0.8} accessibilityRole="button" onPress={onPress}
      accessibilityLabel={`Mes gains : ${valid ? label + ' disponibles' : 'voir les revenus'}`} style={[styles.metricCard, stacked && styles.stackedMetricCard]}>
      <Text style={styles.metricLabel}>Mes gains</Text>
      <Text style={styles.metricValue}>{label}</Text>
      <Text style={styles.metricHint}>{valid ? 'disponibles' : 'Voir mes revenus'}</Text>
    </TouchableOpacity>
  );
});
