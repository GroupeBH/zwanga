import { getPaymentStatusMessage, parseStoredTopUp } from '../../features/wallet/walletModel';
import { TopUpStage, StoredWalletTopUp } from '../../features/wallet/walletTypes';
import type { SubscriptionPaymentMethod } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback } from 'react';
import type { User } from '@/types';

interface Params {
  pollingRunIdRef: React.RefObject<number>;
  mountedRef: React.RefObject<boolean>;
  setIsAutoCheckingTopUp: React.Dispatch<React.SetStateAction<boolean>>;
  storageKey: string | null;
  user: User | null;
  walletSummary: WalletSummary | undefined;
  setTopUpAmount: React.Dispatch<React.SetStateAction<string>>;
  setTopUpMethod: React.Dispatch<React.SetStateAction<SubscriptionPaymentMethod>>;
  setTopUpOrderNumber: React.Dispatch<React.SetStateAction<string | null>>;
  setTopUpPaymentUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setTopUpStage: React.Dispatch<React.SetStateAction<TopUpStage>>;
  setTopUpStatusMessage: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useWalletTopUpStorage({
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
}: Params) {
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

  return {
    stopTopUpAutoCheck,
    clearStoredTopUp,
    persistStoredTopUp,
    readStoredTopUp,
    applyStoredTopUp,
  };
}
import type { WalletSummary } from '@/types';
