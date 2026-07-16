import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useGetPaymentHistoryQuery, useLazyGetPaymentDetailsQuery } from '@/store/api/paymentApi';
import type { PaymentHistoryItem, SubscriptionPaymentStatus } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type PaymentFilter = 'all' | 'succeeded' | 'pending' | 'failed';

const FILTERS: { id: PaymentFilter; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'succeeded', label: 'Validés' },
  { id: 'pending', label: 'En cours' },
  { id: 'failed', label: 'Échecs' },
];

const statusMeta: Record<
  SubscriptionPaymentStatus,
  { label: string; color: string; backgroundColor: string }
> = {
  pending: {
    label: 'En attente',
    color: Colors.warningDark,
    backgroundColor: Colors.warning + '18',
  },
  initiated: {
    label: 'Initié',
    color: Colors.infoDark,
    backgroundColor: Colors.info + '14',
  },
  succeeded: {
    label: 'Validé',
    color: Colors.successDark,
    backgroundColor: Colors.success + '16',
  },
  failed: {
    label: 'Échec',
    color: Colors.danger,
    backgroundColor: Colors.danger + '14',
  },
  cancelled: {
    label: 'Annulé',
    color: Colors.gray[700],
    backgroundColor: Colors.gray[200],
  },
};

const purposeLabels: Record<string, string> = {
  subscription_pro: 'Abonnement Pro',
  trip_booking: 'Réservation trajet',
  wallet_top_up: 'Recharge points',
  driver_payout: 'Paiement chauffeur',
  generic: 'Paiement',
};

const methodLabels: Record<string, string> = {
  mobile_money: 'Mobile Money',
  card: 'Carte',
};

const filterPayment = (payment: PaymentHistoryItem, filter: PaymentFilter) => {
  if (filter === 'all') return true;
  if (filter === 'pending') {
    return payment.status === 'pending' || payment.status === 'initiated';
  }
  if (filter === 'failed') {
    return payment.status === 'failed' || payment.status === 'cancelled';
  }
  return payment.status === filter;
};

