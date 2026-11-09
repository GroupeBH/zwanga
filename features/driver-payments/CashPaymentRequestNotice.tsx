import React, { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';
import { formatMoney, type DriverPaymentNotice } from './paymentNoticeModel';
import { useCashReceiptConfirmation } from './useCashReceiptConfirmation';

export function CashPaymentRequestNotice({ notice, active, onConfirmed, onClose, onBusyChange }: {
  notice: DriverPaymentNotice; active: boolean; onConfirmed: () => void; onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const receipt = useCashReceiptConfirmation(notice.bookingId, notice.amount, notice.currency, active);
  useEffect(() => { onBusyChange?.(receipt.busy); return () => onBusyChange?.(false); }, [onBusyChange, receipt.busy]);
  return <View style={styles.sheet}>
    <ScrollView bounces={false} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Avez-vous reçu le cash ?</Text>
      <Text style={styles.amount}>{formatMoney(notice.amount, notice.currency)}</Text>
      <Text style={styles.message}>{notice.passengerName === 'un passager' ? 'Le passager' : notice.passengerName} indique avoir payé en cash.</Text>
      <Text style={styles.hint}>Confirmez seulement quand l’argent est entre vos mains.</Text>
      {!!receipt.error && <Text style={styles.error} accessibilityRole="alert">{receipt.error}</Text>}
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: receipt.busy || !active, busy: receipt.busy }}
        disabled={receipt.busy || !active} style={[styles.primary, receipt.busy && styles.disabled]}
        onPress={async () => { if (await receipt.submit()) onConfirmed(); }}>
        {receipt.busy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryText}>J’ai reçu le cash</Text>}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={receipt.busy} onPress={onClose} style={styles.secondary}>
        <Text style={styles.secondaryText}>Pas encore</Text>
      </TouchableOpacity>
      <Text style={styles.footnote}>Vous pourrez aussi confirmer depuis les paiements du trajet.</Text>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  sheet: { width: '100%', maxWidth: 420, maxHeight: '90%', borderRadius: 24, backgroundColor: Colors.white, overflow: 'hidden' },
  content: { padding: 24, gap: 14, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.gray[900], textAlign: 'center' },
  amount: { fontSize: 32, fontWeight: '700', color: Colors.gray[900], textAlign: 'center' },
  message: { fontSize: 16, lineHeight: 23, color: Colors.gray[800], textAlign: 'center' },
  hint: { fontSize: 14, lineHeight: 21, color: Colors.gray[600], textAlign: 'center' },
  footnote: { fontSize: 12, lineHeight: 18, color: Colors.gray[600], textAlign: 'center' },
  primary: { width: '100%', minHeight: 52, padding: 12, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.white, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  secondary: { width: '100%', minHeight: 48, padding: 10, borderRadius: 14, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, color: Colors.gray[800], fontWeight: '600' },
  disabled: { opacity: 0.6 },
  error: { color: Colors.dangerDark, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
