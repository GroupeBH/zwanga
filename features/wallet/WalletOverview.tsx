import { Colors } from '@/constants/styles';
import type { useWalletController } from '@/hooks/wallet/useWalletController';
import type { useWalletWithdrawal } from '@/hooks/wallet/useWalletWithdrawal';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { formatWalletAmount } from './walletModel';
import { compactWalletStyles as styles } from './WalletOverview.styles';

type Props = {
  wallet: ReturnType<typeof useWalletController>;
  withdrawal: ReturnType<typeof useWalletWithdrawal>;
  isDriver?: boolean;
};

/** Presentation only: no payment, extra query or native overlay when expanding details. */
export function WalletOverview({ wallet, withdrawal, isDriver = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const summary = wallet.walletSummary;
  const actions = [
    { id: 'top_up' as const, label: 'Recharger', icon: 'add-outline' as const, disabled: false },
    { id: 'transfer' as const, label: 'Partager', icon: 'paper-plane-outline' as const, disabled: false },
    ...(summary?.withdrawal ? [{ id: 'withdrawal' as const,
      label: withdrawal.activeIntent ? 'Vérifier' : 'Retirer',
      icon: 'cash-outline' as const, disabled: !withdrawal.canSubmit }] : []),
  ];
  return <View style={styles.overview}>
    <View style={styles.balanceHeading}>
      <Text style={styles.caption}>Solde disponible</Text>
      <TouchableOpacity onPress={() => setExpanded(value => !value)} style={styles.detailsToggle}
        accessibilityRole="button" accessibilityLabel="Détails des jetons" accessibilityState={{ expanded }}>
        <Text style={styles.detailsLabel}>Détails</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gray[600]} />
      </TouchableOpacity>
    </View>
    {wallet.isWalletLoading && !summary ? <ActivityIndicator style={styles.loader} color={Colors.primary} /> :
      summary ? <Text style={styles.balance}>{formatWalletAmount(Math.max(0, Number(summary.account.balance) - Number(summary.account.reservedCashCommissionBalance ?? 0)), wallet.currency)}</Text> :
        <Text style={styles.caption} accessibilityRole="alert">Solde indisponible</Text>}
    {(wallet.isWalletError || (!summary && !wallet.isWalletLoading)) && <View>
      <Text style={styles.caption}>{summary ? 'Dernier solde connu. Actualisation indisponible.' : 'Vérifiez votre connexion pour consulter vos jetons.'}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Réessayer le chargement du solde"
        disabled={!wallet.canRefresh || wallet.isRefreshing} style={styles.detailsToggle} onPress={wallet.refreshAll}>
        <Text style={styles.detailsLabel}>Réessayer</Text>
      </TouchableOpacity>
    </View>}
    {summary?.withdrawal && <Text style={styles.caption}>
      Retirable : {formatWalletAmount(summary.withdrawal.availableMoney, summary.withdrawal.currency)}
    </Text>}
    {isDriver && wallet.cashDebt && <View style={styles.cashDebt} accessibilityLiveRegion="polite">
      <Text style={styles.cashDebtTitle}>Commission à régler : {formatWalletAmount(wallet.cashDebt.tokens)}{wallet.cashDebt.amount !== undefined ? ` (${formatWalletAmount(wallet.cashDebt.amount, 'FC')})` : ''}</Text>
      <Text style={styles.cashDebtText}>Tolérance cumulée : 25 jetons. Le cash reste possible si la prochaine commission ne fait pas dépasser ce plafond. Les prochains jetons reçus couvrent ce dû.</Text>
    </View>}
    {expanded && <View style={styles.breakdown}>
      {summary && Number(summary.account.reservedCashCommissionBalance) > 0 &&
        <BalanceLine label="Réservés aux commissions cash" value={formatWalletAmount(summary.account.reservedCashCommissionBalance)} />}
      {summary?.withdrawal && <>
        <BalanceLine label="Retirables" value={formatWalletAmount(Math.max(0, Math.min(Number(summary.account.withdrawableBalance), Number(summary.account.balance) - Number(summary.account.reservedCashCommissionBalance ?? 0))))} />
        <BalanceLine label="Pour payer uniquement" value={formatWalletAmount(summary.withdrawal.nonWithdrawableTokens)} />
        {Number(summary.account.reservedWithdrawalBalance) > 0 &&
          <BalanceLine label="Retraits en cours" value={formatWalletAmount(summary.account.reservedWithdrawalBalance)} />}
      </>}
      <Text style={styles.caption}>Les jetons paient vos trajets{isDriver ? ', commissions cash' : ''} et abonnements. La fidélité est utilisée en premier, sans retrait possible.</Text>
      <Text style={styles.caption}>Les jetons achetés, même reçus par partage, sont retirables.</Text>
    </View>}
    <View style={styles.actions}>
      {actions.map(action => <TouchableOpacity key={action.id} style={[styles.action, action.disabled && styles.disabled]}
        activeOpacity={0.8} accessibilityRole="button"
        accessibilityLabel={action.id === 'withdrawal' && withdrawal.activeIntent ? 'Vérifier le retrait' : `${action.label} des jetons`}
        accessibilityState={{ disabled: action.disabled }} disabled={action.disabled}
        onPress={() => wallet.setActiveModal(action.id)}>
        <View style={[styles.actionIcon, action.id === 'top_up' && styles.primaryIcon]}>
          <Ionicons name={action.icon} size={22} color={action.id === 'top_up' ? Colors.white : Colors.primaryDark} />
        </View>
        <Text style={styles.actionLabel}>{action.label}</Text>
      </TouchableOpacity>)}
    </View>
    {isDriver && <TouchableOpacity style={styles.proAction} activeOpacity={0.8}
      accessibilityRole="button" accessibilityLabel="Payer l’abonnement Pro"
      accessibilityHint="Ouvre le choix du moyen de paiement, sans débit automatique."
      onPress={() => wallet.router.navigate('/subscriptions/payment')}>
      <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primaryDark} />
      <Text style={styles.proActionLabel}>Payer l’abonnement Pro</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.primaryDark} />
    </TouchableOpacity>}
  </View>;
}

function BalanceLine({ label, value }: { label: string; value: string }) {
  return <View style={styles.balanceLine}><Text style={styles.caption}>{label}</Text><Text style={styles.lineValue}>{value}</Text></View>;
}

export function WalletRelatedLinks({ wallet, isDriver }: { wallet: Props['wallet']; isDriver: boolean }) {
  return <View>
    <WalletLink label="Parrainage" icon="gift-outline" onPress={() => wallet.router.push('/referrals')} />
    {isDriver && <WalletLink label="Revenus conducteur" icon="car-outline" onPress={() => wallet.router.push('/driver-earnings')} />}
  </View>;
}

function WalletLink({ label, icon, onPress }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void;
}) {
  return <TouchableOpacity style={styles.link} onPress={onPress} accessibilityRole="button" activeOpacity={0.8}>
    <Ionicons name={icon} size={20} color={Colors.gray[600]} />
    <Text style={styles.linkLabel}>{label}</Text>
    <Ionicons name="chevron-forward" size={18} color={Colors.gray[500]} />
  </TouchableOpacity>;
}
