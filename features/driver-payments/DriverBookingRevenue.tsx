import { Colors } from '@/constants/styles';
import { useGetDriverBookingRevenueSummaryQuery } from '@/store/api/driverSettlementsApi';
import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getTripRevenueRows } from './tripRevenuePresentation';

/** One shared RTK read, only while visible. No GPS, polling, payment or new modal. */
export const DriverBookingRevenue = memo(function DriverBookingRevenue({ bookingId, active, cashReceived = false }: {
  bookingId: string;
  active: boolean;
  cashReceived?: boolean;
}) {
  const { currentData, isFetching, isError, refetch } = useGetDriverBookingRevenueSummaryQuery(bookingId, {
    skip: !active || !bookingId,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  // Never show another passenger's cached receipt during a selection change.
  const summary = currentData?.bookingId === bookingId ? currentData : undefined;
  const rows = summary?.dropoffConfirmed ? getTripRevenueRows(summary) : [];
  const format = (amount: number) => `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${summary?.currency ?? 'CDF'}`;
  return <View style={styles.receipt}>
    {summary?.dropoffConfirmed ? <>
      <View style={styles.row}>
        <Text style={styles.heading}>Total pour ce passager</Text>
        <Text style={styles.total}>{format(summary.totalExpectedAmount)}</Text>
      </View>
      {rows.map(row => <View key={row.key} style={styles.row}>
        <Text style={styles.label}>{row.key === 'cash' && cashReceived ? 'Cash reçu' : row.label}</Text>
        <Text style={[styles.amount, row.key === 'cash' ? styles.cash : row.key === 'confirmed' ? styles.confirmed : null]}>
          {format(row.amount)}
        </Text>
      </View>)}
      <Text style={styles.hint}>{rows.some(row => row.key === 'cash')
        ? cashReceived ? 'Le cash a été reçu directement du passager, pas dans votre solde de revenus.'
          : 'Le cash est à recevoir du passager, pas dans votre solde de revenus.'
        : summary.totalExpectedAmount > 0 ? 'Seuls les gains crédités sont enregistrés dans vos revenus.'
          : 'Aucun gain à encaisser pour cette réservation.'}</Text>
    </> : <Text style={styles.hint}>{isError
      ? 'Le gain de ce passager est indisponible pour le moment. Réessayez avec une connexion.'
      : summary ? 'Le serveur n’a pas encore confirmé cette dépose. Aucun gain confirmé pour le moment.'
        : 'Vérification du gain de ce passager…'}</Text>}
    {isError && summary && <Text style={styles.hint}>Actualisation impossible. Les derniers montants connus sont affichés.</Text>}
    <TouchableOpacity style={styles.refresh} disabled={!active || isFetching} onPress={() => void refetch()}
      accessibilityRole="button" accessibilityLabel="Actualiser le gain de ce passager">
      {isFetching ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.refreshText}>Actualiser le gain</Text>}
    </TouchableOpacity>
  </View>;
});

const styles = StyleSheet.create({
  receipt: { gap: 6, paddingTop: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  heading: { fontSize: 13, fontWeight: '700', color: Colors.gray[800], flexShrink: 1 },
  total: { fontSize: 18, fontWeight: '800', color: Colors.gray[900] },
  label: { fontSize: 12, color: Colors.gray[700], flexShrink: 1 },
  amount: { fontSize: 13, fontWeight: '700', color: Colors.gray[800] },
  cash: { color: Colors.primaryDark },
  confirmed: { color: Colors.successDark },
  hint: { color: Colors.gray[600], fontSize: 11, lineHeight: 16 },
  refresh: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 4 },
  refreshText: { color: Colors.primaryDark, fontSize: 12, fontWeight: '600' },
});
