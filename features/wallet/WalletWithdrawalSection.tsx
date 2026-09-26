import React, { useState } from "react";
import { Ionicons } from '@expo/vector-icons';
import { compactWalletStyles as compact } from './WalletOverview.styles';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { useWalletWithdrawal } from "@/hooks/wallet/useWalletWithdrawal";
import { WalletSheetModal } from "./WalletSheetModal";
import { formatWalletAmount } from "./walletModel";
import { styles } from "@/features/screen-styles/app/wallet";
import { Colors } from "@/constants/styles";
import type { WalletSummary } from "@/types";

export function WalletWithdrawalSection({
  summary, withdrawal,
}: {
  summary?: WalletSummary;
  withdrawal: ReturnType<typeof useWalletWithdrawal>;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!summary?.withdrawal) return null;
  const pendingCount = withdrawal.withdrawals.filter(value => ['pending', 'initiated', 'review'].includes(value.status)).length;
  const notices = [
    !summary.withdrawal.enabled && 'Retraits temporairement indisponibles.',
    summary.withdrawal.blocked && 'Portefeuille à vérifier. Contactez l’assistance.',
    withdrawal.storageError && 'Demande impossible à restaurer. Contactez l’assistance avant de réessayer.',
    withdrawal.activeIntent && 'Un retrait reste à vérifier. Utilisez « Vérifier », sans créer une autre demande.',
    withdrawal.historyError && 'Retraits indisponibles. Actualisez avant toute nouvelle demande.',
  ].filter((value): value is string => Boolean(value));
  if (!notices.length && !withdrawal.withdrawals.length) return null;
  return <View style={compact.withdrawalSection}>
    {notices.map(message => <Text key={message} style={compact.notice} accessibilityLiveRegion="polite">{message}</Text>)}
    {withdrawal.withdrawals.length > 0 && <>
      <TouchableOpacity style={compact.withdrawalToggle} onPress={() => setExpanded(value => !value)}
        accessibilityRole="button" accessibilityLabel="Historique des retraits" accessibilityState={{ expanded }}>
        <Ionicons name="cash-outline" size={18} color={Colors.gray[600]} />
        <Text style={compact.withdrawalLabel}>Retraits{pendingCount > 0 ? ` · ${pendingCount} à suivre` : ''}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray[600]} />
      </TouchableOpacity>
      {expanded && withdrawal.withdrawals.slice(0, 10).map(value => <TouchableOpacity key={value.id}
        accessibilityRole="button" accessibilityLabel={`Vérifier le retrait de ${formatWalletAmount(value.amount, value.currency)}`}
        disabled={withdrawal.busy} onPress={() => withdrawal.checkStatus(value)} style={styles.ledgerItem}>
        <View style={styles.ledgerTextBlock}>
          <Text style={styles.ledgerTitle}>{formatWalletAmount(value.amount, value.currency)}</Text>
          <Text style={styles.ledgerSubtitle}>{value.message}</Text>
          <Text style={styles.ledgerSubtitle}>{new Date(value.createdAt).toLocaleDateString('fr-FR')} · {formatWalletAmount(value.tokens)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.gray[500]} />
      </TouchableOpacity>)}
    </>}
  </View>;
}

// Keep the screen-local overlay OUTSIDE the scroll view / hidden accessibility tree.
export function WalletWithdrawalModal({
  summary,
  withdrawal,
  visible,
  onClose,
}: {
  summary?: WalletSummary;
  withdrawal: ReturnType<typeof useWalletWithdrawal>;
  visible: boolean;
  onClose: () => void;
}) {
  if (!summary?.withdrawal) return null;
  return (
    <WalletSheetModal
      visible={visible}
      onClose={onClose}
      icon="cash-outline"
      title="Retirer mes jetons"
      subtitle="Versement sur votre Mobile Money."
    >
      <Text style={styles.balanceLabel}>Retirable : {formatWalletAmount(summary.account.withdrawableBalance)}</Text>
      <Text style={styles.balanceHint}>
        Minimum : {formatWalletAmount(summary.withdrawal.minimumTokens)}. Identité vérifiée requise.
      </Text>
      <Text style={styles.balanceHint}>Seuls les jetons achetés, même reçus par partage, sont retirables.</Text>
      <TextInput
        accessibilityLabel="Nombre de jetons à retirer"
        placeholder="Nombre de jetons"
        keyboardType="decimal-pad"
        editable={!withdrawal.activeIntent && !withdrawal.busy}
        style={styles.input}
        value={withdrawal.tokens}
        onChangeText={withdrawal.setTokens}
      />
      <TextInput
        accessibilityLabel="Numéro Mobile Money du retrait"
        placeholder="Ex. +243891234567"
        keyboardType="phone-pad"
        editable={!withdrawal.activeIntent && !withdrawal.busy}
        style={styles.input}
        value={withdrawal.phone}
        onChangeText={withdrawal.setPhone}
      />
      <Text style={styles.balanceHint}>
        1 jeton = {summary.withdrawal.moneyPerToken}{" "}
        {summary.withdrawal.currency}. Vérifiez le numéro avant de confirmer.
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        disabled={!withdrawal.canSubmit}
        onPress={withdrawal.confirm}
        style={[styles.primaryButton, !withdrawal.canSubmit && styles.disabled]}
      >
        {withdrawal.busy ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.primaryButtonText}>
            {withdrawal.activeIntent ? "Vérifier la même demande" : "Continuer"}
          </Text>
        )}
      </TouchableOpacity>
    </WalletSheetModal>
  );
}
