import { styles } from '../features/screen-styles/app/driver-earnings/index';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled, useDisplayRefetch, useDisplayReadData } from '@/hooks/useDisplayReads';
import { Colors, Spacing } from '@/constants/styles';
import {
  useGetDriverEarningsPageQuery,
  useGetDriverPayoutsPageQuery,
  useGetMyDriverSettlementQuery,
} from '@/store/api/driverSettlementsApi';
import { formatAmount } from '@/features/driver-earnings/payoutModel';
import { CashRevenueSummary } from '@/features/driver-earnings/CashRevenueSummary';
import { DriverEarningRow } from '@/features/driver-earnings/DriverEarningRow';
import { PayoutHistory } from '@/features/driver-earnings/PayoutHistory';
import { PayoutDestinationModal } from '@/features/driver-earnings/PayoutDestinationModal';
import { useDriverPayout } from '@/hooks/driver-earnings/useDriverPayout';
import { useHistoryCursor } from '@/hooks/useHistoryCursor';
import { HistoryPagination } from '@/components/ui/HistoryPagination';
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
  const [history, setHistory] = useState<'earnings' | 'payouts'>('earnings');
  const [showBalanceDetails, setShowBalanceDetails] = useState(false);
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
    payoutForm, openPayoutForm, setPayoutPhone, setPayoutAmount, confirmPayoutForm, closePayoutForm } =
    useDriverPayout({ summary, payouts, refresh, isActive: isScreenActive });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Retour" onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Mes gains</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel="Contacter l’assistance pour mes gains"
          onPress={() => router.push('/support')}
          style={styles.headerButton}
        >
          <Ionicons name="help-circle-outline" size={24} color={Colors.gray[700]} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={history === 'earnings' ? earnings : []} keyExtractor={earning => earning.id}
        initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
        renderItem={({ item: earning }) => <View style={pageInsets}><DriverEarningRow earning={earning} /></View>}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<>
        <View style={styles.balanceSection}>
          <Text style={styles.eyebrow}>Disponible à retirer</Text>
          {isLoading && !summary ? (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.loader} />
          ) : (
            <Text style={styles.balance}>{summary ? formatAmount(availableBalance, currency) : '—'}</Text>
          )}
          <Text style={styles.balanceHint}>Sur votre Mobile Money, en partie ou en totalité.</Text>

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
              {isWithdrawing ? 'Vérification en cours…' : hasUnconfirmedIntent ? 'Vérifier mon retrait' : 'Retirer mes gains'}
            </Text>
          </TouchableOpacity>
          {summary && !canOpenWithdrawal && !isWithdrawing && !storageError && !hasUnconfirmedIntent && availableBalance < summary.minimumPayoutAmount &&
            <Text style={styles.balanceHint}>Minimum de retrait : {formatAmount(summary.minimumPayoutAmount, currency)}</Text>}
          {summary && !summary.kycApproved && <Text style={styles.inlineError}>Votre identité doit être vérifiée avant un retrait.</Text>}
          {storageError && <Text style={styles.inlineError}>Le dernier retrait doit être vérifié. Contactez l’assistance avant de réessayer.</Text>}
          {summaryError && <Text style={styles.inlineError}>Solde non actualisé. Tirez vers le bas pour réessayer.</Text>}

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
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showBalanceDetails }}
            onPress={() => setShowBalanceDetails(value => !value)} style={styles.detailsButton}>
            <Text style={styles.detailsText}>Comprendre mon solde</Text>
            <Ionicons name={showBalanceDetails ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gray[600]} />
          </TouchableOpacity>
          {showBalanceDetails && <Text style={styles.balanceHint}>
            Paiements électroniques et jetons, après commission{summary ? ` (${commissionPercent} %)` : ''}, plus les participations Zwanga créditées. Les espèces reçues des passagers ne sont pas incluses.
          </Text>}
        </View>

        <CashRevenueSummary amount={summary?.cashReceivedAmount} currency={currency} />

        <View style={styles.historyTabs} accessibilityRole="tablist">
          {(['earnings', 'payouts'] as const).map(tab => <TouchableOpacity key={tab} accessibilityRole="tab"
            accessibilityState={{ selected: history === tab }} onPress={() => setHistory(tab)}
            style={[styles.historyTab, history === tab && styles.historyTabSelected]}>
            <Text style={[styles.historyTabText, history === tab && styles.historyTabTextSelected]}>{tab === 'earnings' ? 'Gains' : 'Retraits'}</Text>
          </TouchableOpacity>)}
        </View>

        {history === 'payouts' && <><PayoutHistory payouts={payouts} availableBalance={availableBalance} busy={isWithdrawing}
          canRetry={canOpenWithdrawal && !hasUnconfirmedIntent} onRetry={openPayoutForm} onCheck={checkPayout} onReview={requestPayoutReview}
          onSupport={() => router.push('/support')} />
        <View style={pageInsets}><HistoryPagination page={payoutsCursor.page} hasNext={Boolean(payoutsPage?.nextCursor)}
          busy={payoutsFetching} error={payoutsError} onPrevious={payoutsCursor.previous}
          onNext={() => payoutsCursor.next(payoutsPage?.nextCursor)} onRetry={() => { if (isScreenActive) void refetchPayouts(); }} /></View></>}

        {history === 'earnings' && <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Historique des gains</Text>
              <Text style={styles.sectionMeta}>{earningsPage?.total ?? '—'} opération(s)</Text>
            </View>
          </View>

        </View>}
        </>}
        ListEmptyComponent={history === 'payouts' ? (payoutsFetching && !payoutsPage ? <ActivityIndicator color={Colors.primary} /> :
          !payouts.length ? <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{payoutsError ? 'Retraits indisponibles' : 'Aucun retrait pour le moment'}</Text>
            <Text style={styles.emptyText}>{payoutsError ? 'Tirez vers le bas pour réessayer.' : 'Vos retraits apparaîtront ici.'}</Text>
          </View> : null) : hasError && !isLoading ? (
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
                Vos gains apparaîtront ici après confirmation du paiement.
              </Text>
            </View>
          ) : <ActivityIndicator color={Colors.primary} />}
        ListFooterComponent={history === 'earnings' ? <View style={pageInsets}><HistoryPagination page={earningsCursor.page} hasNext={Boolean(earningsPage?.nextCursor)}
          busy={earningsFetching} error={earningsError} onPrevious={earningsCursor.previous}
          onNext={() => earningsCursor.next(earningsPage?.nextCursor)} onRetry={() => { if (isScreenActive) void refetchEarnings(); }} /></View> : null}
      />
      <PayoutDestinationModal visible={Boolean(payoutForm)} amount={payoutForm?.amount ?? ''}
        availableBalance={availableBalance} minimumAmount={summary?.minimumPayoutAmount ?? 1}
        currency={currency} phone={payoutForm?.phone ?? ''} defaultPhone={summary?.payoutPhone}
        disabled={!canOpenWithdrawal} onChangePhone={setPayoutPhone} onChangeAmount={setPayoutAmount}
        onContinue={confirmPayoutForm} onClose={closePayoutForm} />
    </SafeAreaView>
  );
}
