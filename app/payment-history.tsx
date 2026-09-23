import { usePaymentReceiptDownload } from '../hooks/payment-history/usePaymentReceiptDownload';
import {
  PaymentFilter,
  FILTERS,
  statusMeta,
  methodLabels,
  formatAmount,
  formatDate,
  getPaymentTitle,
  formatPaymentMessage,
  getPaymentDetailRows,
} from '../features/payment-history/paymentHistoryModel';
import { styles } from '../features/screen-styles/app/payment-history/index';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors, Spacing } from '@/constants/styles';
import { useGetPaymentHistoryPageQuery, useGetPaymentHistorySummaryQuery, useLazyGetPaymentDetailsQuery } from '@/store/api/paymentApi';
import { useHistoryCursor } from '@/hooks/useHistoryCursor';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { HistoryPagination } from '@/components/ui/HistoryPagination';
import type { PaymentHistoryItem } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
const rowBackground = { backgroundColor: Colors.white };
const pageInsets = { paddingHorizontal: Spacing.xl };

export default function PaymentHistoryScreen() {
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId?: string | string[] }>();
  const { showDialog } = useDialog();
  const isDownloadingRef = useRef(false);
  const openedPaymentIdRef = useRef<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<PaymentFilter>('all');
  const isScreenActive = useScreenIsActive();
  const cursor = useHistoryCursor(activeFilter);
  const [selectedPayment, setSelectedPayment] = useState<PaymentHistoryItem | null>(null);
  const [loadingDetailsPaymentId, setLoadingDetailsPaymentId] = useState<string | null>(null);
  const [downloadingPaymentId, setDownloadingPaymentId] = useState<string | null>(null);
  const {
    currentData: paymentPage,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetPaymentHistoryPageQuery({ filter: activeFilter, before: cursor.before }, {
    skip: !isScreenActive, refetchOnMountOrArgChange: 30,
  });
  const payments = paymentPage?.data ?? [];
  const { data: summary, refetch: refetchSummary } = useGetPaymentHistorySummaryQuery(undefined, {
    skip: !isScreenActive, refetchOnMountOrArgChange: 30,
  });
  const [getPaymentDetails] = useLazyGetPaymentDetailsQuery();

  const handleOpenPaymentDetails = async (payment: PaymentHistoryItem) => {
    try {
      setLoadingDetailsPaymentId(payment.id);
      const details = await getPaymentDetails(payment.id).unwrap();
      setSelectedPayment(details);
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Détail indisponible',
        message: getApiErrorMessage(
          error,
          'Impossible de charger le détail du paiement pour le moment.',
        ),
      });
    } finally {
      setLoadingDetailsPaymentId(null);
    }
  };

  useEffect(() => {
    const requestedPaymentId = Array.isArray(paymentId) ? paymentId[0] : paymentId;
    if (!requestedPaymentId || openedPaymentIdRef.current === requestedPaymentId) return;

    openedPaymentIdRef.current = requestedPaymentId;
    setLoadingDetailsPaymentId(requestedPaymentId);
    void getPaymentDetails(requestedPaymentId)
      .unwrap()
      .then((details) => setSelectedPayment(details))
      .catch((error: any) => {
        openedPaymentIdRef.current = null;
        showDialog({
          variant: 'danger',
          title: 'Detail indisponible',
          message: getApiErrorMessage(error, 'Impossible de charger la facture pour le moment.'),
        });
      })
      .finally(() => setLoadingDetailsPaymentId(null));
  }, [getPaymentDetails, paymentId, showDialog]);

  const { handleDownloadPayment } = usePaymentReceiptDownload({
    isDownloadingRef,
    setDownloadingPaymentId,
    selectedPayment,
    getPaymentDetails,
    setSelectedPayment,
    showDialog,
  });

  const renderPayment = (payment: PaymentHistoryItem) => {
    const meta = statusMeta[payment.status] ?? statusMeta.pending;
    const isDownloading = downloadingPaymentId === payment.id;
    const isLoadingDetails = loadingDetailsPaymentId === payment.id;
    const paymentMessage = formatPaymentMessage(payment.message);

    return (
      <View key={payment.id} style={[styles.paymentRow, rowBackground]}>
        <TouchableOpacity
          style={styles.paymentMain}
          onPress={() => handleOpenPaymentDetails(payment)}
          disabled={isLoadingDetails}
          activeOpacity={0.75}
          accessibilityLabel="Voir le détail du paiement"
        >
          <View style={styles.paymentTopLine}>
            <Text style={styles.paymentTitle} numberOfLines={1}>
              {getPaymentTitle(payment)}
            </Text>
            <Text style={styles.paymentAmount}>
              {formatAmount(payment.amount, payment.currency)}
            </Text>
          </View>

          <View style={styles.paymentMetaLine}>
            <View style={[styles.statusBadge, { backgroundColor: meta.backgroundColor }]}>
              <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <Text style={styles.paymentMetaText}>{methodLabels[payment.method] ?? payment.method}</Text>
            <Text style={styles.paymentMetaText}>{formatDate(payment.createdAt)}</Text>
          </View>

          <Text style={styles.referenceText} numberOfLines={1}>
            Réf. {payment.reference}
          </Text>
          {paymentMessage ? (
            <Text style={styles.paymentMessage} numberOfLines={2}>
              {paymentMessage}
            </Text>
          ) : null}
          <View style={styles.paymentDetailHint}>
            {isLoadingDetails ? (
              <ActivityIndicator size="small" color={Colors.gray[500]} />
            ) : (
              <>
                <Text style={styles.paymentDetailHintText}>Voir le détail</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
              </>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.downloadButton}
          onPress={() => handleDownloadPayment(payment)}
          disabled={isDownloading}
          accessibilityLabel="Télécharger le détail du paiement"
        >
          {isDownloading ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="download-outline" size={20} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Historique paiements</Text>
          <Text style={styles.headerSubtitle}>
            {summary ? `${summary.total} transaction${summary.total > 1 ? 's' : ''} enregistrée${summary.total > 1 ? 's' : ''}` : 'Vos transactions'}
          </Text>
        </View>
      </View>

      <FlatList
        data={payments}
        keyExtractor={payment => payment.id}
        renderItem={({ item }) => renderPayment(item)}
        initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
        extraData={{ loadingDetailsPaymentId, downloadingPaymentId }}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => {
              if (isScreenActive) void Promise.allSettled([refetch(), refetchSummary()]);
            }}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        ListHeaderComponent={<>
        <View style={styles.summaryBand}>
          <Text style={styles.summaryLabel}>Total validé</Text>
          <Text style={styles.summaryValue}>{summary
            ? summary.succeededByCurrency.map(row => formatAmount(row.amount, row.currency)).join(' · ') || formatAmount(0, 'CDF')
            : '—'}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((filter) => {
            const active = activeFilter === filter.id;
            return (
              <TouchableOpacity
                key={filter.id}
                style={[styles.filterButton, active && styles.filterButtonActive]}
                onPress={() => setActiveFilter(filter.id)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        </>}
        ListEmptyComponent={isLoading || (isFetching && !paymentPage) ? (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.stateText}>Chargement des paiements...</Text>
          </View>
        ) : !isError ? (
          <View style={styles.stateBlock}>
            <Ionicons name="receipt-outline" size={32} color={Colors.gray[400]} />
            <Text style={styles.stateTitle}>Aucun paiement</Text>
            <Text style={styles.stateText}>
              Les transactions apparaîtront ici dès qu’un paiement sera initié.
            </Text>
          </View>
        ) : null}
        ListFooterComponent={<View style={pageInsets}><HistoryPagination page={cursor.page} hasNext={Boolean(paymentPage?.nextCursor)}
          busy={isFetching} error={isError} onPrevious={cursor.previous}
          onNext={() => cursor.next(paymentPage?.nextCursor)} onRetry={() => { if (isScreenActive) void refetch(); }} /></View>}
      />

      {selectedPayment ? (
        <Modal
          visible={Boolean(selectedPayment)}
          animationType="slide"
          transparent
          onRequestClose={() => setSelectedPayment(null)}
        >
          <View style={styles.detailOverlay}>
            <View style={styles.detailSheet}>
              <View style={styles.detailHeader}>
                <View style={styles.detailHeaderText}>
                  <Text style={styles.detailTitle}>Détail du paiement</Text>
                  <Text style={styles.detailSubtitle} numberOfLines={1}>
                    {selectedPayment.reference}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.detailCloseButton}
                  onPress={() => setSelectedPayment(null)}
                  accessibilityLabel="Fermer le détail du paiement"
                >
                  <Ionicons name="close" size={22} color={Colors.gray[700]} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.detailContent}
                contentContainerStyle={styles.detailContentInner}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.detailSummary}>
                  <Text style={styles.detailSummaryLabel}>{getPaymentTitle(selectedPayment)}</Text>
                  <Text style={styles.detailSummaryAmount}>
                    {formatAmount(selectedPayment.amount, selectedPayment.currency)}
                  </Text>
                  <View
                    style={[
                      styles.detailStatusBadge,
                      {
                        backgroundColor:
                          (statusMeta[selectedPayment.status] ?? statusMeta.pending).backgroundColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.detailStatusText,
                        { color: (statusMeta[selectedPayment.status] ?? statusMeta.pending).color },
                      ]}
                    >
                      {(statusMeta[selectedPayment.status] ?? statusMeta.pending).label}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRows}>
                  {getPaymentDetailRows(selectedPayment).map((row) => (
                    <View key={row.label} style={styles.detailRow}>
                      <Text style={styles.detailRowLabel}>{row.label}</Text>
                      <Text style={styles.detailRowValue}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.detailActions}>
                <TouchableOpacity
                  style={styles.detailSecondaryButton}
                  onPress={() => setSelectedPayment(null)}
                >
                  <Text style={styles.detailSecondaryButtonText}>Fermer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.detailPrimaryButton,
                    downloadingPaymentId === selectedPayment.id && styles.disabledButton,
                  ]}
                  onPress={() => handleDownloadPayment(selectedPayment)}
                  disabled={downloadingPaymentId === selectedPayment.id}
                >
                  {downloadingPaymentId === selectedPayment.id ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Ionicons name="download-outline" size={18} color={Colors.white} />
                  )}
                  <Text style={styles.detailPrimaryButtonText}>Télécharger PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}
