import { styles } from '../features/screen-styles/app/wallet/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors, Spacing } from '@/constants/styles';
import {
  useGetMyWalletQuery,
  useGetWalletLedgerQuery,
  useInitiateWalletTopUpMutation,
  useLazyCheckWalletTopUpStatusQuery,
  useTransferWalletPointsMutation,
} from '@/store/api/walletApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import type {
  SubscriptionPaymentMethod,
  WalletLedgerEntry,
  WalletLedgerEntryType,
  WalletPaymentResponse,
} from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { openExternalUrlSafely } from '@/utils/safeExternalUrl';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type WalletAction = 'top_up' | 'transfer';
type TopUpStage =
  | 'idle'
  | 'preparing'
  | 'phone_confirmation'
  | 'card_redirect'
  | 'checking'
  | 'waiting_long'
  | 'success'
  | 'failed';
type TopUpCheckOutcome = 'success' | 'pending' | 'failed' | 'error';
type StoredWalletTopUp = {
  amount: number;
  createdAt: string;
  message?: string | null;
  orderNumber: string;
  paymentMethod: SubscriptionPaymentMethod;
  paymentUrl?: string | null;
  userId: string;
};

const DRC_PAYMENT_PHONE_PREFIX = '+243';
const DRC_PAYMENT_PHONE_REGEX = /^\+243\d{9}$/;
const WALLET_CARD_PAYMENT_RETURN_PATH = 'wallet';
const WALLET_TOP_UP_STORAGE_PREFIX = 'zwanga:wallet:pending-top-up:';
const RECENT_PENDING_TOP_UP_MAX_AGE_MS = 30 * 60 * 1000;
const AUTO_CHECK_INITIAL_DELAY_MS = 3500;
const AUTO_CHECK_INTERVAL_MS = 8000;
const AUTO_CHECK_TIMEOUT_MS = 90000;
const AUTO_CHECK_MAX_ATTEMPTS = 8;

WebBrowser.maybeCompleteAuthSession();

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

const formatWalletTokenAmount = (amount?: number | string | null) =>
  formatWalletAmount(amount, 'PTS');

const formatLedgerDescription = (description: string) =>
  description
    .replace(/\bPoints\b/g, 'Jetons')
    .replace(/\bpoints\b/g, 'jetons')
    .replace(/\bpoint\b/g, 'jeton');

const getPaymentStatusMessage = (message: string | null | undefined, fallback: string) =>
  getApiErrorMessage({ message }, fallback);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createWalletCardPaymentRedirectUrls = () => {
  const baseUrl = ExpoLinking.createURL(WALLET_CARD_PAYMENT_RETURN_PATH);
  const separator = baseUrl.includes('?') ? '&' : '?';
  const withStatus = (status: 'success' | 'cancel' | 'decline') =>
    `${baseUrl}${separator}status=${status}`;

  return {
    approveUrl: withStatus('success'),
    cancelUrl: withStatus('cancel'),
    declineUrl: withStatus('decline'),
    returnUrl: baseUrl,
  };
};

const getCardPaymentResultFromUrl = (url?: string | null) => {
  if (!url) return null;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('status=success') || lowerUrl.includes('/success')) return 'success';
  if (lowerUrl.includes('status=cancel') || lowerUrl.includes('/cancel')) return 'cancel';
  if (lowerUrl.includes('status=decline') || lowerUrl.includes('/decline')) return 'decline';
  return null;
};

