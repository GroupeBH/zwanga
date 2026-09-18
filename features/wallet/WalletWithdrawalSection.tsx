import React from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { useWalletWithdrawal } from '@/hooks/wallet/useWalletWithdrawal';
import { WalletSheetModal } from './WalletSheetModal';
import { formatWalletAmount } from './walletModel';
import { styles } from '@/features/screen-styles/app/wallet';
import { Colors } from '@/constants/styles';
import type { WalletSummary } from '@/types';

export function WalletWithdrawalSection({ summary, withdrawal, onOpen }: {
  summary?: WalletSummary; withdrawal: ReturnType<typeof useWalletWithdrawal>; onOpen: () => void;
}) {
  if (!summary?.withdrawal) return null;
  return <>
    <View style={styles.balancePanel}>
      <Text style={styles.sectionTitle}>Retirer mes jetons achetés</Text>
      <Text style={styles.balanceLabel}>{formatWalletAmount(summary.account.withdrawableBalance)} retirables</Text>
      <Text style={styles.balanceHint}>Soit {formatWalletAmount(summary.withdrawal.availableMoney, summary.withdrawal.currency)} sur votre Mobile Money. Minimum : {summary.withdrawal.minimumTokens} jeton. KYC validé requis.</Text>
      {!summary.withdrawal.enabled ? <Text style={styles.balanceHint}>Le service de retrait est actuellement désactivé.</Text> : null}
      {summary.withdrawal.blocked ? <Text style={styles.balanceHint}>Votre portefeuille nécessite une vérification. Contactez le support.</Text> : null}
      {withdrawal.storageError ? <Text style={styles.balanceHint}>Impossible de restaurer votre demande en sécurité. Contactez le support avant de réessayer.</Text> : null}
      <TouchableOpacity accessibilityRole="button" disabled={!withdrawal.canSubmit} onPress={onOpen}
        style={[styles.primaryButton, !withdrawal.canSubmit && styles.disabled]}>
        <Text style={styles.primaryButtonText}>{withdrawal.activeIntent ? 'Vérifier ma demande' : 'Retirer en argent'}</Text>
      </TouchableOpacity>
      {withdrawal.historyError ? <Text style={styles.balanceHint}>Historique des retraits indisponible. Actualisez avant de refaire une demande.</Text> : null}
      {withdrawal.withdrawals.slice(0, 10).map(value => <TouchableOpacity key={value.id} accessibilityRole="button"
        disabled={withdrawal.busy} onPress={() => withdrawal.checkStatus(value)} style={styles.ledgerItem}>
        <View style={styles.ledgerTextBlock}>
          <Text style={styles.ledgerTitle}>{value.tokens} jetons → {formatWalletAmount(value.amount, value.currency)}</Text>
          <Text style={styles.ledgerSubtitle}>{value.message}</Text>
          <Text style={styles.ledgerSubtitle}>{new Date(value.createdAt).toLocaleDateString('fr-FR')} · Vérifier le statut</Text>
        </View>
      </TouchableOpacity>)}
    </View>
  </>;
}

// Keep the screen-local overlay OUTSIDE the scroll view / hidden accessibility tree.
export function WalletWithdrawalModal({ summary, withdrawal, visible, onClose }: {
  summary?: WalletSummary; withdrawal: ReturnType<typeof useWalletWithdrawal>; visible: boolean; onClose: () => void;
}) {
  if (!summary?.withdrawal) return null;
  return <WalletSheetModal visible={visible} onClose={onClose} icon="cash-outline" title="Retirer mes jetons"
      subtitle="Seuls les jetons achetés, y compris ceux reçus par transfert, sont retirables. La fidélité reste utilisable pour payer.">
      <TextInput accessibilityLabel="Nombre de jetons à retirer" placeholder="Nombre de jetons" keyboardType="decimal-pad"
        editable={!withdrawal.activeIntent && !withdrawal.busy} style={styles.input} value={withdrawal.tokens} onChangeText={withdrawal.setTokens} />
      <TextInput accessibilityLabel="Numéro Mobile Money du retrait" placeholder="Ex. +243891234567" keyboardType="phone-pad"
        editable={!withdrawal.activeIntent && !withdrawal.busy} style={styles.input} value={withdrawal.phone} onChangeText={withdrawal.setPhone} />
      <Text style={styles.balanceHint}>1 jeton = {summary.withdrawal.moneyPerToken} {summary.withdrawal.currency}. Vérifiez le numéro avant de confirmer.</Text>
      <TouchableOpacity accessibilityRole="button" disabled={!withdrawal.canSubmit} onPress={withdrawal.confirm}
        style={[styles.primaryButton, !withdrawal.canSubmit && styles.disabled]}>
        {withdrawal.busy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryButtonText}>{withdrawal.activeIntent ? 'Vérifier la même demande' : 'Continuer'}</Text>}
      </TouchableOpacity>
    </WalletSheetModal>;
}
