import { styles } from '../features/screen-styles/app/driver-earnings/index';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { Colors } from '@/constants/styles';
import {
  useGetMyDriverEarningsQuery,
  useGetMyDriverPayoutsQuery,
  useGetMyDriverSettlementQuery,
} from '@/store/api/driverSettlementsApi';
import type { DriverEarning } from '@/types';
import { formatAmount, formatDate, maskPhone } from '@/features/driver-earnings/payoutModel';
import { PayoutHistory } from '@/features/driver-earnings/PayoutHistory';
import { useDriverPayout } from '@/hooks/driver-earnings/useDriverPayout';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const getPaymentModeLabel = (earning: DriverEarning) =>
  earning.paymentMode === 'points' ? 'Payé en jetons' : 'Paiement électronique';

export default function DriverEarningsScreen() {
  const isScreenActive = useScreenIsActive();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useGetMyDriverSettlementQuery(undefined, {
    pollingInterval: isScreenActive ? (60_000) : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const {
    data: earnings = [],
    isLoading: earningsLoading,
    isError: earningsError,
    refetch: refetchEarnings,
  } = useGetMyDriverEarningsQuery(undefined, {
    pollingInterval: isScreenActive ? (60_000) : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const {
    data: payouts = [],
    isError: payoutsError,
    refetch: refetchPayouts,
  } = useGetMyDriverPayoutsQuery(undefined, {
    pollingInterval: isScreenActive ? (60_000) : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });

  const sortedEarnings = useMemo(
    () =>
      [...earnings].sort(
        (left, right) =>
          Date.parse(right.availableAt ?? right.createdAt) -
          Date.parse(left.availableAt ?? left.createdAt),
      ),
    [earnings],
  );
  const recentPayouts = useMemo(
    () =>
      [...payouts]
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .slice(0, 6),
    [payouts],
  );
  const currency = summary?.currency ?? earnings[0]?.currency ?? 'CDF';
  const availableBalance = Number(summary?.availableBalance ?? 0);
  const commissionPercent = Math.round(Number(summary?.commissionRate ?? 0) * 100);
  const isLoading = summaryLoading || earningsLoading;
  const hasError = summaryError || earningsError;
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([refetchSummary(), refetchEarnings(), refetchPayouts()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchSummary, refetchEarnings, refetchPayouts]);
  const { canSubmit: canOpenWithdrawal, busy: isWithdrawing, handlePayout, checkPayout, storageError, hasUnconfirmedIntent } =
    useDriverPayout({ summary, payouts, refresh });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Retour" onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Revenus conducteur</Text>
          <Text style={styles.subtitle}>Courses créditées et versements Mobile Money</Text>
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

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(60)} style={styles.balanceSection}>
          <Text style={styles.eyebrow}>DISPONIBLE AU VERSEMENT</Text>
          {isLoading && !summary ? (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.loader} />
          ) : (
            <Text style={styles.balance}>{formatAmount(availableBalance, currency)}</Text>
          )}
          <Text style={styles.balanceHint}>
            Montant net après la commission Zwanga de {commissionPercent} %. Une course apparaît ici seulement après son paiement confirmé.
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            disabled={!canOpenWithdrawal}
            onPress={() => handlePayout()}
            style={[styles.payoutButton, !canOpenWithdrawal && styles.payoutButtonDisabled]}
          >
            {isWithdrawing ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Ionicons name="phone-portrait-outline" size={19} color={Colors.white} />
            )}
            <Text style={styles.payoutButtonText}>
              {isWithdrawing ? 'Vérification en cours…' : hasUnconfirmedIntent ? 'Vérifier ma demande' : 'Recevoir mes gains'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.payoutDestination}>
            Destination : {maskPhone(summary?.payoutPhone)} · Identité {summary?.kycApproved ? 'vérifiée' : 'à vérifier'}
          </Text>

          <Text style={styles.balanceHint}>
            Zwanga verse vos gains sur votre Mobile Money.
          </Text>
          {storageError && <Text style={styles.balanceHint}>Impossible de restaurer le suivi du versement sur ce téléphone. Contactez l’assistance avant une nouvelle demande.</Text>}
          <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/support')} style={styles.headerButton} accessibilityLabel="Contacter l’assistance pour mes gains">
            <Ionicons name="help-circle-outline" size={24} color={Colors.white} />
          </TouchableOpacity>

          <View style={styles.balanceBreakdown}>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Versement en cours</Text>
              <Text style={styles.breakdownValue}>
                {formatAmount(summary?.pendingPayoutBalance, currency)}
              </Text>
            </View>
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Déjà versé</Text>
              <Text style={styles.breakdownValue}>{formatAmount(summary?.paidBalance, currency)}</Text>
            </View>
          </View>
        </Animated.View>

        <PayoutHistory payouts={recentPayouts} availableBalance={availableBalance} busy={isWithdrawing}
          canRetry={canOpenWithdrawal && !hasUnconfirmedIntent} onRetry={handlePayout} onCheck={checkPayout}
          onSupport={() => router.push('/support')} />

        <Animated.View entering={FadeInDown.delay(150)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Courses créditées</Text>
              <Text style={styles.sectionMeta}>{sortedEarnings.length} opération(s)</Text>
            </View>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Actualisé</Text>
            </View>
          </View>

          {hasError && !isLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={28} color={Colors.gray[500]} />
              <Text style={styles.emptyTitle}>Revenus indisponibles</Text>
              <Text style={styles.emptyText}>Tirez vers le bas pour réessayer.</Text>
            </View>
          ) : sortedEarnings.length === 0 && !isLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={28} color={Colors.gray[500]} />
              <Text style={styles.emptyTitle}>Aucune course créditée</Text>
              <Text style={styles.emptyText}>
                Les gains apparaissent dès que le paiement de fin de trajet est confirmé.
              </Text>
            </View>
          ) : (
            sortedEarnings.map((earning, index) => (
              <Animated.View
                entering={FadeInDown.delay(180 + Math.min(index, 5) * 35)}
                key={earning.id}
                style={styles.earningRow}
              >
                <View style={styles.earningIcon}>
                  <Ionicons name="car-outline" size={20} color={Colors.primary} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{getPaymentModeLabel(earning)}</Text>
                  <Text style={styles.rowMeta}>
                    {formatDate(earning.availableAt ?? earning.createdAt)} · Brut{' '}
                    {formatAmount(earning.grossAmount, earning.currency)}
                  </Text>
                </View>
                <Text style={styles.earningAmount}>
                  +{formatAmount(earning.netAmount, earning.currency)}
                </Text>
              </Animated.View>
            ))
          )}

          {payoutsError && (
            <Text style={styles.inlineError}>L’historique des versements sera réactualisé automatiquement.</Text>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
