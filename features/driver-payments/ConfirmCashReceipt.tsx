import { Colors } from '@/constants/styles';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import type { Booking } from '@/types';
import React from 'react';
import { useCashExceptionDisclosure } from './useCashExceptionDisclosure';
import { CashExceptionDisclosure } from './CashExceptionDisclosure';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatMoney, normalizeAmount } from './paymentNoticeModel';
import { driverPaymentAnnouncement } from '@/features/arrival-payment/paymentAnnouncement';
import { usePaymentAnnouncement } from '@/hooks/notifications/usePaymentAnnouncement';
import { useCashReceiptConfirmation } from './useCashReceiptConfirmation';

/** Explicit receipt, never a dropoff confirmation, electronic payment or revenue credit. */
export function ConfirmCashReceipt({ booking, announce = false }: { booking: Booking; announce?: boolean }) {
  const userId = useAppSelector(state => state.auth.user?.id);
  return <CashReceiptSession key={`${userId}:${booking.id}`} booking={booking} announce={announce} />;
}

function CashReceiptSession({ booking, announce }: { booking: Booking; announce: boolean }) {
  const active = useScreenIsActive();
  const disclosure = useCashExceptionDisclosure(booking.id, active && !booking.cashReceivedAt);
  const { canConfirm, exception } = disclosure;
  const amount = normalizeAmount(booking.paymentAmount);
  const { submit, busy: isLoading, error, received } = useCashReceiptConfirmation(booking.id, amount, booking.paymentCurrency ?? '', active, exception?.occurrence, disclosure.refresh, canConfirm);
  const eligible = booking.status === 'completed' && booking.droppedOff && booking.paymentMode === 'cash'
    && Boolean(amount) && ['CDF', 'USD'].includes(booking.paymentCurrency ?? '');
  usePaymentAnnouncement(eligible ? driverPaymentAnnouncement({ bookingId: booking.id, amount: amount!,
    currency: booking.paymentCurrency!, mode: 'cash' }, Boolean(booking.cashReceivedAt || received)) : null,
  active && Boolean(eligible) && (announce || received));
  if (!eligible || amount === null) return null;
  if (booking.cashReceivedAt || received) return <Text style={styles.received}>Cash reçu confirmé · {formatMoney(amount, booking.paymentCurrency)}</Text>;
  return <View style={styles.box}>
    <CashExceptionDisclosure disclosure={disclosure} busy={isLoading} />
    {booking.mixedPaymentAt && <Text style={styles.hint}>
      Déjà réglé en jetons : {formatMoney(Number(booking.mixedTokenAmount), booking.paymentCurrency)}. Reste en cash : {formatMoney(amount, booking.paymentCurrency)}.
    </Text>}
    <Text style={styles.hint}>Confirmez uniquement après avoir reçu {formatMoney(amount, booking.paymentCurrency)} du passager.</Text>
    {Boolean(error) && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    <View style={styles.actions}>
      <TouchableOpacity style={[styles.button, styles.primary, !canConfirm && { opacity: 0.5 }]} accessibilityRole="button" disabled={!active || !canConfirm || isLoading}
        accessibilityState={{ disabled: !active || !canConfirm || isLoading, busy: isLoading }}
        onPress={() => void submit()}>
        {isLoading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryLabel}>
          J’ai reçu le cash · {formatMoney(amount, booking.paymentCurrency)}
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
  primaryLabel: { color: Colors.white, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  hint: { color: Colors.gray[700], fontSize: 12, lineHeight: 18 },
  error: { color: Colors.danger, fontSize: 12 },
  received: { color: Colors.successDark, fontSize: 12, fontWeight: '600', marginTop: 8 },
});
