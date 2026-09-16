import type { BookingPaymentResponse } from '@/types';
import {
  normalizePaymentPhone,
  isPaymentChannel,
  getPaymentFailureMessage,
  getPaymentStatusMessage,
  getStorageKey,
} from '../../features/arrival-payment/paymentModel';
import {
  PaymentChannel,
  StoredBookingPaymentState,
  StoredPaymentState,
  PaymentCompletionSummary,
} from '../../features/arrival-payment/paymentTypes';
import { ARRIVAL_PAYMENT_STATUS_REFRESH_MS } from '../../features/arrival-payment/paymentPolicy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect } from 'react';
import { useLazyCheckBookingPaymentStatusQuery } from '@/store/api/bookingApi';
import { useGetMyWalletQuery, useLazyCheckWalletTopUpStatusQuery } from '@/store/api/walletApi';
import type { TripPaymentMode } from '@/types';
import type { Booking, User } from '@/types';

interface Params {
  setIsStoredStateLoaded: React.Dispatch<React.SetStateAction<boolean>>;
  isAuthenticated: boolean;
  user: User | null;
  setStoredState: React.Dispatch<React.SetStateAction<StoredPaymentState>>;
  arrivalBooking: Booking | null;
  activeBookingIdRef: React.RefObject<string | null>;
  storedState: StoredPaymentState;
  setSelectedMode: React.Dispatch<React.SetStateAction<TripPaymentMode>>;
  setSelectedChannel: React.Dispatch<React.SetStateAction<PaymentChannel>>;
  setPaymentPhone: React.Dispatch<React.SetStateAction<string>>;
  setCompletionSummary: React.Dispatch<React.SetStateAction<PaymentCompletionSummary | null>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  setPaymentError: React.Dispatch<React.SetStateAction<string>>;
  persistBookingState: (bookingId: string, patch: Partial<Record<keyof StoredBookingPaymentState, string | null>>) => void;
  activeStoredState: StoredBookingPaymentState | undefined;
  isAppActive: boolean;
  paymentCheckInFlightRef: React.RefObject<boolean>;
  setIsCheckingPayment: React.Dispatch<React.SetStateAction<boolean>>;
  checkWalletTopUpStatus: ReturnType<typeof useLazyCheckWalletTopUpStatusQuery>[0];
  refetchWallet: ReturnType<typeof useGetMyWalletQuery>['refetch'];
  settleWithPoints: (bookingId: string) => Promise<boolean>;
  checkBookingPaymentStatus: ReturnType<typeof useLazyCheckBookingPaymentStatusQuery>[0];
  handleCompletedBookingPayment: (response: BookingPaymentResponse, options?: { mode?: TripPaymentMode | null; channel?: PaymentChannel; }) => Promise<boolean>;
}

