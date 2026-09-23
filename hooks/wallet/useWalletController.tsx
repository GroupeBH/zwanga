import { useWalletTopUpRecovery } from './useWalletTopUpRecovery';
import { useWalletTopUpActions } from './useWalletTopUpActions';
import { useWalletTopUpMonitoring } from './useWalletTopUpMonitoring';
import { useWalletTopUpStorage } from './useWalletTopUpStorage';
import { useWalletScreenScope } from './useWalletScreenScope';
import { useIsFocused } from '@react-navigation/native';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useWalletTransfer } from './useWalletTransfer';
import {
  LEDGER_META,
  formatWalletTokenAmount,
  formatLedgerDescription,
  getStoredTopUpKey,
  formatDate,
} from '../../features/wallet/walletModel';
import { WalletAction, TopUpStage } from '../../features/wallet/walletTypes';
import { styles } from '../../features/screen-styles/app/wallet/index';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import {
  useGetMyWalletQuery,
  useGetWalletLedgerQuery,
  useInitiateWalletTopUpMutation,
  useLazyCheckWalletTopUpStatusQuery,
  useTransferWalletPointsMutation,
} from '@/store/api/walletApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import type { SubscriptionPaymentMethod, WalletLedgerEntry } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';



export function useWalletController() {
  const router = useRouter();
  const { paymentStatus, status } = useLocalSearchParams<{
    paymentStatus?: string;
    status?: string;
  }>();
  const returnedPaymentStatus = paymentStatus ?? status;
  const user = useAppSelector(selectUser);
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const isScreenActive = isFocused && isAppActive;
  const captureScope = useWalletScreenScope(user?.id, isScreenActive);
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
    skip: !user?.id || !isScreenActive,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const {
    data: ledger = [],
    isFetching: isLedgerFetching,
    refetch: refetchLedger,
  } = useGetWalletLedgerQuery(undefined, {
    skip: !user?.id || !isScreenActive,
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

  const { stopTopUpAutoCheck, clearStoredTopUp, persistStoredTopUp, readStoredTopUp, applyStoredTopUp } = useWalletTopUpStorage({
    pollingRunIdRef,
    mountedRef,
    setIsAutoCheckingTopUp,
    storageKey,
    user,
    walletSummary,
    setTopUpAmount,
    setTopUpMethod,
    setTopUpOrderNumber,
    setTopUpPaymentUrl,
    setTopUpStage,
    setTopUpStatusMessage,
  });

  const { checkTopUpByOrderNumber, startTopUpAutoCheck, finishSuccessfulTopUp, handleFailedTopUp } = useWalletTopUpMonitoring({
    captureScope,
    stopTopUpAutoCheck,
    clearStoredTopUp,
    setTopUpOrderNumber,
    setTopUpPaymentUrl,
    setTopUpStage,
    setTopUpAutoCheckAttempt,
    setTopUpStatusMessage,
    setActiveModal,
    refreshAll,
    mountedRef,
    showDialog,
    checkWalletTopUpStatus,
    pollingRunIdRef,
    setIsAutoCheckingTopUp,
  });

  const { handleTopUp, handleCheckTopUpStatus } = useWalletTopUpActions({
    captureScope,
    setTopUpStage,
    setTopUpStatusMessage,
    checkTopUpByOrderNumber,
    startTopUpAutoCheck,
    topUpOrderNumber,
    topUpMethod,
    topUpPaymentUrl,
    topUpAmount,
    showDialog,
    isTopUpPhoneRequired,
    topUpPhone,
    setTopUpPhone,
    stopTopUpAutoCheck,
    setTopUpAutoCheckAttempt,
    initiateWalletTopUp,
    setTopUpOrderNumber,
    setTopUpPaymentUrl,
    persistStoredTopUp,
    finishSuccessfulTopUp,
    handleFailedTopUp,
    refreshAll,
  });

  const { handleTransfer } = useWalletTransfer({
    transferAmount,
    transferRecipient,
    showDialog,
    transferWalletPoints,
    transferNote,
    setTransferAmount,
    setTransferRecipient,
    setTransferNote,
    setActiveModal,
    refreshAll,
  });

  useWalletTopUpRecovery({
    isScreenActive,
    captureScope,
    mountedRef,
    pollingRunIdRef,
    storageKey,
    restoredStorageKeyRef,
    readStoredTopUp,
    applyStoredTopUp,
    checkTopUpByOrderNumber,
    startTopUpAutoCheck,
    returnedPaymentStatus,
    topUpOrderNumber,
    handledReturnStatusRef,
    topUpMethod,
    setActiveModal,
    setTopUpStage,
    setTopUpStatusMessage,
  });

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

  return {
    router,
    refreshAll,
    isRefreshing,
    isWalletLoading,
    walletSummary,
    currency,
    setActiveModal,
    topUpStatusMessage,
    topUpOrderNumber,
    topUpStatusColor,
    isAutoCheckingTopUp,
    isCheckingTopUp,
    topUpStage,
    topUpStatusTitle,
    isLedgerFetching,
    entries,
    renderLedgerEntry,
    activeModal,
    topUpMethod,
    isTopUpBusy,
    setTopUpMethod,
    setTopUpAmount,
    topUpAmount,
    isTopUpPhoneRequired,
    setTopUpPhone,
    topUpPhone,
    handleTopUp,
    topUpPaymentUrl,
    topUpAutoCheckAttempt,
    handleCheckTopUpStatus,
    setTransferAmount,
    transferAmount,
    setTransferRecipient,
    transferRecipient,
    setTransferNote,
    transferNote,
    isTransferring,
    handleTransfer,
  };
}
