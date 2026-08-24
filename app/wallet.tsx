import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useGetMyWalletQuery,
  useGetWalletLedgerQuery,
  useInitiateWalletTopUpMutation,
  useLazyCheckWalletTopUpStatusQuery,
  useTransferWalletPointsMutation,
} from '@/store/api/walletApi';
import type { SubscriptionPaymentMethod, WalletLedgerEntry, WalletLedgerEntryType } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { openExternalUrlSafely } from '@/utils/safeExternalUrl';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type WalletTab = 'top_up' | 'transfer';

const DRC_PAYMENT_PHONE_PREFIX = '+243';
const DRC_PAYMENT_PHONE_REGEX = /^\+243\d{9}$/;

const TOP_UP_METHOD_OPTIONS: {
  id: SubscriptionPaymentMethod;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'mobile_money',
    label: 'Mobile Money',
    hint: 'M-Pesa, Airtel, Orange',
    icon: 'phone-portrait-outline',
  },
  {
    id: 'card',
    label: 'Carte',
    hint: 'Visa ou Mastercard',
    icon: 'card-outline',
  },
];

const LEDGER_META: Record<
  WalletLedgerEntryType,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  top_up: { label: 'Recharge', icon: 'add-circle-outline', color: Colors.successDark },
  loyalty_reward: { label: 'Fidélité', icon: 'sparkles-outline', color: Colors.secondaryDark },
  booking_payment: { label: 'Trajet paye', icon: 'car-outline', color: Colors.danger },
  booking_refund: { label: 'Remboursement', icon: 'return-down-back-outline', color: Colors.success },
  booking_fare_adjustment: { label: 'Ajustement trajet', icon: 'swap-horizontal-outline', color: Colors.infoDark },
  subscription_payment: { label: 'Abonnement', icon: 'shield-checkmark-outline', color: Colors.danger },
  subscription_reward: { label: 'Bonus abonnement', icon: 'gift-outline', color: Colors.successDark },
  transfer_out: { label: 'Partage envoyé', icon: 'arrow-up-circle-outline', color: Colors.danger },
  transfer_in: { label: 'Partage reçu', icon: 'arrow-down-circle-outline', color: Colors.successDark },
};

const formatWalletAmount = (amount?: number | string | null, currency?: string | null) => {
  const numericAmount = Number(amount);
  const isTokenCurrency = !currency || currency.toUpperCase() === 'PTS';
  const displayCurrency = currency || 'PTS';
  if (!Number.isFinite(numericAmount)) return `${amount ?? 0} ${displayCurrency}`;

  const absoluteAmount = Math.abs(numericAmount);
  const formatted =
    absoluteAmount % 1 === 0
      ? Math.round(absoluteAmount).toLocaleString('fr-FR')
      : absoluteAmount.toFixed(2);
  const unit = isTokenCurrency
    ? absoluteAmount === 1
      ? 'jeton'
      : 'jetons'
    : displayCurrency;
  return `${numericAmount < 0 ? '-' : ''}${formatted} ${unit}`;
};

const formatLedgerDescription = (description: string) =>
  description
    .replace(/\bPoints\b/g, 'Jetons')
    .replace(/\bpoints\b/g, 'jetons')
    .replace(/\bpoint\b/g, 'jeton');

