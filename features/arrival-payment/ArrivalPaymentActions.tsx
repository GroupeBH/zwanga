import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Keyboard, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontSizes, Spacing } from '@/constants/styles';
import { styles } from '@/features/screen-styles/components/PassengerArrivalPaymentCoordinator/index';
import type { PaymentVerification } from '@/hooks/arrival-payment/useArrivalPaymentMonitoring';
import type { TripPaymentMode } from '@/types';
import type { PaymentCompletionSummary } from './paymentTypes';

type Props = {
  completionSummary?: PaymentCompletionSummary | null;
  onDone?: () => void;
  onInvoice?: () => void;
  closeLabel?: string;
  isBusy: boolean;
  hasPendingProviderPayment: boolean;
  paymentAlreadySucceeded: boolean;
  selectedMode: TripPaymentMode | null;
  actionLabel: string;
  isPayButtonDisabled: boolean;
  verification: PaymentVerification;
  paymentError?: string;
  onPay: () => Promise<void>;
  onRetry: () => void;
  onClose: () => void;
};

/** Recovery and exit stay visible, outside the scrollable payment form. */
export function ArrivalPaymentActions(props: Props) {
  if (props.completionSummary) return <View style={local.footer}>
    <TouchableOpacity accessibilityRole="button" style={styles.payButton} onPress={props.onDone}>
      <Ionicons name="checkmark" size={20} color={Colors.white} />
      <Text style={styles.payButtonText}>{props.completionSummary.beforeArrival ? 'Continuer le trajet' : 'Terminer'}</Text>
    </TouchableOpacity>
    {props.completionSummary.invoiceUrl && <TouchableOpacity accessibilityRole="button" style={local.secondary} onPress={props.onInvoice}>
      <Ionicons name="receipt-outline" size={18} color={Colors.primary} />
      <Text style={styles.invoiceButtonText}>Voir la facture</Text>
    </TouchableOpacity>}
  </View>;
  const pending = props.hasPendingProviderPayment && !props.paymentAlreadySucceeded;
  const paused = props.verification.phase === 'paused';
  const disabled = pending ? props.isBusy || !paused : props.isPayButtonDisabled;
  const label = props.isBusy ? props.selectedMode === 'cash' && !pending ? 'Enregistrement…' : 'Vérification…' : pending
    ? paused ? 'Vérifier à nouveau' : 'En attente de confirmation' : props.actionLabel;
  return <View style={local.footer}>
    {!pending && props.paymentError ? (
      <View style={[local.notice, local.warning]} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Ionicons name="alert-circle-outline" size={20} color={Colors.dangerDark} />
        <Text style={local.noticeText}>{props.paymentError}</Text>
      </View>
    ) : null}
    {pending && props.verification.message ? (
      <View style={[local.notice, paused && local.warning]} accessibilityLiveRegion="polite">
        <Ionicons name={paused ? 'alert-circle-outline' : 'information-circle-outline'}
          size={20} color={paused ? Colors.dangerDark : Colors.infoDark} />
        <Text style={local.noticeText}>{props.verification.message}</Text>
      </View>
    ) : null}
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled, busy: props.isBusy }}
      activeOpacity={0.88} disabled={disabled}
      style={[styles.payButton, disabled && styles.payButtonDisabled]}
      onPress={() => { if (disabled) return; Keyboard.dismiss(); if (pending) props.onRetry(); else void props.onPay(); }}>
      {props.isBusy ? <ActivityIndicator size="small" color={Colors.white} /> : (
        <Ionicons name={pending ? 'refresh' : props.paymentAlreadySucceeded ? 'checkmark' : props.selectedMode === 'cash' ? 'cash' : 'lock-closed'}
          size={20} color={Colors.white} />
      )}
      <Text style={styles.payButtonText}>{label}</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={local.secondary}
      onPress={() => { Keyboard.dismiss(); props.onClose(); }}>
      <Text style={styles.invoiceButtonText}>{props.closeLabel ?? 'Fermer et reprendre plus tard'}</Text>
    </TouchableOpacity>
  </View>;
}

const local = StyleSheet.create({
  footer: { flexShrink: 0, paddingTop: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray[200] },
  secondary: { minHeight: 44, paddingVertical: Spacing.sm, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.sm,
    backgroundColor: Colors.gray[50], borderRadius: 12, marginBottom: Spacing.sm },
  warning: { backgroundColor: '#FFF5F0' },
  noticeText: { flex: 1, color: Colors.gray[700], fontSize: FontSizes.sm },
});
