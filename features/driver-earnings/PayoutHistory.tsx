import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import type { DriverPayout, DriverPayoutStatus } from '@/types';
import { styles } from '@/features/screen-styles/app/driver-earnings';
import { formatAmount, formatDate, getPayoutMessage, isPayoutPending, maskPhone } from './payoutModel';
import { historyStyles } from './PayoutHistory.styles';

const STATUS: Record<DriverPayoutStatus, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  pending: { label: 'Confirmation en attente', icon: 'time-outline', color: Colors.warningDark },
  initiated: { label: 'Versement en cours', icon: 'sync-outline', color: Colors.infoDark },
  succeeded: { label: 'Versé', icon: 'checkmark-circle-outline', color: Colors.successDark },
  failed: { label: 'Échec — montant disponible', icon: 'alert-circle-outline', color: Colors.danger },
  cancelled: { label: 'Annulé — montant disponible', icon: 'close-circle-outline', color: Colors.gray[600] },
};

type Props = {
  payouts: DriverPayout[];
  availableBalance: number;
  busy: boolean;
  canRetry: boolean;
  onRetry: (amount: number) => void;
  onCheck: (payout: DriverPayout) => Promise<void>;
  onSupport: () => void;
};

export function PayoutHistory({ payouts, availableBalance, busy, canRetry, onRetry, onCheck, onSupport }: Props) {
  if (!payouts.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionTitle}>Versements récents</Text>
          <Text style={styles.sectionMeta}>De Zwanga vers votre Mobile Money</Text>
        </View>
      </View>
      {payouts.map((payout) => {
        const presentation = STATUS[payout.status] ?? STATUS.pending;
        const pending = isPayoutPending(payout);
        const retry = (payout.status === 'failed' || payout.status === 'cancelled') && Number(payout.amount) <= availableBalance;
        return (
          <View key={payout.id} style={styles.payoutRow}>
            <Ionicons name={presentation.icon} size={21} color={presentation.color} />
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{formatAmount(payout.amount, payout.currency)}</Text>
              <Text style={[styles.rowMeta, { color: presentation.color }]}>{presentation.label} · {formatDate(payout.processedAt ?? payout.requestedAt ?? payout.createdAt)}</Text>
              <Text style={styles.rowMeta}>{getPayoutMessage(payout)}</Text>
              <Text style={styles.rowMeta}>Vers {maskPhone(payout.phone)}</Text>
              <Text selectable style={styles.rowMeta}>Référence : {payout.reference ?? payout.orderNumber ?? payout.id}</Text>
              <View style={historyStyles.actions}>
                {pending && payout.orderNumber && (
                  <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void onCheck(payout)} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>Vérifier le versement</Text>
                  </TouchableOpacity>
                )}
                {retry && (
                  <TouchableOpacity accessibilityRole="button" disabled={busy || !canRetry} onPress={() => onRetry(Number(payout.amount))} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>Réessayer</Text>
                  </TouchableOpacity>
                )}
                {payout.status !== 'succeeded' && (
                  <TouchableOpacity accessibilityRole="button" onPress={onSupport} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>Assistance</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
