import { getPaymentStatusMessage, parseStoredPayment } from '../../features/subscription-payment/paymentModel';
import { PaymentChannel, PaymentStage, StoredPayment } from '../../features/subscription-payment/paymentTypes';
import type { SubscriptionPaymentMethod } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect } from 'react';
import type { User } from '@/types';

interface Params {
  pollingRunIdRef: React.RefObject<number>;
  mountedRef: React.RefObject<boolean>;
  setIsAutoChecking: React.Dispatch<React.SetStateAction<boolean>>;
  storageKey: string | null;
  isPremiumActive: boolean;
  setOrderNumber: React.Dispatch<React.SetStateAction<string | null>>;
  setPaymentUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setStage: React.Dispatch<React.SetStateAction<PaymentStage>>;
  setMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setAutoCheckAttempt: React.Dispatch<React.SetStateAction<number>>;
  currentUser: User | null;
  setSelectedChannel: React.Dispatch<React.SetStateAction<PaymentChannel>>;
  setPaymentMethod: React.Dispatch<React.SetStateAction<SubscriptionPaymentMethod>>;
}

export function useSubscriptionPaymentStorage({
  pollingRunIdRef,
  mountedRef,
  setIsAutoChecking,
  storageKey,
  isPremiumActive,
  setOrderNumber,
  setPaymentUrl,
  setStage,
  setMessage,
  setAutoCheckAttempt,
  currentUser,
  setSelectedChannel,
  setPaymentMethod,
}: Params) {
  const stopAutoCheck = useCallback(() => {
    pollingRunIdRef.current += 1;
    if (mountedRef.current) setIsAutoChecking(false);
  }, []);

  const clearStoredPayment = useCallback(async () => {
    if (!storageKey) return;
    try {
      await AsyncStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('[SubscriptionPayment] clear stored payment failed:', error);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!isPremiumActive) return;

    stopAutoCheck();
    setOrderNumber(null);
    setPaymentUrl(null);
    setStage('success');
    setMessage('Votre abonnement est déjà actif.');
    setAutoCheckAttempt(0);
    void clearStoredPayment();
  }, [clearStoredPayment, isPremiumActive, stopAutoCheck]);

  const readStoredPayment = useCallback(async () => {
    if (!storageKey || !currentUser?.id) return null;
    try {
      const rawValue = await AsyncStorage.getItem(storageKey);
      const storedPayment = parseStoredPayment(rawValue);
      if (!storedPayment || storedPayment.userId !== currentUser.id) {
        if (rawValue) await AsyncStorage.removeItem(storageKey);
        return null;
      }
      return storedPayment;
    } catch (error) {
      console.warn('[SubscriptionPayment] read stored payment failed:', error);
      return null;
    }
  }, [currentUser?.id, storageKey]);

  const persistStoredPayment = useCallback(
    async (payment: Omit<StoredPayment, 'createdAt' | 'userId'>) => {
      if (!storageKey || !currentUser?.id || !payment.orderNumber) return;

      const storedPayment: StoredPayment = {
        ...payment,
        createdAt: new Date().toISOString(),
        userId: currentUser.id,
      };

      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(storedPayment));
      } catch (error) {
        console.warn('[SubscriptionPayment] persist stored payment failed:', error);
      }
    },
    [currentUser?.id, storageKey],
  );

  const applyStoredPayment = useCallback((storedPayment: StoredPayment) => {
    setSelectedChannel(storedPayment.channel);
    setOrderNumber(storedPayment.orderNumber);
    setPaymentUrl(storedPayment.paymentUrl ?? null);
    setPaymentMethod(storedPayment.paymentMethod);
    setStage(storedPayment.paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation');
    setMessage(
      getPaymentStatusMessage(
        storedPayment.message,
        "Référence retrouvée. Aucune nouvelle demande n'est envoyée.",
      ),
    );
  }, []);

  return {
    stopAutoCheck,
    clearStoredPayment,
    readStoredPayment,
    applyStoredPayment,
    persistStoredPayment,
  };
}
