import {
  getMostRecentPendingSubscriptionPayment,
  buildStoredPaymentFromHistory,
} from '../../features/subscription-payment/paymentModel';
import { PaymentChannel, StoredPayment } from '../../features/subscription-payment/paymentTypes';
import { useGetPaymentHistoryQuery } from '@/store/api/paymentApi';
import { useGetPremiumOverviewQuery } from '@/store/api/subscriptionApi';
import { useGetProfileSummaryQuery } from '@/store/api/userApi';
import { useGetMyWalletQuery } from '@/store/api/walletApi';
import type { PaymentHistoryItem } from '@/types';
import React, { useCallback } from 'react';
import type { User } from '@/types';

interface Params {
  currentUser: User | null;
  readStoredPayment: () => Promise<StoredPayment | null>;
  applyStoredPayment: (storedPayment: StoredPayment) => void;
  paymentHistory: PaymentHistoryItem[] | undefined;
  selectedChannel: PaymentChannel;
  persistStoredPayment: (payment: Omit<StoredPayment, "createdAt" | "userId">) => Promise<void>;
  setRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  refetchProfile: ReturnType<typeof useGetProfileSummaryQuery>['refetch'];
  isDriver: boolean;
  refetchPremiumOverview: ReturnType<typeof useGetPremiumOverviewQuery>['refetch'];
  refetchPaymentHistory: ReturnType<typeof useGetPaymentHistoryQuery>['refetch'];
  refetchWallet: ReturnType<typeof useGetMyWalletQuery>['refetch'];
}

export function useSubscriptionPaymentRestore({
  currentUser,
  readStoredPayment,
  applyStoredPayment,
  paymentHistory,
  selectedChannel,
  persistStoredPayment,
  setRefreshing,
  refetchProfile,
  isDriver,
  refetchPremiumOverview,
  refetchPaymentHistory,
  refetchWallet,
}: Params) {
  const restorePayment = useCallback(async () => {
    if (!currentUser?.id) return null;

    const storedPayment = await readStoredPayment();
    if (storedPayment) {
      applyStoredPayment(storedPayment);
      return storedPayment;
    }

    const latestPendingPayment = getMostRecentPendingSubscriptionPayment(paymentHistory);
    const restoredFromHistory = latestPendingPayment
      ? buildStoredPaymentFromHistory(latestPendingPayment, currentUser.id, selectedChannel)
      : null;
    if (restoredFromHistory) {
      applyStoredPayment(restoredFromHistory);
      await persistStoredPayment({
        channel: restoredFromHistory.channel,
        message: restoredFromHistory.message,
        orderNumber: restoredFromHistory.orderNumber,
        paymentMethod: restoredFromHistory.paymentMethod,
        paymentUrl: restoredFromHistory.paymentUrl,
      });
      return restoredFromHistory;
    }

    return null;
  }, [
    applyStoredPayment,
    currentUser?.id,
    paymentHistory,
    persistStoredPayment,
    readStoredPayment,
    selectedChannel,
  ]);

  const refreshEverything = useCallback(async () => {
    setRefreshing(true);
    try {
      const refreshTasks: PromiseLike<unknown>[] = [refetchProfile()];
      if (isDriver) {
        refreshTasks.push(refetchPremiumOverview(), refetchPaymentHistory(), refetchWallet());
      }
      await Promise.allSettled(refreshTasks);
    } finally {
      setRefreshing(false);
    }
  }, [isDriver, refetchPaymentHistory, refetchPremiumOverview, refetchProfile, refetchWallet]);

  return {
    restorePayment,
    refreshEverything,
  };
}