const normalizePaymentMessage = (message?: string | null) =>
  (message ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const isTopUpSucceeded = (response?: WalletPaymentResponse | null) =>
  response?.payment.status === 'succeeded';

const isTopUpFailed = (response?: WalletPaymentResponse | null) => {
  const status = normalizePaymentMessage(response?.payment.status);
  const message = normalizePaymentMessage(response?.payment.message);

  return (
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'canceled' ||
    status === 'declined' ||
    status === 'rejected' ||
    message.includes('annul') ||
    message.includes('cancel') ||
    message.includes('declined') ||
    message.includes('echec') ||
    message.includes('echoue') ||
    message.includes('failed') ||
    message.includes('refuse') ||
    message.includes('rejet') ||
    message.includes('insufficient') ||
    message.includes('solde insuffisant')
  );
};

const getStoredTopUpKey = (userId?: string | null) =>
  userId ? `${WALLET_TOP_UP_STORAGE_PREFIX}${userId}` : null;

const parseStoredTopUp = (value?: string | null): StoredWalletTopUp | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredWalletTopUp>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.orderNumber !== 'string' || !parsed.orderNumber.trim()) return null;
    if (typeof parsed.userId !== 'string' || !parsed.userId.trim()) return null;
    if (parsed.paymentMethod !== 'card' && parsed.paymentMethod !== 'mobile_money') return null;

    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : '';
    const createdAtMs = Date.parse(createdAt);
    if (!Number.isFinite(createdAtMs)) return null;
    if (Date.now() - createdAtMs > RECENT_PENDING_TOP_UP_MAX_AGE_MS) return null;

    const amount = Number(parsed.amount);
    return {
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      createdAt,
      message: typeof parsed.message === 'string' ? parsed.message : null,
      orderNumber: parsed.orderNumber,
      paymentMethod: parsed.paymentMethod,
      paymentUrl: typeof parsed.paymentUrl === 'string' ? parsed.paymentUrl : null,
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
};

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

function WalletSheetModal({
  visible,
  title,
  subtitle,
  icon,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      transparent
      statusBarTranslucent
      animationType="slide"
      presentationStyle="overFullScreen"
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <WalletSheetModalBody
          icon={icon}
          onClose={onClose}
          subtitle={subtitle}
          title={title}
        >
          {children}
        </WalletSheetModalBody>
      </SafeAreaProvider>
    </Modal>
  );
}

