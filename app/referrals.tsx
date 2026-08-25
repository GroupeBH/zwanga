import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useGetMyReferralsQuery,
  useGetMyReferralRewardsQuery,
  useGetMyReferralSummaryQuery,
  useGetMyReferralWithdrawalsQuery,
  useRequestReferralWithdrawalMutation,
} from '@/store/api/referralApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { shareReferralLink } from '@/utils/shareReferralLink';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const formatNumber = (value?: number | string | null) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '0';
  return number % 1 === 0
    ? Math.round(number).toLocaleString('fr-FR')
    : number.toFixed(2).replace('.', ',');
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const rewardLabel = (sourceType: string) =>
  sourceType === 'subscription_payment' ? 'Abonnement paye' : 'Trajet paye';

export default function ReferralsScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const [withdrawalTokens, setWithdrawalTokens] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const {
    data: summary,
    isLoading,
    isFetching: isSummaryFetching,
    refetch: refetchSummary,
  } = useGetMyReferralSummaryQuery();
  const {
    data: referrals = [],
    isFetching: isReferralsFetching,
    refetch: refetchReferrals,
  } = useGetMyReferralsQuery();
  const {
    data: rewards = [],
    isFetching: isRewardsFetching,
    refetch: refetchRewards,
  } = useGetMyReferralRewardsQuery();
  const {
    data: withdrawals = [],
    isFetching: isWithdrawalsFetching,
    refetch: refetchWithdrawals,
  } = useGetMyReferralWithdrawalsQuery();
  const [requestWithdrawal, { isLoading: isWithdrawing }] =
    useRequestReferralWithdrawalMutation();

  const recentRewards = useMemo(() => rewards.slice(0, 8), [rewards]);
  const recentWithdrawals = useMemo(() => withdrawals.slice(0, 5), [withdrawals]);
  const refreshing =
    isSummaryFetching ||
    isReferralsFetching ||
    isRewardsFetching ||
    isWithdrawalsFetching;

  const refreshAll = async () => {
    await Promise.allSettled([
      refetchSummary(),
      refetchReferrals(),
      refetchRewards(),
      refetchWithdrawals(),
    ]);
  };

  const handleShare = async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const currentSummary = summary ?? (await refetchSummary().unwrap());
      await shareReferralLink(currentSummary.shareLink);
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Partage indisponible',
        message: getApiErrorMessage(
          error,
          "Le lien d'invitation n'est pas encore disponible. Verifiez votre connexion puis reessayez.",
        ),
      });
    } finally {
      setIsSharing(false);
    }
  };

  const handleWithdrawal = async () => {
    Keyboard.dismiss();
    const tokens = Number(withdrawalTokens.replace(',', '.'));
    if (!summary || !Number.isFinite(tokens) || tokens <= 0) {
      showDialog({
        variant: 'warning',
        title: 'Montant invalide',
        message: 'Entrez le nombre de jetons a retirer.',
      });
      return;
    }
    if (tokens < summary.withdrawal.minimumTokens) {
      showDialog({
        variant: 'warning',
        title: 'Minimum non atteint',
        message: `Le retrait minimum est de ${formatNumber(summary.withdrawal.minimumTokens)} jetons.`,
      });
      return;
    }
    if (tokens > summary.balances.availableTokens) {
      showDialog({
        variant: 'warning',
        title: 'Solde insuffisant',
        message: 'Votre solde disponible ne couvre pas ce retrait.',
      });
      return;
    }
    if (!summary.withdrawal.kycApproved) {
      showDialog({
        variant: 'warning',
        title: 'Verification requise',
        message: 'Faites approuver votre identite KYC avant de retirer vos gains.',
      });
      return;
    }

    try {
      const withdrawal = await requestWithdrawal({ tokens }).unwrap();
      setWithdrawalTokens('');
      await refreshAll();
      showDialog({
        variant: 'success',
        title: 'Retrait transmis',
        message: `FlexPay traite ${formatNumber(withdrawal.amount)} ${withdrawal.currency} vers votre numero Mobile Money.`,
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Retrait impossible',
        message: getApiErrorMessage(error, 'Impossible de lancer ce retrait pour le moment.'),
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Parrainage</Text>
          <Text style={styles.headerSubtitle}>Vos gains retirables</Text>
        </View>
        <TouchableOpacity onPress={refreshAll} style={styles.headerButton}>
          {refreshing ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="refresh-outline" size={20} color={Colors.gray[900]} />
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>VOTRE LIEN PERSONNEL</Text>
            <Text style={styles.linkReady}>Pret a etre partage</Text>
            <Text style={styles.heroText}>
              Votre ami n’a aucun code a saisir. Le lien reconnait automatiquement
              votre invitation apres son installation et son inscription.
            </Text>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={[styles.shareButton, isSharing && styles.disabled]}
                disabled={isSharing}
                onPress={handleShare}
              >
                {isSharing ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Ionicons name="share-social-outline" size={18} color={Colors.white} />
                )}
                <Text style={styles.shareButtonText}>
                  {isSharing ? 'Preparation...' : 'Partager mon lien'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.contactsButton} onPress={() => router.push('/invite')}>
                <Ionicons name="people-outline" size={18} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.balancePanel}>
            <View style={styles.balanceMain}>
              <Text style={styles.balanceLabel}>Disponible au retrait</Text>
              <Text style={styles.balanceValue}>
                {formatNumber(summary?.balances.availableTokens)} jetons
              </Text>
              <Text style={styles.equivalent}>
                soit {formatNumber(summary?.balances.availableAmount)} {summary?.balances.payoutCurrency ?? 'CDF'}
              </Text>
            </View>
            <View style={styles.balanceStats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{formatNumber(summary?.balances.pendingTokens)}</Text>
                <Text style={styles.statLabel}>En attente</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{formatNumber(summary?.balances.withdrawnTokens)}</Text>
                <Text style={styles.statLabel}>Deja retires</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{summary?.referralCount ?? 0}</Text>
                <Text style={styles.statLabel}>Filleuls</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Mes filleuls</Text>
            <Text style={styles.counter}>{referrals.length}</Text>
          </View>
          <View style={styles.listPanel}>
            {referrals.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={26} color={Colors.gray[400]} />
                <Text style={styles.emptyText}>Aucun filleul pour le moment.</Text>
              </View>
            ) : (
              referrals.map((referral) => (
                <View key={referral.userId} style={styles.listItem}>
                  <View style={styles.listIcon}>
                    <Ionicons name="person-outline" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.listBody}>
                    <Text style={styles.listTitle}>
                      {referral.firstName} {referral.lastNameInitial}
                    </Text>
                    <Text style={styles.listMeta}>
                      {referral.qualifiedAt
                        ? `Actif · gains jusqu'au ${formatDate(referral.rewardWindowEndsAt)}`
                        : `Inscrit le ${formatDate(referral.referredAt)} · aucun paiement eligible`}
                    </Text>
                    {referral.earnings.pendingTokens > 0 && (
                      <Text style={styles.pendingEarning}>
                        {formatNumber(referral.earnings.pendingTokens)} jetons en attente
                      </Text>
                    )}
                  </View>
                  <View style={styles.earningSummary}>
                    <Text style={styles.positiveAmount}>
                      +{formatNumber(referral.earnings.earnedTokens)} jetons
                    </Text>
                    <Text style={styles.earningAmount}>
                      {formatNumber(referral.earnings.earnedAmount)}{' '}
                      {referral.earnings.currency} cumules
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.panel}>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionTitle}>Retirer mes gains</Text>
                <Text style={styles.sectionHint}>
                  Minimum {formatNumber(summary?.withdrawal.minimumTokens)} jetons · 1 jeton = {formatNumber(summary?.withdrawal.moneyPerToken)} {summary?.withdrawal.currency ?? 'CDF'}
                </Text>
              </View>
              <View style={[styles.kycBadge, summary?.withdrawal.kycApproved && styles.kycBadgeOk]}>
                <Ionicons
                  name={summary?.withdrawal.kycApproved ? 'shield-checkmark' : 'shield-outline'}
                  size={14}
                  color={summary?.withdrawal.kycApproved ? Colors.successDark : Colors.warningDark}
                />
                <Text style={[styles.kycText, summary?.withdrawal.kycApproved && styles.kycTextOk]}>
                  KYC {summary?.withdrawal.kycApproved ? 'valide' : 'requis'}
                </Text>
              </View>
            </View>
            <TextInput
              value={withdrawalTokens}
              onChangeText={setWithdrawalTokens}
              keyboardType="decimal-pad"
              placeholder="Nombre de jetons"
              placeholderTextColor={Colors.gray[400]}
              style={styles.input}
            />
            <TouchableOpacity
              disabled={isWithdrawing}
              onPress={handleWithdrawal}
              style={[styles.withdrawButton, isWithdrawing && styles.disabled]}
            >
              {isWithdrawing ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="phone-portrait-outline" size={18} color={Colors.white} />
                  <Text style={styles.withdrawButtonText}>Retirer par FlexPay</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.legalHint}>
              Seuls les jetons issus du parrainage sont retirables. Les commissions restent en attente {summary?.rules.holdDays ?? 7} jours.
            </Text>
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Commissions recentes</Text>
            <Text style={styles.counter}>{summary?.rewardCount ?? 0}</Text>
          </View>
          <View style={styles.listPanel}>
            {recentRewards.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="gift-outline" size={26} color={Colors.gray[400]} />
                <Text style={styles.emptyText}>Aucune commission pour le moment.</Text>
              </View>
            ) : (
              recentRewards.map((reward) => (
                <View key={reward.id} style={styles.listItem}>
                  <View style={styles.listIcon}>
                    <Ionicons
                      name={reward.sourceType === 'booking_payment' ? 'car-outline' : 'ribbon-outline'}
                      size={18}
                      color={Colors.primary}
                    />
                  </View>
                  <View style={styles.listBody}>
                    <Text style={styles.listTitle}>
                      {reward.referredUser.firstName} {reward.referredUser.lastNameInitial}
                    </Text>
                    <Text style={styles.listMeta}>
                      {rewardLabel(reward.sourceType)} · {formatDate(reward.createdAt)} · {reward.status === 'pending' ? `disponible le ${formatDate(reward.holdUntil)}` : reward.status}
                    </Text>
                  </View>
                  <Text style={styles.positiveAmount}>+{formatNumber(reward.rewardTokens)}</Text>
                </View>
              ))
            )}
          </View>

          {recentWithdrawals.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Retraits recents</Text>
              <View style={styles.listPanel}>
                {recentWithdrawals.map((withdrawal) => (
                  <View key={withdrawal.id} style={styles.listItem}>
                    <View style={[styles.listIcon, styles.payoutIcon]}>
                      <Ionicons name="cash-outline" size={18} color={Colors.infoDark} />
                    </View>
                    <View style={styles.listBody}>
                      <Text style={styles.listTitle}>{formatNumber(withdrawal.amount)} {withdrawal.currency}</Text>
                      <Text style={styles.listMeta}>{formatDate(withdrawal.requestedAt)} · {withdrawal.status}</Text>
                    </View>
                    <Text style={styles.negativeAmount}>-{formatNumber(withdrawal.tokens)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { minHeight: 64, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.gray[100], backgroundColor: Colors.white },
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray[50] },
  headerText: { flex: 1, marginHorizontal: Spacing.md },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  headerSubtitle: { marginTop: 2, fontSize: FontSizes.xs, color: Colors.gray[500] },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 44 },
  hero: { backgroundColor: Colors.primary, borderRadius: BorderRadius.xl, padding: Spacing.xl, overflow: 'hidden' },
  eyebrow: { color: '#FFE1D6', fontSize: FontSizes.xs, fontWeight: FontWeights.bold, letterSpacing: 1.4 },
  linkReady: { color: Colors.white, fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, marginTop: 5 },
  heroText: { color: '#FFF4EF', fontSize: FontSizes.sm, lineHeight: 20, marginTop: Spacing.sm },
  heroActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  shareButton: { flex: 1, minHeight: 46, borderRadius: BorderRadius.md, backgroundColor: Colors.primaryDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  earningSummary: { alignItems: 'flex-end', marginLeft: Spacing.sm },
  earningAmount: { marginTop: 3, fontSize: FontSizes.xs, color: Colors.gray[500] },
  pendingEarning: { marginTop: 3, fontSize: FontSizes.xs, color: Colors.warningDark },
  shareButtonText: { color: Colors.white, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  contactsButton: { width: 48, borderRadius: BorderRadius.md, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  balancePanel: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.gray[200], overflow: 'hidden' },
  balanceMain: { padding: Spacing.lg },
  balanceLabel: { color: Colors.gray[600], fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  balanceValue: { color: Colors.gray[900], fontSize: FontSizes.xxxl, fontWeight: FontWeights.bold, marginTop: 4 },
  equivalent: { color: Colors.successDark, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, marginTop: 3 },
  balanceStats: { minHeight: 72, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray[50], borderTopWidth: 1, borderTopColor: Colors.gray[100] },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statDivider: { height: 30, width: 1, backgroundColor: Colors.gray[200] },
  statValue: { color: Colors.gray[900], fontSize: FontSizes.base, fontWeight: FontWeights.bold },
  statLabel: { marginTop: 3, color: Colors.gray[500], fontSize: 11 },
  panel: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.gray[200], padding: Spacing.lg, gap: Spacing.md },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  sectionTitle: { color: Colors.gray[900], fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  sectionHint: { color: Colors.gray[500], fontSize: FontSizes.xs, marginTop: 4, maxWidth: 230, lineHeight: 17 },
  kycBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warning + '18', borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 6 },
  kycBadgeOk: { backgroundColor: Colors.success + '16' },
  kycText: { color: Colors.warningDark, fontSize: 11, fontWeight: FontWeights.bold },
  kycTextOk: { color: Colors.successDark },
  input: { height: 50, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: Spacing.md, color: Colors.gray[900], fontSize: FontSizes.base },
  withdrawButton: { height: 50, borderRadius: BorderRadius.md, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  withdrawButtonText: { color: Colors.white, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  legalHint: { color: Colors.gray[500], fontSize: 11, lineHeight: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold, backgroundColor: Colors.primary + '12', paddingHorizontal: 9, paddingVertical: 4, borderRadius: BorderRadius.full },
  listPanel: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.gray[200], overflow: 'hidden' },
  listItem: { minHeight: 68, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  listIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary + '10' },
  payoutIcon: { backgroundColor: Colors.info + '10' },
  listBody: { flex: 1, minWidth: 0 },
  listTitle: { color: Colors.gray[900], fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  listMeta: { color: Colors.gray[500], fontSize: 11, marginTop: 4 },
  positiveAmount: { color: Colors.successDark, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  negativeAmount: { color: Colors.danger, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  empty: { minHeight: 116, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg },
  emptyText: { color: Colors.gray[500], fontSize: FontSizes.sm },
  disabled: { opacity: 0.6 },
});