export function useArrivalPaymentMonitoring({
  setIsStoredStateLoaded,
  isAuthenticated,
  user,
  setStoredState,
  arrivalBooking,
  activeBookingIdRef,
  storedState,
  setSelectedMode,
  setSelectedChannel,
  setPaymentPhone,
  setCompletionSummary,
  setStatusMessage,
  setPaymentError,
  persistBookingState,
  activeStoredState,
  isAppActive,
  paymentCheckInFlightRef,
  setIsCheckingPayment,
  checkWalletTopUpStatus,
  refetchWallet,
  settleWithPoints,
  checkBookingPaymentStatus,
  handleCompletedBookingPayment,
}: Params) {
  useEffect(() => {
    let cancelled = false;
    setIsStoredStateLoaded(false);

    if (!isAuthenticated || !user?.id) {
      setStoredState({});
      setIsStoredStateLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    void AsyncStorage.getItem(getStorageKey(user.id))
      .then((rawValue) => {
        if (cancelled) return;
        if (!rawValue) {
          setStoredState({});
          return;
        }
        const parsed = JSON.parse(rawValue) as StoredPaymentState;
        setStoredState(parsed && typeof parsed === 'object' ? parsed : {});
      })
      .catch((error) => {
        console.warn('[PassengerArrivalPayment] État local illisible:', error);
        if (!cancelled) setStoredState({});
      })
      .finally(() => {
        if (!cancelled) setIsStoredStateLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    const bookingId = arrivalBooking?.id ?? null;
    if (activeBookingIdRef.current === bookingId) return;

    activeBookingIdRef.current = bookingId;
    const storedChannel = bookingId ? storedState[bookingId]?.bookingPaymentChannel : null;
    setSelectedMode(arrivalBooking?.paymentMode ?? 'cash');
    setSelectedChannel(isPaymentChannel(storedChannel) ? storedChannel : 'mpesa');
    setPaymentPhone(normalizePaymentPhone(user?.phone));
    setCompletionSummary((current) =>
      current && bookingId && current.bookingId !== bookingId ? null : current,
    );
    setStatusMessage('');
    setPaymentError('');
  }, [arrivalBooking?.id, arrivalBooking?.paymentMode, storedState, user?.phone]);

  useEffect(() => {
    if (!arrivalBooking || storedState[arrivalBooking.id]?.requiredActionAt) return;
    persistBookingState(arrivalBooking.id, { requiredActionAt: new Date().toISOString() });
  }, [arrivalBooking, persistBookingState, storedState]);

  useEffect(() => {
    const bookingId = arrivalBooking?.id;
    const walletTopUpOrderNumber = activeStoredState?.walletTopUpOrderNumber;
    const bookingPaymentOrderNumber = activeStoredState?.bookingPaymentOrderNumber;
    if (!isAppActive || !bookingId || (!walletTopUpOrderNumber && !bookingPaymentOrderNumber)) return;

    let cancelled = false;

    const checkPayment = async () => {
      if (paymentCheckInFlightRef.current || cancelled) return;
      paymentCheckInFlightRef.current = true;
      setIsCheckingPayment(true);

      try {
        if (walletTopUpOrderNumber) {
          const response = await checkWalletTopUpStatus(walletTopUpOrderNumber).unwrap();
          if (cancelled) return;

          if (response.payment.status === 'succeeded') {
            persistBookingState(bookingId, { walletTopUpOrderNumber: null });
            setStatusMessage('Recharge confirmée. Paiement de la course en cours...');
            await refetchWallet();
            await settleWithPoints(bookingId);
            return;
          }

          if (response.payment.status === 'failed' || response.payment.status === 'cancelled') {
            persistBookingState(bookingId, { walletTopUpOrderNumber: null });
            setPaymentError(getPaymentFailureMessage(response.payment.message));
            return;
          }

          setStatusMessage(
            getPaymentStatusMessage(
              response.payment.message,
              'Confirmez le complément Mobile Money sur votre téléphone.',
            ),
          );
          return;
        }

        if (bookingPaymentOrderNumber) {
          const response = await checkBookingPaymentStatus(bookingPaymentOrderNumber).unwrap();
          if (cancelled) return;

          const finished = await handleCompletedBookingPayment(response, {
            mode: 'electronic',
            channel: activeStoredState?.bookingPaymentChannel,
          });
          if (finished) {
            return;
          }

          if (response.payment.status === 'failed' || response.payment.status === 'cancelled') {
            persistBookingState(bookingId, { bookingPaymentOrderNumber: null });
            setPaymentError(getPaymentFailureMessage(response.payment.message));
            return;
          }

          setStatusMessage(
            getPaymentStatusMessage(
              response.payment.message,
              'Confirmez le paiement Mobile Money sur votre téléphone.',
            ),
          );
        }
      } catch (error) {
        console.warn('[PassengerArrivalPayment] Vérification du paiement impossible:', error);
      } finally {
        paymentCheckInFlightRef.current = false;
        if (!cancelled) setIsCheckingPayment(false);
      }
    };

    void checkPayment();
    const interval = setInterval(() => void checkPayment(), ARRIVAL_PAYMENT_STATUS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    isAppActive,
    activeStoredState?.bookingPaymentChannel,
    activeStoredState?.bookingPaymentOrderNumber,
    activeStoredState?.walletTopUpOrderNumber,
    arrivalBooking?.id,
    checkBookingPaymentStatus,
    checkWalletTopUpStatus,
    handleCompletedBookingPayment,
    persistBookingState,
    refetchWallet,
    settleWithPoints,
  ]);

  return {

  };
}
