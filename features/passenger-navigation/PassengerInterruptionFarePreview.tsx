import { Colors } from '@/constants/styles';
import { useGetPassengerInterruptionFarePreviewQuery } from '@/store/api/bookingApi';
import type { Booking } from '@/types';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { getInterruptionFareBase, isValidPassengerFarePreview } from './interruptionFarePreview';

interface Props {
  booking: Booking;
  coordinates: { latitude: number; longitude: number } | null;
}
const numbers = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const money = (amount: number) => `${numbers.format(amount)} FC`;

/** Content of the existing ride dialog; no extra native modal or GPS subscription. */
export function PassengerInterruptionFarePreview({ booking, coordinates }: Props) {
  const { height } = useWindowDimensions();
  const base = getInterruptionFareBase(booking);
  const { currentData, isFetching, isError, refetch } = useGetPassengerInterruptionFarePreviewQuery(
    { bookingId: booking.id, coordinates },
    { skip: base.initialAmount === 0, refetchOnMountOrArgChange: true, refetchOnFocus: false, refetchOnReconnect: false },
  );
  const quote = !isFetching && !isError && isValidPassengerFarePreview(currentData, booking.id) ? currentData : null;
  const minimum = quote?.minimumAmount ?? base.minimumAmount;
  const initial = quote?.originalPassengerAmount ?? base.initialAmount;

  return <ScrollView style={{ maxHeight: height * 0.32 }} contentContainerStyle={styles.content} bounces={false}>
    <Text style={styles.explanation}>Le conducteur devra confirmer votre descente. Aucun paiement n’est déclenché par cette demande.</Text>
    {booking.numberOfSeats > 1 && <Text style={styles.explanation}>Vous demandez la descente pour les {booking.numberOfSeats} personnes de votre réservation, pas pour les autres passagers du trajet.</Text>}
    <View style={styles.base}>
      <Text style={styles.label}>{minimum === null ? 'Minimum standard, plafonné au prix initial' : 'Minimum pour votre réservation'}</Text>
      <Text style={styles.minimum}>{minimum === null ? '1 500 FC' : minimum === 0 ? 'Gratuit' : money(minimum)}</Text>
      {initial !== null && <Text style={styles.detail}>Prix initial : {money(initial)} · total pour {booking.numberOfSeats} place{booking.numberOfSeats > 1 ? 's' : ''}</Text>}
      <Text style={styles.detail}>{initial === 0 ? 'Votre trajet reste gratuit.' : 'Ce minimum est inclus dans le prix, pas ajouté. Il ne dépasse jamais votre prix initial.'}</Text>
    </View>
    {initial !== 0 && <View style={styles.estimate}>
      <Text style={styles.label}>Montant estimé si vous descendez ici</Text>
      {quote ? <>
        <Text style={styles.amount}>{money(quote.passengerAmount)}</Text>
        <Text style={styles.detail}>{numbers.format(quote.travelledDistanceMeters / 1000)} km sur {numbers.format(quote.plannedDistanceMeters / 1000)} km · {numbers.format(quote.travelledPercentage)} %</Text>
        {quote.prepaidAmount > 0 && <Text style={styles.detail}>Déjà payé : {money(quote.prepaidAmount)}. L’éventuelle différence sera créditée en jetons, sans second paiement.</Text>}
        <Text style={styles.detail}>Le montant final dépendra de la position transmise avec votre demande.</Text>
      </> : isFetching ? <View style={styles.loading}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.detail}>Calcul selon la distance parcourue…</Text>
      </View> : <>
        <Text style={styles.detail}>Estimation indisponible. Le montant sera calculé à la confirmation, selon la distance parcourue et ce minimum. Vous pouvez quand même demander à descendre.</Text>
        <TouchableOpacity onPress={() => void refetch()} accessibilityRole="button" style={styles.retry}>
          <Text style={styles.retryText}>Réessayer le calcul</Text>
        </TouchableOpacity>
      </>}
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 4 },
  explanation: { color: Colors.gray[600], fontSize: 14, lineHeight: 20 },
  base: { padding: 12, borderRadius: 14, backgroundColor: Colors.gray[100], gap: 5 },
  label: { color: Colors.gray[700], fontSize: 13, fontWeight: '600' },
  minimum: { color: Colors.gray[900], fontSize: 20, fontWeight: '700' },
  detail: { color: Colors.gray[600], fontSize: 12, lineHeight: 18 },
  estimate: { gap: 5 },
  amount: { color: Colors.gray[900], fontSize: 26, fontWeight: '800' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  retry: { minHeight: 44, justifyContent: 'center' },
  retryText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
});