const parsePositiveAmount = (value: string) => {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const normalizePhone = (value?: string | null) => {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('243')) return `+${digits}`;
  if (digits.startsWith('0')) return `${DRC_PAYMENT_PHONE_PREFIX}${digits.slice(1)}`;
  if (digits.length === 9) return `${DRC_PAYMENT_PHONE_PREFIX}${digits}`;
  return value?.trim() ?? '';
};

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const resolveRecipientPayload = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  if (isEmail(trimmedValue)) return { recipientEmail: trimmedValue.toLowerCase() };

  const normalizedPhone = normalizePhone(trimmedValue);
  if (DRC_PAYMENT_PHONE_REGEX.test(normalizedPhone)) return { recipientPhone: normalizedPhone };

  if (isUuidLike(trimmedValue)) return { recipientUserId: trimmedValue };
  return null;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Date non disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date non disponible';

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function WalletScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const [activeTab, setActiveTab] = useState<WalletTab>('top_up');
  const [topUpAmount, setTopUpAmount] = useState('50');
  const [topUpMethod, setTopUpMethod] = useState<SubscriptionPaymentMethod>('mobile_money');
  const [topUpPhone, setTopUpPhone] = useState('');
  const [topUpOrderNumber, setTopUpOrderNumber] = useState<string | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferNote, setTransferNote] = useState('');

  const {
    data: walletSummary,
    isLoading: isWalletLoading,
    isFetching: isWalletFetching,
    refetch: refetchWallet,
  } = useGetMyWalletQuery();
  const {
    data: ledger = [],
    isFetching: isLedgerFetching,
    refetch: refetchLedger,
  } = useGetWalletLedgerQuery();
  const [initiateWalletTopUp, { isLoading: isStartingTopUp }] = useInitiateWalletTopUpMutation();
  const [checkWalletTopUpStatus, { isFetching: isCheckingTopUp }] =
    useLazyCheckWalletTopUpStatusQuery();
  const [transferWalletPoints, { isLoading: isTransferring }] = useTransferWalletPointsMutation();

  const currency = walletSummary?.account.currency || 'PTS';
  const entries = useMemo<WalletLedgerEntry[]>(
    () => (ledger.length > 0 ? ledger : walletSummary?.recentEntries ?? []),
    [ledger, walletSummary?.recentEntries],
  );
  const isRefreshing = isWalletFetching || isLedgerFetching;
  const isTopUpPhoneRequired = topUpMethod === 'mobile_money';

  const refreshAll = async () => {
    await Promise.allSettled([refetchWallet(), refetchLedger()]);
  };

  const handleTopUp = async () => {
    Keyboard.dismiss();
    const amount = parsePositiveAmount(topUpAmount);
    if (!amount) {
      showDialog({
        variant: 'warning',
        title: 'Nombre de jetons invalide',
        message: 'Entrez un nombre de jetons superieur a 0.',
      });
      return;
    }

    const formattedPhone = isTopUpPhoneRequired ? normalizePhone(topUpPhone) : undefined;
    if (isTopUpPhoneRequired && !DRC_PAYMENT_PHONE_REGEX.test(formattedPhone ?? '')) {
      setTopUpPhone(DRC_PAYMENT_PHONE_PREFIX);
      showDialog({
        variant: 'warning',
        title: 'Numéro requis',
        message: 'Entrez un numéro Mobile Money congolais, par exemple +243891234567.',
      });
      return;
    }

    try {
      const response = await initiateWalletTopUp({
        amount,
        method: topUpMethod,
        phone: formattedPhone,
      }).unwrap();

      if (formattedPhone) setTopUpPhone(formattedPhone);
      setTopUpOrderNumber(response.payment.orderNumber);
      const openedPaymentPage = await openExternalUrlSafely(response.payment.paymentUrl, {
        logLabel: 'WalletTopUp',
      });
      await refreshAll();

      showDialog({
        variant: 'success',
        title: 'Recharge lancée',
        message:
          response.payment.message ||
          (openedPaymentPage
            ? 'Finalisez le paiement dans la page ouverte.'
            : 'Confirmez la demande de paiement, puis actualisez le statut.'),
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Recharge impossible',
        message: getApiErrorMessage(error, 'Impossible de lancer la recharge pour le moment.'),
      });
    }
  };

  const handleCheckTopUpStatus = async () => {
    if (!topUpOrderNumber) return;

    try {
      const response = await checkWalletTopUpStatus(topUpOrderNumber).unwrap();
      const status = response.payment.status;
      const isSucceeded = status === 'succeeded';
      if (isSucceeded) {
        setTopUpOrderNumber(null);
      }
      await refreshAll();

      showDialog({
        variant: isSucceeded ? 'success' : status === 'failed' || status === 'cancelled' ? 'danger' : 'info',
        title: isSucceeded ? 'Recharge validee' : 'Statut recharge',
        message: response.payment.message || `Statut actuel: ${status}.`,
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Vérification impossible',
        message: getApiErrorMessage(error, 'Impossible de vérifier cette recharge.'),
      });
    }
  };

  const handleTransfer = async () => {
    Keyboard.dismiss();
    const amount = parsePositiveAmount(transferAmount);
    const recipientPayload = resolveRecipientPayload(transferRecipient);

    if (!amount) {
      showDialog({
        variant: 'warning',
        title: 'Nombre de jetons invalide',
        message: 'Entrez le nombre de jetons a partager.',
      });
      return;
    }

    if (!recipientPayload) {
      showDialog({
        variant: 'warning',
        title: 'Destinataire requis',
        message: 'Utilisez le téléphone +243, un email ou un identifiant utilisateur valide.',
      });
      return;
    }

    try {
      const response = await transferWalletPoints({
        amount,
        ...recipientPayload,
        note: transferNote.trim() || undefined,
      }).unwrap();
      const recipientName =
        [response.recipient.firstName, response.recipient.lastName].filter(Boolean).join(' ') ||
        response.recipient.phone ||
        response.recipient.email ||
        'utilisateur';

      setTransferAmount('');
      setTransferRecipient('');
      setTransferNote('');
      await refreshAll();

      showDialog({
        variant: 'success',
        title: 'Jetons partages',
        message: `${formatWalletAmount(response.amount, response.currency)} envoyés à ${recipientName}.`,
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Transfert impossible',
        message: getApiErrorMessage(error, 'Impossible de partager ces jetons pour le moment.'),
      });
    }
  };

  const renderLedgerEntry = (entry: WalletLedgerEntry) => {
    const meta = LEDGER_META[entry.type] ?? {
      label: entry.type,
      icon: 'ellipse-outline' as keyof typeof Ionicons.glyphMap,
      color: Colors.gray[700],
    };
    const amount = Number(entry.amount);
    const amountColor = Number.isFinite(amount) && amount < 0 ? Colors.danger : Colors.successDark;

    return (
      <View key={entry.id} style={styles.ledgerItem}>
        <View style={[styles.ledgerIcon, { backgroundColor: meta.color + '12' }]}>
          <Ionicons name={meta.icon} size={18} color={meta.color} />
        </View>
        <View style={styles.ledgerTextBlock}>
          <Text style={styles.ledgerTitle}>
            {entry.description ? formatLedgerDescription(entry.description) : meta.label}
          </Text>
          <Text style={styles.ledgerSubtitle}>{formatDate(entry.createdAt)}</Text>
        </View>
        <View style={styles.ledgerAmountBlock}>
          <Text style={[styles.ledgerAmount, { color: amountColor }]}>
            {formatWalletAmount(entry.amount, entry.currency)}
          </Text>
          <Text style={styles.ledgerBalance}>
            Solde {formatWalletAmount(entry.balanceAfter, entry.currency)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Jetons Zwanga</Text>
          <Text style={styles.headerSubtitle}>Recharge, fidélité et partage</Text>
        </View>
        <TouchableOpacity onPress={refreshAll} style={styles.headerButton}>
          {isRefreshing ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="refresh-outline" size={20} color={Colors.gray[900]} />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardRoot}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshAll} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.balancePanel}>
            <View style={styles.balanceTopRow}>
              <View style={styles.balanceIcon}>
                <Ionicons name="wallet-outline" size={22} color={Colors.white} />
              </View>
              <Text style={styles.balanceLabel}>Solde disponible</Text>
            </View>
            {isWalletLoading ? (
              <ActivityIndicator color={Colors.primary} style={styles.balanceLoader} />
            ) : (
              <Text style={styles.balanceValue}>
                {formatWalletAmount(walletSummary?.account.balance ?? 0, currency)}
              </Text>
            )}
            <Text style={styles.balanceHint}>
              Les jetons achetés et les jetons de fidélité sont utilisables pour vos trajets et abonnements.
            </Text>
          </View>

          <TouchableOpacity style={styles.referralBanner} onPress={() => router.push('/referrals')}>
            <View style={styles.referralBannerIcon}>
              <Ionicons name="gift-outline" size={21} color={Colors.primary} />
            </View>
            <View style={styles.referralBannerText}>
              <Text style={styles.referralBannerTitle}>Jetons de parrainage</Text>
              <Text style={styles.referralBannerHint}>Consultez vos commissions de 5 % et retirez vos gains.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
          </TouchableOpacity>

          <View style={styles.tabs}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('top_up')}
              style={[styles.tabButton, activeTab === 'top_up' && styles.tabButtonActive]}
            >
              <Ionicons
                name="add-circle-outline"
                size={18}
                color={activeTab === 'top_up' ? Colors.white : Colors.gray[700]}
              />
              <Text style={[styles.tabText, activeTab === 'top_up' && styles.tabTextActive]}>
                Recharger
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('transfer')}
              style={[styles.tabButton, activeTab === 'transfer' && styles.tabButtonActive]}
            >
              <Ionicons
                name="share-outline"
                size={18}
                color={activeTab === 'transfer' ? Colors.white : Colors.gray[700]}
              />
              <Text style={[styles.tabText, activeTab === 'transfer' && styles.tabTextActive]}>
                Partager
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'top_up' ? (
            <View style={styles.formPanel}>
              <Text style={styles.sectionTitle}>Acheter des jetons</Text>
              <View style={styles.methodRow}>
                {TOP_UP_METHOD_OPTIONS.map((option) => {
                  const selected = topUpMethod === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      activeOpacity={0.85}
                      onPress={() => setTopUpMethod(option.id)}
                      style={[styles.methodButton, selected && styles.methodButtonActive]}
                    >
                      <Ionicons
                        name={option.icon}
                        size={18}
                        color={selected ? Colors.primary : Colors.gray[600]}
                      />
                      <View style={styles.methodTextBlock}>
                        <Text style={styles.methodLabel}>{option.label}</Text>
                        <Text numberOfLines={1} style={styles.methodHint}>
                          {option.hint}
                        </Text>
                      </View>
                      <Ionicons
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={selected ? Colors.primary : Colors.gray[300]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                keyboardType="numeric"
                onChangeText={setTopUpAmount}
                placeholder="Nombre de jetons"
                placeholderTextColor={Colors.gray[400]}
                style={styles.input}
                value={topUpAmount}
              />
              <Text style={styles.helperText}>1 jeton = 100 FC. Exemple: 50 jetons = 5 000 FC.</Text>
              {isTopUpPhoneRequired ? (
                <TextInput
                  keyboardType="phone-pad"
                  maxLength={13}
                  onChangeText={(text) => setTopUpPhone(normalizePhone(text))}
                  placeholder="+243891234567"
                  placeholderTextColor={Colors.gray[400]}
                  style={styles.input}
                  value={topUpPhone}
                />
              ) : null}

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={isStartingTopUp}
                onPress={handleTopUp}
                style={[styles.primaryButton, isStartingTopUp && styles.disabled]}
              >
                {isStartingTopUp ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="flash-outline" size={18} color={Colors.white} />
                    <Text style={styles.primaryButtonText}>Recharger</Text>
                  </>
                )}
              </TouchableOpacity>

              {topUpOrderNumber ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={isCheckingTopUp}
                  onPress={handleCheckTopUpStatus}
                  style={[styles.secondaryButton, isCheckingTopUp && styles.disabled]}
                >
                  {isCheckingTopUp ? (
                    <ActivityIndicator color={Colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="sync-outline" size={18} color={Colors.primary} />
                      <Text style={styles.secondaryButtonText}>Vérifier la recharge</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View style={styles.formPanel}>
              <Text style={styles.sectionTitle}>Partager a un utilisateur</Text>
              <TextInput
                keyboardType="numeric"
                onChangeText={setTransferAmount}
                placeholder="Nombre de jetons"
                placeholderTextColor={Colors.gray[400]}
                style={styles.input}
                value={transferAmount}
              />
              <TextInput
                autoCapitalize="none"
                keyboardType="default"
                onChangeText={setTransferRecipient}
                placeholder="Téléphone, email ou ID utilisateur"
                placeholderTextColor={Colors.gray[400]}
                style={styles.input}
                value={transferRecipient}
              />
              <TextInput
                onChangeText={setTransferNote}
                placeholder="Note optionnelle"
                placeholderTextColor={Colors.gray[400]}
                style={styles.input}
                value={transferNote}
              />
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={isTransferring}
                onPress={handleTransfer}
                style={[styles.primaryButton, isTransferring && styles.disabled]}
              >
                {isTransferring ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={18} color={Colors.white} />
                    <Text style={styles.primaryButtonText}>Partager les jetons</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>Historique</Text>
            {isLedgerFetching ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
          </View>

          <View style={styles.ledgerPanel}>
            {entries.length > 0 ? (
              entries.map(renderLedgerEntry)
            ) : (
              <View style={styles.emptyLedger}>
                <Ionicons name="receipt-outline" size={24} color={Colors.gray[400]} />
                <Text style={styles.emptyLedgerText}>Aucun mouvement pour le moment.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  keyboardRoot: {
    flex: 1,
  },
  header: {
    minHeight: 68,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  headerSubtitle: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  content: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  balancePanel: {
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary + '22',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  balanceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  balanceIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  balanceLoader: {
    alignSelf: 'flex-start',
    marginVertical: Spacing.sm,
  },
  balanceValue: {
    color: Colors.gray[900],
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.bold,
  },
  balanceHint: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  referralBanner: {
    minHeight: 76,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '24',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  referralBannerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralBannerText: { flex: 1, minWidth: 0 },
  referralBannerTitle: { color: Colors.gray[900], fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  referralBannerHint: { color: Colors.gray[500], fontSize: FontSizes.xs, lineHeight: 17, marginTop: 3 },
  tabs: {
    minHeight: 48,
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[100],
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: BorderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  tabTextActive: {
    color: Colors.white,
  },
  formPanel: {
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sectionTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  methodRow: {
    gap: Spacing.sm,
  },
  methodButton: {
    minHeight: 58,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  methodButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  methodTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  methodLabel: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  methodHint: {
    marginTop: 2,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  input: {
    minHeight: 50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
    paddingHorizontal: Spacing.md,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
  },
  helperText: {
    marginTop: -Spacing.xs,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  historyHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ledgerPanel: {
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    overflow: 'hidden',
  },
  ledgerItem: {
    minHeight: 72,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ledgerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  ledgerTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  ledgerSubtitle: {
    marginTop: 3,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  ledgerAmountBlock: {
    alignItems: 'flex-end',
    minWidth: 96,
  },
  ledgerAmount: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  ledgerBalance: {
    marginTop: 3,
    color: Colors.gray[500],
    fontSize: 11,
  },
  emptyLedger: {
    minHeight: 116,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  emptyLedgerText: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
});
