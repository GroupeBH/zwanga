import { formatNumber, formatDate, rewardLabel } from '../features/referrals/referralModel';
import { useReferralActions } from '../hooks/referrals/useReferralActions';
import { ReferralQrAction } from '@/features/referrals/ReferralQrAction';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import { styles } from '@/features/referrals/referralScreenStyles';
import { ReferralPageControls } from '@/features/referrals/ReferralPageControls';
import { ReferralPersonRow } from '@/features/referrals/ReferralPersonRow';
import { useReferralScreenData } from '@/hooks/referrals/useReferralScreenData';
import {
  useRequestReferralWithdrawalMutation,
} from '@/store/api/referralApi';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const renderReferral = ({ item }: { item: import('@/types').ReferredUserSummary }) => <ReferralPersonRow referral={item} />;

export default function ReferralsScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const [withdrawalTokens, setWithdrawalTokens] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const feed = useReferralScreenData();
  const { summary, isLoading, refreshing, refetchSummary, refreshAll } = feed;
  const referrals = feed.peopleQuery.currentData?.data ?? [];
  const recentRewards = feed.rewardsQuery.currentData?.data ?? [];
  const recentWithdrawals = feed.withdrawalsQuery.currentData?.data ?? [];
  const [requestWithdrawal, { isLoading: isWithdrawing }] = useRequestReferralWithdrawalMutation();

  const { handleShare, handleWithdrawal } = useReferralActions({
    isSharing,
    setIsSharing,
    summary,
    refetchSummary,
    showDialog,
    withdrawalTokens,
    requestWithdrawal,
    setWithdrawalTokens,
    refreshAll,
  });

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
        <FlatList
          data={referrals} keyExtractor={referral => referral.userId}
          renderItem={renderReferral} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<View style={styles.sectionStack}>
          {feed.summaryError && <Text style={styles.emptyText}>Résumé indisponible. Tirez vers le bas pour réessayer.</Text>}
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>VOTRE LIEN PERSONNEL</Text>
            <Text style={styles.linkReady}>Prêt à être partagé</Text>
            <Text style={styles.heroText}>
              Votre ami n’a aucun code à saisir. Le lien reconnait automatiquement
              votre invitation après son installation et son inscription.
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
                  {isSharing ? 'Préparation...' : 'Partager mon lien'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.contactsButton} onPress={() => router.push('/invite')}>
                <Ionicons name="people-outline" size={18} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <ReferralQrAction summary={summary} refetchSummary={refetchSummary} />
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
                <Text style={styles.statLabel}>Dejà retirés</Text>
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
            <Text style={styles.counter}>{summary?.referralCount ?? '—'}</Text>
          </View>
          </View>}
          ListEmptyComponent={feed.peopleQuery.isFetching ? <ActivityIndicator color={Colors.primary} />
            : <View style={styles.empty}><Text style={styles.emptyText}>{feed.peopleQuery.isError
              ? 'Filleuls indisponibles. Réessayez.' : 'Aucun filleul sur cette page.'}</Text></View>}
          ListFooterComponent={<View style={styles.sectionStack}>
          <ReferralPageControls cursor={feed.peopleCursor} query={feed.peopleQuery} active={feed.active} />

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
                  Identité {summary?.withdrawal.kycApproved ? 'vérifiée' : 'à vérifier'}
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
              Retirez ici vos jetons de parrainage et les commissions de vos filleuls. Les commissions restent en attente {summary?.rules.holdDays ?? 7} jours. Les jetons achetés se retirent depuis le portefeuille ; les jetons de fidélité ne sont pas retirables.
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
                <Text style={styles.emptyText}>{feed.rewardsQuery.isError ? 'Commissions indisponibles. Réessayez.' : 'Aucune commission sur cette page.'}</Text>
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

          <ReferralPageControls cursor={feed.rewardsCursor} query={feed.rewardsQuery} active={feed.active} />
          {recentWithdrawals && (
            <>
              <Text style={styles.sectionTitle}>Retraits recents</Text>
              <View style={styles.listPanel}>
                {recentWithdrawals.length === 0 && <View style={styles.empty}><Text style={styles.emptyText}>
                  {feed.withdrawalsQuery.isError ? 'Retraits indisponibles. Réessayez.' : 'Aucun retrait sur cette page.'}
                </Text></View>}
                {recentWithdrawals?.map((withdrawal: any) => (
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
          <ReferralPageControls cursor={feed.withdrawalsCursor} query={feed.withdrawalsQuery} active={feed.active} />
          </View>}
        />
      )}
    </SafeAreaView>
  );
}