const formatAmount = (amount: number | string, currency?: string | null) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return `${amount} ${currency || 'CDF'}`;
  }

  return `${Math.round(numericAmount).toLocaleString('fr-FR')} ${currency || 'CDF'}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Non disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Non disponible';

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getPaymentTitle = (payment: PaymentHistoryItem) =>
  payment.description?.trim() || purposeLabels[payment.purpose] || 'Paiement';

const sanitizeFileSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'paiement';

const formatValue = (value?: string | null) => value?.trim() || 'Non disponible';

const waitForNativePresentation = () =>
  new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(resolve, 120);
    });
  });

const getPaymentDetailRows = (payment: PaymentHistoryItem) => {
  const meta = statusMeta[payment.status];

  return [
    { label: 'Paiement', value: getPaymentTitle(payment) },
    { label: 'Montant', value: formatAmount(payment.amount, payment.currency) },
    { label: 'Statut', value: meta?.label ?? payment.status },
    { label: 'Type', value: purposeLabels[payment.purpose] || payment.purpose },
    { label: 'Methode', value: methodLabels[payment.method] ?? payment.method },
    { label: 'Prestataire', value: payment.provider },
    { label: 'Reference Zwanga', value: payment.reference },
    { label: 'Commande FlexPay', value: formatValue(payment.orderNumber) },
    { label: 'Reference operateur', value: formatValue(payment.providerReference) },
    { label: 'Code statut', value: formatValue(payment.statusCode) },
    { label: 'Telephone', value: formatValue(payment.phone) },
    { label: 'Message', value: formatValue(payment.message) },
    { label: 'Cree le', value: formatDate(payment.createdAt) },
    { label: 'Mis a jour le', value: formatDate(payment.updatedAt) },
    { label: 'Valide le', value: formatDate(payment.paidAt) },
    { label: 'Identifiant', value: payment.id },
  ];
};

const toPdfSafeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const escapePdfText = (value: string) =>
  toPdfSafeText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const wrapPdfText = (value: string, maxLength = 58) => {
  const words = toPdfSafeText(value).split(' ').filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    if (!currentLine) {
      currentLine = word;
      return;
    }

    if (`${currentLine} ${word}`.length <= maxLength) {
      currentLine = `${currentLine} ${word}`;
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : ['Non disponible'];
};

const encodeBase64 = (input: string) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';

  for (let index = 0; index < input.length; index += 3) {
    const byte1 = input.charCodeAt(index) & 0xff;
    const byte2 = input.charCodeAt(index + 1) & 0xff;
    const byte3 = input.charCodeAt(index + 2) & 0xff;
    const hasByte2 = index + 1 < input.length;
    const hasByte3 = index + 2 < input.length;

    output += chars.charAt(byte1 >> 2);
    output += chars.charAt(((byte1 & 3) << 4) | (hasByte2 ? byte2 >> 4 : 0));
    output += hasByte2 ? chars.charAt(((byte2 & 15) << 2) | (hasByte3 ? byte3 >> 6 : 0)) : '=';
    output += hasByte3 ? chars.charAt(byte3 & 63) : '=';
  }

  return output;
};

const buildPaymentPdfBase64 = (payment: PaymentHistoryItem) => {
  const rows = getPaymentDetailRows(payment);
  const operations: string[] = [];
  let y = 742;

  const addText = (x: number, textY: number, size: number, font: 'F1' | 'F2', text: string) => {
    operations.push(`BT /${font} ${size} Tf 1 0 0 1 ${x} ${textY} Tm (${escapePdfText(text)}) Tj ET`);
  };

  operations.push('0.98 0.98 0.98 rg 0 0 612 792 re f');
  operations.push('1 1 1 rg 40 40 532 712 re f');
  operations.push('0.95 0.95 0.95 rg 40 680 532 1 re f');
  operations.push('0 0 0 rg');
  addText(58, y, 20, 'F2', 'ZWANGA');
  y -= 26;
  addText(58, y, 16, 'F2', 'Detail du paiement');
  y -= 18;
  addText(58, y, 10, 'F1', `Genere le ${formatDate(new Date().toISOString())}`);
  y -= 42;

  rows.forEach((row) => {
    if (y < 72) {
      return;
    }

    addText(58, y, 10, 'F2', row.label);
    const valueLines = wrapPdfText(String(row.value), 62).slice(0, 4);
    valueLines.forEach((line, index) => {
      addText(210, y - index * 14, 10, 'F1', line);
    });
    y -= Math.max(24, valueLines.length * 14 + 8);
  });

  addText(58, 58, 9, 'F1', 'Document genere depuis l application Zwanga.');

  const stream = operations.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return encodeBase64(pdf);
};

export default function PaymentHistoryScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const isDownloadingRef = useRef(false);
  const [activeFilter, setActiveFilter] = useState<PaymentFilter>('all');
  const [selectedPayment, setSelectedPayment] = useState<PaymentHistoryItem | null>(null);
  const [loadingDetailsPaymentId, setLoadingDetailsPaymentId] = useState<string | null>(null);
  const [downloadingPaymentId, setDownloadingPaymentId] = useState<string | null>(null);
  const {
    data: payments = [],
    isLoading,
    isFetching,
    refetch,
  } = useGetPaymentHistoryQuery();
  const [getPaymentDetails] = useLazyGetPaymentDetailsQuery();

  const filteredPayments = useMemo(
    () => payments.filter((payment) => filterPayment(payment, activeFilter)),
    [activeFilter, payments],
  );

  const totalSucceeded = useMemo(
    () =>
      payments
        .filter((payment) => payment.status === 'succeeded')
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    [payments],
  );

  const handleOpenPaymentDetails = async (payment: PaymentHistoryItem) => {
    try {
      setLoadingDetailsPaymentId(payment.id);
      const details = await getPaymentDetails(payment.id).unwrap();
      setSelectedPayment(details);
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Detail indisponible',
        message:
          error?.data?.message ||
          error?.message ||
          'Impossible de charger le detail du paiement pour le moment.',
      });
    } finally {
      setLoadingDetailsPaymentId(null);
    }
  };

  const handleDownloadPayment = async (payment: PaymentHistoryItem) => {
    if (isDownloadingRef.current) {
      return;
    }

    isDownloadingRef.current = true;

    try {
      setDownloadingPaymentId(payment.id);
      const details =
        selectedPayment?.id === payment.id
          ? selectedPayment
          : await getPaymentDetails(payment.id).unwrap();

      const shouldCloseDetailBeforeShare = selectedPayment?.id === details.id;
      if (shouldCloseDetailBeforeShare) {
        setSelectedPayment(null);
        await waitForNativePresentation();
      }

      const pdfBase64 = buildPaymentPdfBase64(details);
      const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;

      if (!directory) {
        throw new Error('Stockage local indisponible');
      }

      const fileName = `zwanga-paiement-${sanitizeFileSegment(details.reference)}.pdf`;
      const fileUri = `${directory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
        encoding: FileSystem.EncodingType?.Base64 || ('base64' as any),
      });
      let sharedUri = fileUri;

      if (Platform.OS === 'android' && FileSystem.getContentUriAsync) {
        try {
          sharedUri = await FileSystem.getContentUriAsync(fileUri);
        } catch (error) {
          console.warn('[PaymentHistory] Failed to create Android content URI:', error);
        }
      }

      await Share.share({
        title: `Détail paiement ${details.reference}`,
        message:
          Platform.OS === 'android'
            ? `Detail du paiement ${details.reference}\n${sharedUri}`
            : `Detail du paiement ${details.reference}`,
        url: Platform.OS === 'ios' ? sharedUri : undefined,
      });
      if (!shouldCloseDetailBeforeShare && selectedPayment?.id === details.id) {
        setSelectedPayment(details);
      }

      showDialog({
        variant: 'success',
        title: 'Détail généré',
        message: `Le détail du paiement a été préparé.\n\nFichier: ${fileName}`,
      });
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Téléchargement impossible',
        message:
          error?.data?.message ||
          error?.message ||
          'Impossible de générer le détail du paiement pour le moment.',
      });
    } finally {
      isDownloadingRef.current = false;
      setDownloadingPaymentId(null);
    }
  };

  const renderPayment = (payment: PaymentHistoryItem) => {
    const meta = statusMeta[payment.status] ?? statusMeta.pending;
    const isDownloading = downloadingPaymentId === payment.id;
    const isLoadingDetails = loadingDetailsPaymentId === payment.id;

    return (
      <View key={payment.id} style={styles.paymentRow}>
        <TouchableOpacity
          style={styles.paymentMain}
          onPress={() => handleOpenPaymentDetails(payment)}
          disabled={isLoadingDetails}
          activeOpacity={0.75}
          accessibilityLabel="Voir le detail du paiement"
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
          {payment.message ? (
            <Text style={styles.paymentMessage} numberOfLines={2}>
              {payment.message}
            </Text>
          ) : null}
          <View style={styles.paymentDetailHint}>
            {isLoadingDetails ? (
              <ActivityIndicator size="small" color={Colors.gray[500]} />
            ) : (
              <>
                <Text style={styles.paymentDetailHintText}>Voir le detail</Text>
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
            {payments.length} transaction{payments.length > 1 ? 's' : ''} enregistrée{payments.length > 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => {
              void refetch();
            }}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <View style={styles.summaryBand}>
          <Text style={styles.summaryLabel}>Total validé</Text>
          <Text style={styles.summaryValue}>{formatAmount(totalSucceeded, 'CDF')}</Text>
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

        {isLoading ? (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.stateText}>Chargement des paiements...</Text>
          </View>
        ) : filteredPayments.length === 0 ? (
          <View style={styles.stateBlock}>
            <Ionicons name="receipt-outline" size={32} color={Colors.gray[400]} />
            <Text style={styles.stateTitle}>Aucun paiement</Text>
            <Text style={styles.stateText}>
              Les transactions apparaîtront ici dès qu’un paiement sera initié.
            </Text>
          </View>
        ) : (
          <View style={styles.paymentList}>{filteredPayments.map(renderPayment)}</View>
        )}
      </ScrollView>

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
                  <Text style={styles.detailTitle}>Detail du paiement</Text>
                  <Text style={styles.detailSubtitle} numberOfLines={1}>
                    {selectedPayment.reference}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.detailCloseButton}
                  onPress={() => setSelectedPayment(null)}
                  accessibilityLabel="Fermer le detail du paiement"
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
                  <Text style={styles.detailPrimaryButtonText}>Telecharger PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: Spacing.xxl,
  },
  summaryBand: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  summaryLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  summaryValue: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xxl,
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
  },
  filters: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  filterButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  filterButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.sm,
  },
  filterTextActive: {
    color: Colors.white,
  },
  paymentList: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.gray[100],
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    gap: Spacing.md,
  },
  paymentMain: {
    flex: 1,
    minWidth: 0,
  },
  paymentTopLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  paymentTitle: {
    flex: 1,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  paymentAmount: {
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  paymentMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  paymentMetaText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  referenceText: {
    marginTop: Spacing.sm,
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
  },
  paymentMessage: {
    marginTop: Spacing.xs,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
  },
  paymentDetailHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  paymentDetailHintText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  downloadButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl * 2,
    gap: Spacing.sm,
  },
  stateTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  stateText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  detailOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  detailSheet: {
    maxHeight: '88%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  detailHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  detailTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  detailSubtitle: {
    marginTop: 2,
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
  },
  detailCloseButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
  },
  detailContent: {
    maxHeight: 520,
  },
  detailContentInner: {
    paddingBottom: Spacing.lg,
  },
  detailSummary: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  detailSummaryLabel: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  detailSummaryAmount: {
    marginTop: Spacing.xs,
    color: Colors.gray[900],
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
  },
  detailStatusBadge: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  detailStatusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  detailRows: {
    paddingHorizontal: Spacing.xl,
  },
  detailRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  detailRowLabel: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  detailRowValue: {
    marginTop: 4,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.medium,
  },
  detailActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  detailSecondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  detailSecondaryButtonText: {
    color: Colors.gray[800],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  detailPrimaryButton: {
    flex: 1.3,
    height: 48,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
  },
  detailPrimaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  disabledButton: {
    opacity: 0.7,
  },
});