function WalletSheetModalBody({
  title,
  subtitle,
  icon,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Spacing.lg) + Spacing.md;

  return (
    <View style={styles.sheetOverlay}>
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
        style={styles.sheetKeyboard}
      >
        <View style={[styles.sheetCard, { paddingBottom: bottomInset }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetBadge}>
              <Ionicons name={icon} size={22} color={Colors.white} />
            </View>
            <View style={styles.sheetHeaderCopy}>
              <Text numberOfLines={1} style={styles.sheetTitle}>
                {title}
              </Text>
              <Text numberOfLines={2} style={styles.sheetSubtitle}>
                {subtitle}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.sheetCloseButton}
              onPress={onClose}
            >
              <Ionicons name="close" size={22} color={Colors.gray[500]} />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetContent}>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function WalletScreen() {
  const router = useRouter();
  const { paymentStatus, status } = useLocalSearchParams<{
    paymentStatus?: string;
    status?: string;
  }>();
  const returnedPaymentStatus = paymentStatus ?? status;
  const user = useAppSelector(selectUser);
  const { showDialog } = useDialog();
  const [activeModal, setActiveModal] = useState<WalletAction | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('50');
  const [topUpMethod, setTopUpMethod] = useState<SubscriptionPaymentMethod>('mobile_money');
  const [topUpPhone, setTopUpPhone] = useState('');
  const [topUpOrderNumber, setTopUpOrderNumber] = useState<string | null>(null);
  const [topUpPaymentUrl, setTopUpPaymentUrl] = useState<string | null>(null);
  const [topUpStage, setTopUpStage] = useState<TopUpStage>('idle');
  const [topUpStatusMessage, setTopUpStatusMessage] = useState<string | null>(null);
  const [topUpAutoCheckAttempt, setTopUpAutoCheckAttempt] = useState(0);
  const [isAutoCheckingTopUp, setIsAutoCheckingTopUp] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const mountedRef = useRef(true);
  const pollingRunIdRef = useRef(0);
  const restoredStorageKeyRef = useRef<string | null>(null);
  const handledReturnStatusRef = useRef<string | null>(null);

  const {
    data: walletSummary,
    isLoading: isWalletLoading,
    isFetching: isWalletFetching,
    refetch: refetchWallet,
  } = useGetMyWalletQuery(undefined, {
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const {
    data: ledger = [],
    isFetching: isLedgerFetching,
    refetch: refetchLedger,
  } = useGetWalletLedgerQuery(undefined, {
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const [initiateWalletTopUp, { isLoading: isStartingTopUp }] = useInitiateWalletTopUpMutation();
  const [checkWalletTopUpStatus, { isFetching: isCheckingTopUp }] =
    useLazyCheckWalletTopUpStatusQuery();
  const [transferWalletPoints, { isLoading: isTransferring }] = useTransferWalletPointsMutation();

  const currency = walletSummary?.account.currency || 'PTS';
  const storageKey = useMemo(
    () => getStoredTopUpKey(user?.id ?? walletSummary?.account.userId),
    [user?.id, walletSummary?.account.userId],
  );
  const entries = useMemo<WalletLedgerEntry[]>(
    () => (ledger.length > 0 ? ledger : walletSummary?.recentEntries ?? []),
    [ledger, walletSummary?.recentEntries],
  );
  const isRefreshing = isWalletFetching || isLedgerFetching;
  const isTopUpPhoneRequired = topUpMethod === 'mobile_money';
  const isTopUpBusy = isStartingTopUp || isCheckingTopUp || isAutoCheckingTopUp;
  const topUpStatusTitle =
    topUpStage === 'success'
      ? 'Recharge confirmée'
      : topUpStage === 'failed'
        ? 'Recharge non confirmée'
        : topUpStage === 'waiting_long'
          ? 'Toujours en traitement'
          : topUpStage === 'card_redirect'
            ? 'Paiement carte'
            : topUpOrderNumber
              ? 'Suivi de la recharge'
              : 'Recharge';
  const topUpStatusColor =
    topUpStage === 'success'
      ? Colors.success
      : topUpStage === 'failed'
        ? Colors.danger
        : topUpStage === 'waiting_long'
          ? Colors.warningDark
          : Colors.primary;

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refetchWallet(), refetchLedger()]);
  }, [refetchLedger, refetchWallet]);

  const stopTopUpAutoCheck = useCallback(() => {
    pollingRunIdRef.current += 1;
    if (mountedRef.current) setIsAutoCheckingTopUp(false);
  }, []);

  const clearStoredTopUp = useCallback(async () => {
    if (!storageKey) return;

    try {
      await AsyncStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('[WalletTopUp] Impossible de supprimer la référence locale:', error);
    }
  }, [storageKey]);

  const persistStoredTopUp = useCallback(
    async (payment: Omit<StoredWalletTopUp, 'createdAt' | 'userId'>) => {
      const userId = user?.id ?? walletSummary?.account.userId;
      if (!storageKey || !userId || !payment.orderNumber) return;

      const storedPayment: StoredWalletTopUp = {
        ...payment,
        createdAt: new Date().toISOString(),
        userId,
      };

      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(storedPayment));
      } catch (error) {
        console.warn('[WalletTopUp] Impossible de garder la référence locale:', error);
      }
    },
    [storageKey, user?.id, walletSummary?.account.userId],
  );

  const readStoredTopUp = useCallback(async () => {
    if (!storageKey) return null;

    try {
      const rawValue = await AsyncStorage.getItem(storageKey);
      const storedPayment = parseStoredTopUp(rawValue);
      const userId = user?.id ?? walletSummary?.account.userId;

      if (!storedPayment || (userId && storedPayment.userId !== userId)) {
        if (rawValue) await AsyncStorage.removeItem(storageKey);
        return null;
      }

      return storedPayment;
    } catch (error) {
      console.warn('[WalletTopUp] Référence locale illisible:', error);
      return null;
    }
  }, [storageKey, user?.id, walletSummary?.account.userId]);

  const applyStoredTopUp = useCallback((storedPayment: StoredWalletTopUp) => {
    setTopUpAmount(storedPayment.amount > 0 ? String(storedPayment.amount) : '50');
    setTopUpMethod(storedPayment.paymentMethod);
    setTopUpOrderNumber(storedPayment.orderNumber);
    setTopUpPaymentUrl(storedPayment.paymentUrl ?? null);
    setTopUpStage(storedPayment.paymentMethod === 'card' ? 'checking' : 'phone_confirmation');
    setTopUpStatusMessage(
      getPaymentStatusMessage(
        storedPayment.message,
        "Référence de recharge retrouvée. Nous vérifions son statut sans relancer de paiement.",
      ),
    );
  }, []);

  const finishSuccessfulTopUp = useCallback(
    async (
      response: WalletPaymentResponse,
      options: { suppressDialog?: boolean } = {},
    ) => {
      stopTopUpAutoCheck();
      await clearStoredTopUp();
      setTopUpOrderNumber(null);
      setTopUpPaymentUrl(null);
      setTopUpStage('success');
      setTopUpAutoCheckAttempt(0);
      setTopUpStatusMessage('Recharge confirmée. Votre solde de jetons est en cours d’actualisation.');
      setActiveModal(null);
      await refreshAll();
      setTimeout(() => {
        if (mountedRef.current) void refreshAll();
      }, 2500);

      if (!options.suppressDialog) {
        showDialog({
          variant: 'success',
          title: 'Recharge validée',
          message: getPaymentStatusMessage(
            response.payment.message,
            'Votre paiement est confirmé. Les jetons ont été crédités sur votre compte.',
          ),
        });
      }

      return true;
    },
    [clearStoredTopUp, refreshAll, showDialog, stopTopUpAutoCheck],
  );

  const handleFailedTopUp = useCallback(
    async (
      response: WalletPaymentResponse,
      options: { suppressDialog?: boolean } = {},
    ) => {
      stopTopUpAutoCheck();
      await clearStoredTopUp();
      setTopUpOrderNumber(null);
      setTopUpPaymentUrl(null);
      setTopUpStage('failed');
      setTopUpAutoCheckAttempt(0);
      const message = getPaymentStatusMessage(
        response.payment.message,
        "La recharge n'a pas été confirmée. Aucun jeton n'a été ajouté.",
      );
      setTopUpStatusMessage(message);
      await refreshAll();

      if (!options.suppressDialog) {
        showDialog({
          variant: 'danger',
          title: 'Recharge non confirmée',
          message,
        });
      }

      return true;
    },
    [clearStoredTopUp, refreshAll, showDialog, stopTopUpAutoCheck],
  );

  const checkTopUpByOrderNumber = useCallback(
    async (
      orderNumber: string,
      options: {
        pendingMessage?: string;
        suppressErrorDialog?: boolean;
        suppressSuccessDialog?: boolean;
      } = {},
    ): Promise<TopUpCheckOutcome> => {
      try {
        setTopUpOrderNumber(orderNumber);
        setTopUpStage('checking');
        const response = await checkWalletTopUpStatus(orderNumber).unwrap();

        if (isTopUpSucceeded(response)) {
          await finishSuccessfulTopUp(response, {
            suppressDialog: options.suppressSuccessDialog,
          });
          return 'success';
        }

        if (isTopUpFailed(response)) {
          await handleFailedTopUp(response, {
            suppressDialog: options.suppressErrorDialog,
          });
          return 'failed';
        }

        await refreshAll();
        setTopUpStage(response.payment.method === 'card' ? 'checking' : 'phone_confirmation');
        setTopUpStatusMessage(
          getPaymentStatusMessage(
            response.payment.message,
            options.pendingMessage ||
              'Paiement en attente chez FlexPay. Nous continuons la vérification.',
          ),
        );
        return 'pending';
      } catch (error) {
        if (options.suppressErrorDialog) {
          setTopUpStage('waiting_long');
          setTopUpStatusMessage(
            'La vérification prend plus de temps que prévu. La référence reste gardée.',
          );
          return 'error';
        }

        showDialog({
          variant: 'danger',
          title: 'Vérification impossible',
          message: getApiErrorMessage(error, 'Impossible de vérifier cette recharge.'),
        });
        return 'error';
      }
    },
    [checkWalletTopUpStatus, finishSuccessfulTopUp, handleFailedTopUp, refreshAll, showDialog],
  );

  const startTopUpAutoCheck = useCallback(
    (
      orderNumber: string,
      paymentMethod: SubscriptionPaymentMethod,
      initialMessage?: string | null,
    ) => {
      if (!orderNumber) return;

      const runId = pollingRunIdRef.current + 1;
      pollingRunIdRef.current = runId;
      setIsAutoCheckingTopUp(true);
      setTopUpAutoCheckAttempt(0);
      setTopUpStage(paymentMethod === 'card' ? 'checking' : 'phone_confirmation');
      setTopUpStatusMessage(
        initialMessage ||
          (paymentMethod === 'card'
            ? 'Paiement carte ouvert. Nous vérifierons le statut au retour.'
            : 'Demande envoyée au téléphone. Confirmez avec votre PIN Mobile Money.'),
      );

      void (async () => {
        const deadline = Date.now() + AUTO_CHECK_TIMEOUT_MS;
        let attempt = 0;
        let nextDelay = AUTO_CHECK_INITIAL_DELAY_MS;

        while (mountedRef.current && pollingRunIdRef.current === runId) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0 || attempt >= AUTO_CHECK_MAX_ATTEMPTS) break;

          await wait(Math.min(nextDelay, remainingMs));
          if (!mountedRef.current || pollingRunIdRef.current !== runId) return;

          attempt += 1;
          setTopUpAutoCheckAttempt(attempt);
          const outcome = await checkTopUpByOrderNumber(orderNumber, {
            pendingMessage:
              attempt === 1
                ? 'Vérification en cours. Si la demande est sur votre téléphone, confirmez avec votre PIN.'
                : 'Toujours en attente côté opérateur. La confirmation peut prendre quelques instants.',
            suppressErrorDialog: true,
          });

          if (!mountedRef.current || pollingRunIdRef.current !== runId) return;
          if (outcome === 'success' || outcome === 'failed') {
            setIsAutoCheckingTopUp(false);
            return;
          }

          nextDelay = AUTO_CHECK_INTERVAL_MS;
        }

        if (mountedRef.current && pollingRunIdRef.current === runId) {
          setIsAutoCheckingTopUp(false);
          setTopUpStage('waiting_long');
          setTopUpStatusMessage(
            'La recharge est encore en traitement. Si votre argent a été débité, appuyez sur Vérifier la recharge au lieu de relancer un paiement.',
          );
        }
      })();
    },
    [checkTopUpByOrderNumber],
  );

  const openTopUpCardPaymentUrl = useCallback(
    async (
      paymentUrl: string,
      orderNumber: string | null,
      returnUrl: string,
    ) => {
      setTopUpStage('card_redirect');
      setTopUpStatusMessage('Page carte FlexPay ouverte. Finalisez le paiement; nous suivrons le retour.');

      const result = await WebBrowser.openAuthSessionAsync(paymentUrl, returnUrl);
      if (result.type !== 'success') {
        if (orderNumber) {
          const pendingMessage = "Retour dans l'app détecté. Vérification du paiement carte en cours.";
          const outcome = await checkTopUpByOrderNumber(orderNumber, {
            pendingMessage,
            suppressErrorDialog: true,
          });
          if (outcome === 'pending' || outcome === 'error') {
            startTopUpAutoCheck(orderNumber, 'card', pendingMessage);
          }
          return;
        }

        setTopUpStage('waiting_long');
        setTopUpStatusMessage('Le paiement carte a été fermé avant le retour FlexPay.');
        return;
      }

      const paymentResult = getCardPaymentResultFromUrl(result.url);
      if ((paymentResult === 'cancel' || paymentResult === 'decline') && !orderNumber) {
        setTopUpStage('failed');
        setTopUpStatusMessage(
          paymentResult === 'cancel'
            ? 'Paiement carte annulé. Aucun jeton n’a été ajouté.'
            : 'Paiement carte refusé. Vérifiez votre carte ou choisissez un autre moyen.',
        );
        return;
      }

      if (!orderNumber) {
        setTopUpStage('waiting_long');
        setTopUpStatusMessage('Retour carte reçu, mais la référence FlexPay est manquante.');
        return;
      }

      const pendingMessage =
        paymentResult === 'success'
          ? 'Paiement carte validé côté FlexPay. Crédit des jetons en cours.'
          : 'Retour carte reçu. Nous vérifions le statut avant toute nouvelle tentative.';
      const outcome = await checkTopUpByOrderNumber(orderNumber, {
        pendingMessage,
        suppressErrorDialog: true,
      });
      if (outcome === 'pending' || outcome === 'error') {
        startTopUpAutoCheck(orderNumber, 'card', pendingMessage);
      }
    },
    [checkTopUpByOrderNumber, startTopUpAutoCheck],
  );

  const handleTopUp = async () => {
    Keyboard.dismiss();

    if (topUpOrderNumber) {
      if (topUpMethod === 'card' && topUpPaymentUrl) {
        const cardRedirectUrls = createWalletCardPaymentRedirectUrls();
        await openTopUpCardPaymentUrl(
          topUpPaymentUrl,
          topUpOrderNumber,
          cardRedirectUrls.returnUrl,
        );
        return;
      }

      const outcome = await checkTopUpByOrderNumber(topUpOrderNumber, {
        pendingMessage: 'Actualisation du statut de recharge en cours.',
        suppressErrorDialog: true,
      });
      if (outcome === 'pending' || outcome === 'error') {
        startTopUpAutoCheck(topUpOrderNumber, topUpMethod, 'Nous continuons le suivi de cette recharge.');
      }
      return;
    }

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
      stopTopUpAutoCheck();
      setTopUpStage('preparing');
      setTopUpStatusMessage('Création de la référence de paiement. Aucun débit n’est relancé si une référence existe déjà.');
      setTopUpAutoCheckAttempt(0);

      const cardRedirectUrls = topUpMethod === 'card' ? createWalletCardPaymentRedirectUrls() : null;
      const response = await initiateWalletTopUp({
        amount,
        method: topUpMethod,
        phone: formattedPhone,
        ...(cardRedirectUrls
          ? {
              approveUrl: cardRedirectUrls.approveUrl,
              cancelUrl: cardRedirectUrls.cancelUrl,
              declineUrl: cardRedirectUrls.declineUrl,
            }
          : {}),
      }).unwrap();

      if (formattedPhone) setTopUpPhone(formattedPhone);
      setTopUpOrderNumber(response.payment.orderNumber);
      setTopUpPaymentUrl(response.payment.paymentUrl);

      if (response.payment.orderNumber) {
        await persistStoredTopUp({
          amount,
          message: response.payment.message,
          orderNumber: response.payment.orderNumber,
          paymentMethod: topUpMethod,
          paymentUrl: response.payment.paymentUrl,
        });
      }

      if (isTopUpSucceeded(response)) {
        await finishSuccessfulTopUp(response);
        return;
      }

      if (isTopUpFailed(response)) {
        await handleFailedTopUp(response);
        return;
      }

      if (response.payment.paymentUrl) {
        if (topUpMethod === 'card' && cardRedirectUrls) {
          await openTopUpCardPaymentUrl(
            response.payment.paymentUrl,
            response.payment.orderNumber,
            cardRedirectUrls.returnUrl,
          );
          return;
        }

        await openExternalUrlSafely(response.payment.paymentUrl, {
          logLabel: 'WalletTopUp',
        });
      }

      const pendingMessage = getPaymentStatusMessage(
        response.payment.message,
        topUpMethod === 'card'
          ? 'Finalisez le paiement carte. Nous vérifierons ensuite la recharge.'
          : 'Confirmez la demande Mobile Money avec votre PIN. Le solde sera actualisé automatiquement.',
      );
      setTopUpStage(topUpMethod === 'card' ? 'checking' : 'phone_confirmation');
      setTopUpStatusMessage(pendingMessage);
      await refreshAll();

      if (response.payment.orderNumber) {
        startTopUpAutoCheck(response.payment.orderNumber, topUpMethod, pendingMessage);
      }
    } catch (error) {
      setTopUpStage('failed');
      showDialog({
        variant: 'danger',
        title: 'Recharge impossible',
        message: getApiErrorMessage(error, 'Impossible de lancer la recharge pour le moment.'),
      });
    }
  };

  const handleCheckTopUpStatus = async () => {
    if (!topUpOrderNumber) return;

    stopTopUpAutoCheck();
    const outcome = await checkTopUpByOrderNumber(topUpOrderNumber, {
      pendingMessage: 'Actualisation du statut de recharge en cours.',
    });
    if (outcome === 'pending' || outcome === 'error') {
      startTopUpAutoCheck(topUpOrderNumber, topUpMethod, 'Nous continuons le suivi de cette recharge.');
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
      setActiveModal(null);
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

  useEffect(() => () => {
    mountedRef.current = false;
    pollingRunIdRef.current += 1;
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    if (restoredStorageKeyRef.current === storageKey) return;
    restoredStorageKeyRef.current = storageKey;

    let cancelled = false;
    void (async () => {
      const storedPayment = await readStoredTopUp();
      if (cancelled || !storedPayment?.orderNumber) return;

      applyStoredTopUp(storedPayment);
      const outcome = await checkTopUpByOrderNumber(storedPayment.orderNumber, {
        pendingMessage: "Référence de recharge retrouvée. Nous vérifions son statut.",
        suppressErrorDialog: true,
      });

      if (!cancelled && (outcome === 'pending' || outcome === 'error')) {
        startTopUpAutoCheck(
          storedPayment.orderNumber,
          storedPayment.paymentMethod,
          "Référence de recharge retrouvée. Nous continuons le suivi.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyStoredTopUp,
    checkTopUpByOrderNumber,
    readStoredTopUp,
    startTopUpAutoCheck,
    storageKey,
  ]);

  useEffect(() => {
    if (!returnedPaymentStatus) return;

    const returnStatusKey = `${String(returnedPaymentStatus)}:${topUpOrderNumber ?? 'stored'}`;
    if (handledReturnStatusRef.current === returnStatusKey) return;
    handledReturnStatusRef.current = returnStatusKey;

    const normalizedStatus = String(returnedPaymentStatus).toLowerCase();
    void (async () => {
      const storedPayment = await readStoredTopUp();
      const orderNumber = topUpOrderNumber ?? storedPayment?.orderNumber;
      const paymentMethod = storedPayment?.paymentMethod ?? topUpMethod;
      setActiveModal('top_up');

      if (!orderNumber) {
        if (normalizedStatus === 'cancel' || normalizedStatus === 'decline') {
          setTopUpStage('failed');
          setTopUpStatusMessage(
            normalizedStatus === 'cancel'
              ? 'Paiement carte annulé. Aucun jeton n’a été ajouté.'
              : 'Paiement carte refusé. Vérifiez votre carte ou choisissez un autre moyen.',
          );
        } else {
          setTopUpStage('waiting_long');
          setTopUpStatusMessage('Retour carte reçu. Actualisez le statut avant de relancer un paiement.');
        }
        return;
      }

      const pendingMessage =
        normalizedStatus === 'success'
          ? 'Retour carte reçu. Crédit des jetons en cours de vérification.'
          : 'Retour carte reçu. Nous vérifions le statut avant toute nouvelle tentative.';
      const outcome = await checkTopUpByOrderNumber(orderNumber, {
        pendingMessage,
        suppressErrorDialog: true,
      });

      if (outcome === 'pending' || outcome === 'error') {
        startTopUpAutoCheck(orderNumber, paymentMethod, pendingMessage);
      }
    })();
  }, [
    checkTopUpByOrderNumber,
    readStoredTopUp,
    returnedPaymentStatus,
    startTopUpAutoCheck,
    topUpMethod,
    topUpOrderNumber,
  ]);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (
        nextState !== 'active' ||
        !topUpOrderNumber ||
        topUpStage === 'success' ||
        topUpStage === 'failed'
      ) {
        return;
      }

      void checkTopUpByOrderNumber(topUpOrderNumber, {
        pendingMessage: "Retour dans l'app détecté. Nous actualisons la recharge.",
        suppressErrorDialog: true,
      }).then((outcome) => {
        if (
          mountedRef.current &&
          (outcome === 'pending' || outcome === 'error') &&
          !isAutoCheckingTopUp
        ) {
          startTopUpAutoCheck(
            topUpOrderNumber,
            topUpMethod,
            "Retour dans l'app détecté. Nous reprenons le suivi.",
          );
        }
      });
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [
    checkTopUpByOrderNumber,
    isAutoCheckingTopUp,
    startTopUpAutoCheck,
    topUpMethod,
    topUpOrderNumber,
    topUpStage,
  ]);

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
            {formatWalletTokenAmount(entry.amount)}
          </Text>
          <Text style={styles.ledgerBalance}>
            Solde {formatWalletTokenAmount(entry.balanceAfter)}
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

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshAll} />}
        showsVerticalScrollIndicator={false}
        style={styles.scrollRoot}
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

        <View style={styles.actionRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Recharger des jetons"
            activeOpacity={0.85}
            onPress={() => setActiveModal('top_up')}
            style={styles.actionCard}
          >
            <View style={styles.actionCardIcon}>
              <Ionicons name="add-circle-outline" size={22} color={Colors.white} />
            </View>
            <Text style={styles.actionCardTitle}>Recharger</Text>
            <Text style={styles.actionCardHint}>Acheter des jetons</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Partager des jetons"
            activeOpacity={0.85}
            onPress={() => setActiveModal('transfer')}
            style={styles.actionCard}
          >
            <View style={[styles.actionCardIcon, styles.actionCardIconSecondary]}>
              <Ionicons name="share-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.actionCardTitle}>Partager</Text>
            <Text style={styles.actionCardHint}>Envoyer à un utilisateur</Text>
          </TouchableOpacity>
        </View>

        {topUpStatusMessage || topUpOrderNumber ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setActiveModal('top_up')}
            style={[styles.followUpBanner, { borderColor: topUpStatusColor + '35' }]}
          >
            <View style={[styles.followUpIcon, { backgroundColor: topUpStatusColor + '12' }]}>
              {isAutoCheckingTopUp || isCheckingTopUp ? (
                <ActivityIndicator size="small" color={topUpStatusColor} />
              ) : (
                <Ionicons
                  name={
                    topUpStage === 'success'
                      ? 'checkmark-circle-outline'
                      : topUpStage === 'failed'
                        ? 'close-circle-outline'
                        : 'sync-outline'
                  }
                  size={18}
                  color={topUpStatusColor}
                />
              )}
            </View>
            <View style={styles.followUpCopy}>
              <Text style={[styles.followUpTitle, { color: topUpStatusColor }]}>{topUpStatusTitle}</Text>
              <Text numberOfLines={2} style={styles.followUpText}>
                {topUpStatusMessage || 'Touchez pour suivre la recharge.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
          </TouchableOpacity>
        ) : null}

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

      <WalletSheetModal
        icon="flash-outline"
        onClose={() => setActiveModal(null)}
        subtitle="Mobile Money ou carte. 1 jeton = 100 FC."
        title="Acheter des jetons"
        visible={activeModal === 'top_up'}
      >
        <View style={styles.methodRow}>
          {TOP_UP_METHOD_OPTIONS.map((option) => {
            const selected = topUpMethod === option.id;
            const disabled = Boolean(topUpOrderNumber) || isTopUpBusy;
            return (
              <TouchableOpacity
                key={option.id}
                activeOpacity={0.85}
                disabled={disabled}
                onPress={() => setTopUpMethod(option.id)}
                style={[
                  styles.methodButton,
                  selected && styles.methodButtonActive,
                  disabled && styles.disabled,
                ]}
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
          disabled={isTopUpBusy}
          onPress={handleTopUp}
          style={[styles.primaryButton, isTopUpBusy && styles.disabled]}
        >
          {isTopUpBusy ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="flash-outline" size={18} color={Colors.white} />
              <Text style={styles.primaryButtonText}>
                {topUpOrderNumber
                  ? topUpMethod === 'card' && topUpPaymentUrl
                    ? 'Rouvrir le paiement'
                    : 'Actualiser la recharge'
                  : 'Recharger'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {topUpStatusMessage || topUpOrderNumber ? (
          <View style={[styles.topUpStatusCard, { borderColor: topUpStatusColor + '35' }]}>
            <View style={styles.topUpStatusHeader}>
              {isAutoCheckingTopUp || isCheckingTopUp ? (
                <ActivityIndicator size="small" color={topUpStatusColor} />
              ) : (
                <Ionicons
                  name={
                    topUpStage === 'success'
                      ? 'checkmark-circle-outline'
                      : topUpStage === 'failed'
                        ? 'close-circle-outline'
                        : 'sync-outline'
                  }
                  size={18}
                  color={topUpStatusColor}
                />
              )}
              <Text style={[styles.topUpStatusTitle, { color: topUpStatusColor }]}>
                {topUpStatusTitle}
              </Text>
            </View>
            {topUpStatusMessage ? (
              <Text style={styles.topUpStatusText}>{topUpStatusMessage}</Text>
            ) : null}
            {topUpAutoCheckAttempt > 0 ? (
              <Text style={styles.topUpReferenceText}>
                Vérification automatique {topUpAutoCheckAttempt}/{AUTO_CHECK_MAX_ATTEMPTS}
              </Text>
            ) : null}
            {topUpOrderNumber ? (
              <Text style={styles.topUpReferenceText}>Référence FlexPay {topUpOrderNumber}</Text>
            ) : null}
          </View>
        ) : null}

        {topUpOrderNumber ? (
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isTopUpBusy}
            onPress={handleCheckTopUpStatus}
            style={[styles.secondaryButton, isTopUpBusy && styles.disabled]}
          >
            {isCheckingTopUp || isAutoCheckingTopUp ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <>
                <Ionicons name="sync-outline" size={18} color={Colors.primary} />
                <Text style={styles.secondaryButtonText}>Vérifier la recharge</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </WalletSheetModal>

      <WalletSheetModal
        icon="share-outline"
        onClose={() => setActiveModal(null)}
        subtitle="Téléphone +243, email ou identifiant utilisateur."
        title="Partager des jetons"
        visible={activeModal === 'transfer'}
      >
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
      </WalletSheetModal>
    </SafeAreaView>
  );
}


