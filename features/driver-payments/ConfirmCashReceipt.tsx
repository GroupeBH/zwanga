import { Colors } from '@/constants/styles';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useConfirmCashReceiptMutation } from '@/store/api/bookingApi';
import { useAppSelector } from '@/store/hooks';
import type { Booking } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatMoney, normalizeAmount } from './paymentNoticeModel';

/** Explicit receipt, never a dropoff confirmation, electronic payment or revenue credit. */
export function ConfirmCashReceipt({ booking }: { booking: Booking }) {
  const userId = useAppSelector(state => state.auth.user?.id);
  return <CashReceiptSession key={`${userId}:${booking.id}`} booking={booking} />;
}

function CashReceiptSession({ booking }: { booking: Booking }) {
  const [confirm, { isLoading }] = useConfirmCashReceiptMutation();
  const active = useScreenIsActive();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [received, setReceived] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const amount = normalizeAmount(booking.paymentAmount);
  if (booking.status !== 'completed' || !booking.droppedOff || booking.paymentMode !== 'cash'
    || !amount || !['CDF', 'USD'].includes(booking.paymentCurrency ?? '')) return null;
  if (booking.cashReceivedAt || received) return <Text style={styles.received}>Cash reçu confirmé · {formatMoney(amount, booking.paymentCurrency)}</Text>;
  const submit = async () => {
    if (busy.current || !activeRef.current || !alive.current) return;
    busy.current = true; setError('');
    try {
      const result = await confirm({ bookingId: booking.id, amount, currency: booking.paymentCurrency! }).unwrap();
      if (alive.current && activeRef.current) {
        if (result.cashReceivedAt) { setReceived(true); setConfirming(false); }
        else setError('La confirmation n’a pas été enregistrée. Actualisez le trajet puis réessayez.');
      }
    } catch (failure) {
      if (alive.current && activeRef.current) setError(getApiErrorMessage(failure, 'Impossible de confirmer le cash reçu. Réessayez avec une connexion.'));
    } finally { busy.current = false; }
  };
  return <View style={styles.box}>
    {confirming && <Text style={styles.hint}>Confirmez uniquement si vous avez reçu {formatMoney(amount, booking.paymentCurrency)} du passager. Aucun montant ne sera ajouté au solde de revenus.</Text>}
    {Boolean(error) && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    <View style={styles.actions}>
      {confirming && <TouchableOpacity style={styles.button} accessibilityRole="button" disabled={isLoading} onPress={() => setConfirming(false)}>
        <Text style={styles.label}>Pas encore</Text>
      </TouchableOpacity>}
      <TouchableOpacity style={[styles.button, styles.primary]} accessibilityRole="button" disabled={!active || isLoading}
        accessibilityState={{ disabled: !active || isLoading, busy: isLoading }}
        onPress={confirming ? () => void submit() : () => setConfirming(true)}>
        {isLoading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryLabel}>
          {confirming ? 'Oui, cash reçu' : `Confirmer le cash reçu · ${formatMoney(amount, booking.paymentCurrency)}`}
        </Text>}
      </TouchableOpacity>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  box: { gap: 6, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { minHeight: 44, padding: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray[100] },
  primary: { flex: 1, minWidth: 150, backgroundColor: Colors.primary },
  label: { color: Colors.gray[800], fontSize: 12, fontWeight: '600' },
  primaryLabel: { color: Colors.white, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  hint: { color: Colors.gray[700], fontSize: 12, lineHeight: 18 },
  error: { color: Colors.danger, fontSize: 12 },
  received: { color: Colors.successDark, fontSize: 12, fontWeight: '600', marginTop: 8 },
});
