import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useGetMyDriverSettlementQuery } from '@/store/api/driverSettlementsApi';
import { useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { styles } from '@/features/home/HomeTripsSheet.styles';

export const HomeDriverEarnings = React.memo(function HomeDriverEarnings({ active, onPress }: {
  active: boolean; onPress: () => void;
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
      accessibilityLabel={`Mes gains : ${valid ? label + ' disponibles' : 'voir les revenus'}`} style={styles.metricCard}>
      <Text style={styles.metricLabel}>Mes gains</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{label}</Text>
      <Text style={styles.metricHint}>{valid ? 'disponibles' : 'Voir mes revenus'}</Text>
    </TouchableOpacity>
  );
});
