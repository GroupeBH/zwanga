import { styles } from '../features/screen-styles/app/driver-earnings/index';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import {
  useGetMyDriverEarningsQuery,
  useGetMyDriverPayoutsQuery,
  useGetMyDriverSettlementQuery,
  useRequestDriverPayoutMutation,
} from '@/store/api/driverSettlementsApi';
import type { DriverEarning, DriverPayoutStatus } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const formatAmount = (value?: number | string | null, currency = 'CDF') => {
  const amount = Number(value ?? 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 2,
  }).format(safeAmount)} ${currency}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Date indisponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date indisponible';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const maskPhone = (value?: string | null) => {
  if (!value) return 'numéro du profil';
  const phone = value.trim();
  return phone.length > 8 ? `${phone.slice(0, 5)}•••${phone.slice(-4)}` : phone;
};

const getPaymentModeLabel = (earning: DriverEarning) =>
  earning.paymentMode === 'points' ? 'Payé en jetons' : 'Paiement électronique';

const PAYOUT_STATUS: Record<
  DriverPayoutStatus,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  pending: { label: 'Confirmation en attente', icon: 'time-outline', color: Colors.warningDark },
  initiated: { label: 'Traitement FlexPay', icon: 'sync-outline', color: Colors.infoDark },
  succeeded: { label: 'Versé', icon: 'checkmark-circle-outline', color: Colors.successDark },
  failed: { label: 'Échec — solde libéré', icon: 'alert-circle-outline', color: Colors.danger },
  cancelled: { label: 'Annulé — solde libéré', icon: 'close-circle-outline', color: Colors.gray[600] },
};

export default function DriverEarningsScreen() {
  const isScreenActive = useScreenIsActive();
  const router = useRouter();
  const { showDialog } = useDialog();
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
  const [requestPayout, { isLoading: isWithdrawing }] = useRequestDriverPayoutMutation();

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
  const minimumPayout = Number(summary?.minimumPayoutAmount ?? 1);
  const commissionPercent = Math.round(Number(summary?.commissionRate ?? 0) * 100);
  const isLoading = summaryLoading || earningsLoading;
  const hasError = summaryError || earningsError;
  const canOpenWithdrawal =
    Boolean(summary) && availableBalance >= minimumPayout && !isWithdrawing;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([refetchSummary(), refetchEarnings(), refetchPayouts()]);
    } finally {
      setRefreshing(false);
    }
  };

  const submitPayout = async (amount: number) => {
    try {
      const payout = await requestPayout({
        amount,
        idempotencyKey: Crypto.randomUUID(),
      }).unwrap();
      await refresh();

      if (payout.status === 'succeeded') {
        showDialog({
          variant: 'success',
          title: 'Versement confirmé',
          message: `${formatAmount(payout.amount, payout.currency)} ont été versés sur ${maskPhone(
            payout.phone,
          )}.`,
        });
        return;
      }

      showDialog({
        variant: 'info',
        title: 'Retrait transmis',
        message: `${formatAmount(payout.amount, payout.currency)} sont réservés pendant la confirmation FlexPay. Aucun second retrait ne sera créé si la connexion est interrompue.`,
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Retrait impossible',
        message: getApiErrorMessage(
          error,
          "Le retrait n’a pas pu être lancé. Votre solde reste disponible.",
        ),
      });
    }
  };

  const handlePayout = (requestedAmount = availableBalance) => {
    if (!summary) return;
    if (!summary.kycApproved) {
      showDialog({
        variant: 'warning',
        title: 'Vérification requise',
        message: 'Votre identité doit être vérifiée avant tout versement Mobile Money.',
      });
      return;
    }
    if (requestedAmount < minimumPayout || requestedAmount > availableBalance) {
      showDialog({
        variant: 'warning',
        title: 'Solde insuffisant',
        message: `Le retrait minimum est de ${formatAmount(minimumPayout, currency)}.`,
      });
      return;
    }

    showDialog({
      variant: 'info',
      icon: 'phone-portrait-outline',
      title: 'Confirmer le versement',
      message: `${formatAmount(requestedAmount, currency)} seront envoyés par FlexPay vers ${maskPhone(
        summary.payoutPhone,
      )}. Le montant restera bloqué jusqu’à la confirmation finale.`,
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        { label: 'Confirmer', variant: 'primary', onPress: () => submitPayout(requestedAmount) },
      ],
    });
  };

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
              {isWithdrawing ? 'Envoi en cours…' : 'Recevoir sur Mobile Money'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.payoutDestination}>
            Destination : {maskPhone(summary?.payoutPhone)} · Identité {summary?.kycApproved ? 'vérifiée' : 'à vérifier'}
          </Text>

          <View style={styles.balanceBreakdown}>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Retrait en cours</Text>
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

        {recentPayouts.length > 0 && (
          <Animated.View entering={FadeInDown.delay(110)} style={styles.section}>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionTitle}>Versements récents</Text>
                <Text style={styles.sectionMeta}>Suivi de la confirmation FlexPay</Text>
              </View>
            </View>
            {recentPayouts.map((payout) => {
              const presentation = PAYOUT_STATUS[payout.status];
              return (
                <View key={payout.id} style={styles.payoutRow}>
                  <Ionicons name={presentation.icon} size={21} color={presentation.color} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{formatAmount(payout.amount, payout.currency)}</Text>
                    <Text style={[styles.rowMeta, { color: presentation.color }]}>
                      {presentation.label} · {formatDate(payout.processedAt ?? payout.requestedAt ?? payout.createdAt)}
                    </Text>
                  </View>
                  {(['failed', 'cancelled'] as DriverPayoutStatus[]).includes(payout.status) &&
                    Number(payout.amount) <= availableBalance && (
                      <TouchableOpacity
                        accessibilityLabel="Relancer ce retrait"
                        disabled={isWithdrawing}
                        onPress={() => handlePayout(Number(payout.amount))}
                        style={styles.retryButton}
                      >
                        <Text style={styles.retryButtonText}>Réessayer</Text>
                      </TouchableOpacity>
                    )}
                </View>
              );
            })}
          </Animated.View>
        )}

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


