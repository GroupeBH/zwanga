import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTripPaymentOptionsQuery } from '@/store/api/driverFinanceApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { Colors } from '@/constants/styles';
import type { Trip, TripPaymentMode } from '@/types';
import { TRIP_PAYMENT_MODE_OPTIONS } from './tripDetailModel';

export function BookingPaymentChoices({ trip, seats, total, value, onChange, busy, visible }: {
  trip?: Trip; seats: string; total: number; value: TripPaymentMode;
  onChange: (mode: TripPaymentMode) => void; busy: boolean; visible: boolean;
}) {
  const active = useScreenIsActive() && visible;
  const { currentData: options, isFetching, isError, refetch } = useTripPaymentOptionsQuery(
    { tripId: trip?.id ?? '', numberOfSeats: Math.max(1, Number(seats) || 1) },
    { skip: !active || !trip?.id || total <= 0, refetchOnMountOrArgChange: true },
  );
  if (total <= 0) return null;
  // The dedicated endpoint is authoritative; the trip snapshot can be older.
  const accepted = options?.acceptedPaymentModes ?? trip?.acceptedPaymentModes ?? ['cash', 'electronic', 'points'];
  const available = !isError && !isFetching ? (options?.availablePaymentModes ?? [])
    .filter(mode => accepted.includes(mode) && TRIP_PAYMENT_MODE_OPTIONS.some(option => option.id === mode)) : [];
  const empty = Boolean(options && !isFetching && !isError && available.length === 0);
  return <View style={s.section}>
    <View style={s.heading}><Text style={s.title}>Mode de paiement</Text>
      {isFetching && <ActivityIndicator color={Colors.primary} size="small" />}</View>
    <View style={s.choices} accessibilityRole="radiogroup">
      {TRIP_PAYMENT_MODE_OPTIONS.filter(option => accepted.includes(option.id)).map(option => {
        const label = option.id === 'electronic' ? 'Mobile Money' : option.id === 'points' ? 'Jetons' : 'Cash';
        const enabled = active && !busy && available.includes(option.id);
        const selected = available.includes(option.id) && value === option.id;
        return <TouchableOpacity key={option.id} accessibilityRole="radio" accessibilityLabel={label}
          accessibilityState={{ checked: selected, disabled: !enabled }} disabled={!enabled}
          onPress={() => onChange(option.id)} style={[s.choice, selected && s.selected, !enabled && s.disabled]}>
          <Ionicons name={selected ? 'checkmark-circle' : option.icon} size={18} color={selected ? Colors.primary : Colors.gray[700]} />
          <Text style={[s.label, selected && s.selectedLabel]}>{label}</Text>
        </TouchableOpacity>;
      })}
    </View>
    {isError || empty ? <View style={s.heading}>
      <Text style={[s.hint, s.copy]}>{isError ? 'Vérification indisponible.' : 'Aucun mode disponible pour ce trajet.'}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Réessayer les modes de paiement"
        disabled={!active || busy || isFetching} onPress={() => { void refetch(); }} style={s.retry}>
        <Text style={s.selectedLabel}>Réessayer</Text></TouchableOpacity>
    </View> : !isFetching && options && !available.includes(value)
      ? <Text style={s.hint}>Choisissez une option disponible.</Text> : null}
    {!!options?.cashUnavailableReason && !isError && <Text style={s.hint}>{options.cashUnavailableReason}</Text>}
  </View>;
}

const s = StyleSheet.create({
  section: { gap: 6, flexShrink: 0 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { color: Colors.gray[900], fontSize: 14, fontWeight: '600' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], maxWidth: '100%' },
  selected: { borderColor: Colors.primary, backgroundColor: '#FFF3EB' },
  label: { color: Colors.gray[800], fontSize: 13, fontWeight: '600', flexShrink: 1 },
  selectedLabel: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.5 }, hint: { color: Colors.gray[600], fontSize: 12, lineHeight: 17 },
  copy: { flex: 1 }, retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
});
