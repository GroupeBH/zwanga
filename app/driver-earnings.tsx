import { styles } from '../features/screen-styles/app/driver-earnings/index';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled, useDisplayRefetch, useDisplayReadData } from '@/hooks/useDisplayReads';
import { Colors, Spacing } from '@/constants/styles';
import {
  useGetDriverEarningsPageQuery,
  useGetDriverPayoutsPageQuery,
  useGetMyDriverSettlementQuery,
} from '@/store/api/driverSettlementsApi';
import { formatAmount, maskPhone } from '@/features/driver-earnings/payoutModel';
import { CashRevenueSummary } from '@/features/driver-earnings/CashRevenueSummary';
import { DriverEarningRow } from '@/features/driver-earnings/DriverEarningRow';
import { PayoutHistory } from '@/features/driver-earnings/PayoutHistory';
import { PayoutDestinationModal } from '@/features/driver-earnings/PayoutDestinationModal';
import { useDriverPayout } from '@/hooks/driver-earnings/useDriverPayout';
import { useHistoryCursor } from '@/hooks/useHistoryCursor';
import { HistoryPagination } from '@/components/ui/HistoryPagination';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const pageInsets = { paddingHorizontal: Spacing.xl };

export default function DriverEarningsScreen() {
  const isScreenActive = useScreenIsActive();
  const enabled = useDisplayReadsEnabled(isScreenActive);
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const earningsCursor = useHistoryCursor('earnings');
  const payoutsCursor = useHistoryCursor('payouts');
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: rawRefetchSummary,
  } = useGetMyDriverSettlementQuery(undefined, {
    ...displayReadOptions(enabled, 60_000),
  });
  const {
    currentData: liveEarningsPage,
    isLoading: earningsLoading,
    isError: earningsError,
    isFetching: earningsFetching,
    refetch: rawRefetchEarnings,
  } = useGetDriverEarningsPageQuery({ before: earningsCursor.before }, {
    ...displayReadOptions(enabled, !earningsCursor.before ? 60_000 : 0),
  });
  const {
    currentData: livePayoutsPage,
    isError: payoutsError,
    isFetching: payoutsFetching,
    refetch: rawRefetchPayouts,
  } = useGetDriverPayoutsPageQuery({ before: payoutsCursor.before, limit: 6 }, {
    ...displayReadOptions(enabled, !payoutsCursor.before ? 60_000 : 0),
  });
  const earningsPage = useDisplayReadData(earningsCursor.before ?? '', liveEarningsPage);
  const payoutsPage = useDisplayReadData(payoutsCursor.before ?? '', livePayoutsPage);
  const refetchSummary = useDisplayRefetch(enabled, 'summary', rawRefetchSummary);
  const refetchEarnings = useDisplayRefetch(enabled, earningsCursor.before ?? '', rawRefetchEarnings);
  const refetchPayouts = useDisplayRefetch(enabled, payoutsCursor.before ?? '', rawRefetchPayouts);

  const earnings = earningsPage?.data ?? [];
  const payouts = payoutsPage?.data ?? [];
  const currency = summary?.currency ?? earnings[0]?.currency ?? 'CDF';
  const availableBalance = Number(summary?.availableBalance ?? 0);
  const commissionPercent = Math.round(Number(summary?.commissionRate ?? 0) * 100);
  const isLoading = summaryLoading || earningsLoading || (earningsFetching && !earningsPage);
  const hasError = summaryError || earningsError;
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([refetchSummary(), refetchEarnings(), refetchPayouts()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchSummary, refetchEarnings, refetchPayouts]);
  const { canSubmit: canOpenWithdrawal, busy: isWithdrawing, checkPayout, requestPayoutReview, storageError, hasUnconfirmedIntent,
    payoutForm, openPayoutForm, setPayoutPhone, confirmPayoutForm, closePayoutForm } =
    useDriverPayout({ summary, payouts, refresh, isActive: isScreenActive });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Retour" onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Revenus conducteur</Text>
          <Text style={styles.subtitle}>Gains, cash reçu et retraits Mobile Money</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Actualiser les revenus"
          onPress={() => void refresh()}
          style={styles.headerButton}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={Colors.gray[900]} />
          ) : (
            <Ionicons name="refresh" size={22} color={Colors.gray[900]} />
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={earnings} keyExtractor={earning => earning.id}
        initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
        renderItem={({ item: earning }) => <View style={pageInsets}><DriverEarningRow earning={earning} /></View>}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<>
        <Animated.View entering={FadeInDown.delay(60)} style={styles.balanceSection}>
          <Text style={styles.eyebrow}>SOLDE RETIRABLE</Text>
          {isLoading && !summary ? (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.loader} />
          ) : (
            <Text style={styles.balance}>{summary ? formatAmount(availableBalance, currency) : '—'}</Text>
          )}
          <Text style={styles.balanceHint}>
            Paiements électroniques et jetons, nets de commission ({commissionPercent} %), plus les participations Zwanga créditées. Le cash reçu des passagers n’est pas inclus.
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            disabled={!canOpenWithdrawal}
            onPress={() => openPayoutForm()}
            style={[styles.payoutButton, !canOpenWithdrawal && styles.payoutButtonDisabled]}
          >
            {isWithdrawing ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Ionicons name="phone-portrait-outline" size={19} color={Colors.white} />
            )}
            <Text style={styles.payoutButtonText}>
              {isWithdrawing ? 'Vérification en cours…' : hasUnconfirmedIntent ? 'Vérifier ma demande' : 'Retirer mes gains'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.payoutDestination}>
            Numéro habituel : {summary?.payoutPhone ? maskPhone(summary.payoutPhone) : 'Non renseigné'} · Identité {summary?.kycApproved ? 'vérifiée' : 'à vérifier'}
          </Text>

          <Text style={styles.balanceHint}>
            Zwanga verse vos gains sur votre Mobile Money. Vous pouvez choisir un autre numéro avant de confirmer.
          </Text>
          {storageError && <Text style={styles.balanceHint}>Impossible de restaurer le suivi du versement sur ce téléphone. Contactez l’assistance avant une nouvelle demande.</Text>}
          <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/support')} style={styles.headerButton} accessibilityLabel="Contacter l’assistance pour mes gains">
            <Ionicons name="help-circle-outline" size={24} color={Colors.white} />
          </TouchableOpacity>

          <View style={styles.balanceBreakdown}>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Retrait en cours</Text>
              <Text style={styles.breakdownValue}>
                {summary ? formatAmount(summary.pendingPayoutBalance, currency) : '—'}
              </Text>
            </View>
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Déjà retiré</Text>
              <Text style={styles.breakdownValue}>{summary ? formatAmount(summary.paidBalance, currency) : '—'}</Text>
            </View>
          </View>
        </Animated.View>

        <CashRevenueSummary amount={summary?.cashReceivedAmount} currency={currency} />

        <PayoutHistory payouts={payouts} availableBalance={availableBalance} busy={isWithdrawing}
          canRetry={canOpenWithdrawal && !hasUnconfirmedIntent} onRetry={openPayoutForm} onCheck={checkPayout} onReview={requestPayoutReview}
          onSupport={() => router.push('/support')} />
        <View style={pageInsets}><HistoryPagination page={payoutsCursor.page} hasNext={Boolean(payoutsPage?.nextCursor)}
          busy={payoutsFetching} error={payoutsError} onPrevious={payoutsCursor.previous}
          onNext={() => payoutsCursor.next(payoutsPage?.nextCursor)} onRetry={() => { if (isScreenActive) void refetchPayouts(); }} /></View>

        <Animated.View entering={FadeInDown.delay(150)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Historique des gains</Text>
              <Text style={styles.sectionMeta}>{earningsPage?.total ?? '—'} opération(s)</Text>
            </View>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Actualisé</Text>
            </View>
          </View>

        </Animated.View>
        </>}
        ListEmptyComponent={hasError && !isLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={28} color={Colors.gray[500]} />
              <Text style={styles.emptyTitle}>Revenus indisponibles</Text>
              <Text style={styles.emptyText}>Tirez vers le bas pour réessayer.</Text>
            </View>
          ) : !isLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={28} color={Colors.gray[500]} />
              <Text style={styles.emptyTitle}>Aucune course créditée</Text>
              <Text style={styles.emptyText}>
                Les paiements électroniques, jetons et participations Zwanga apparaissent ici après crédit. Le cash reçu est suivi séparément.
              </Text>
            </View>
          ) : <ActivityIndicator color={Colors.primary} />}
        ListFooterComponent={<View style={pageInsets}><HistoryPagination page={earningsCursor.page} hasNext={Boolean(earningsPage?.nextCursor)}
          busy={earningsFetching} error={earningsError} onPrevious={earningsCursor.previous}
          onNext={() => earningsCursor.next(earningsPage?.nextCursor)} onRetry={() => { if (isScreenActive) void refetchEarnings(); }} /></View>}
      />
      <PayoutDestinationModal visible={Boolean(payoutForm)} amount={payoutForm?.amount ?? 0}
        currency={currency} phone={payoutForm?.phone ?? ''} defaultPhone={summary?.payoutPhone}
        disabled={!canOpenWithdrawal} onChangePhone={setPayoutPhone}
        onContinue={confirmPayoutForm} onClose={closePayoutForm} />
    </SafeAreaView>
  );
}
