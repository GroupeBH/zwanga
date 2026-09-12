import {
  getSubscriptionPendingPaymentKey,
  parseStoredSubscriptionPayment,
  StoredSubscriptionPayment
} from '@/features/profile/profileModel';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useMemo } from 'react';
import type { useProfileData } from './useProfileData';

type Props = Pick<ReturnType<typeof useProfileData>,
  | 'currentUser'
  | 'paymentHistoryLoaded'
  | 'recentPendingSubscriptionOrderNumber'
>;

export function useProfileSubscriptionStorage({
  currentUser,
  paymentHistoryLoaded,
  recentPendingSubscriptionOrderNumber,
}: Props) {
  const subscriptionPaymentStorageKey = useMemo(
    () => getSubscriptionPendingPaymentKey(currentUser?.id),
    [currentUser?.id],
  );

  const clearStoredSubscriptionPayment = useCallback(async () => {
    if (!subscriptionPaymentStorageKey) {
      return;
    }

    try {
      await AsyncStorage.removeItem(subscriptionPaymentStorageKey);
    } catch (error) {
      console.warn('[Profile] Failed to clear pending subscription payment:', error);
    }
  }, [subscriptionPaymentStorageKey]);

  const readStoredSubscriptionPayment = useCallback(async () => {
    if (!subscriptionPaymentStorageKey || !currentUser?.id) {
      return null;
    }

    try {
      const rawValue = await AsyncStorage.getItem(subscriptionPaymentStorageKey);
      const storedPayment = parseStoredSubscriptionPayment(rawValue);
      if (!storedPayment || storedPayment.userId !== currentUser.id) {
        if (rawValue) {
          await AsyncStorage.removeItem(subscriptionPaymentStorageKey);
        }
        return null;
      }

      if (!paymentHistoryLoaded) {
        return null;
      }

      if (!recentPendingSubscriptionOrderNumber || storedPayment.orderNumber !== recentPendingSubscriptionOrderNumber) {
        await AsyncStorage.removeItem(subscriptionPaymentStorageKey);
        return null;
      }

      return storedPayment;
    } catch (error) {
      console.warn('[Profile] Failed to read pending subscription payment:', error);
      return null;
    }
  }, [currentUser?.id, paymentHistoryLoaded, recentPendingSubscriptionOrderNumber, subscriptionPaymentStorageKey]);

  const persistStoredSubscriptionPayment = useCallback(
    async (payment: Omit<StoredSubscriptionPayment, 'createdAt' | 'userId'>) => {
      if (!subscriptionPaymentStorageKey || !currentUser?.id || !payment.orderNumber) {
        return;
      }

      const storedPayment: StoredSubscriptionPayment = {
        ...payment,
        createdAt: new Date().toISOString(),
        userId: currentUser.id,
      };

      try {
        await AsyncStorage.setItem(subscriptionPaymentStorageKey, JSON.stringify(storedPayment));
      } catch (error) {
        console.warn('[Profile] Failed to store pending subscription payment:', error);
      }
    },
    [currentUser?.id, subscriptionPaymentStorageKey],
  );
  return {
    clearStoredSubscriptionPayment,
    persistStoredSubscriptionPayment,
    readStoredSubscriptionPayment,
    subscriptionPaymentStorageKey,
  };
}
