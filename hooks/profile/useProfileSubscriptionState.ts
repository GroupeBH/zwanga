import {
  formatCongolesePaymentPhone,
  SubscriptionModalStep,
  SubscriptionPaymentChannel,
  SubscriptionPaymentStage
} from '@/features/profile/profileModel';
import { useEffect, useRef, useState } from 'react';
import type { useProfileData } from './useProfileData';

type Props = Pick<ReturnType<typeof useProfileData>,
  | 'currentUser'
>;

export function useProfileSubscriptionState({
  currentUser,
}: Props) {
  const [subscriptionModalVisible, setSubscriptionModalVisible] = useState(false);

  const [selectedSubscriptionPaymentChannel, setSelectedSubscriptionPaymentChannel] =
    useState<SubscriptionPaymentChannel>('mpesa');

  const [subscriptionModalStep, setSubscriptionModalStep] = useState<SubscriptionModalStep>('method');

  const [subscriptionKeyboardHeight, setSubscriptionKeyboardHeight] = useState(0);

  const [subscriptionPhone, setSubscriptionPhone] = useState('');

  const [subscriptionPaymentOrderNumber, setSubscriptionPaymentOrderNumber] = useState<string | null>(null);

  const [subscriptionPaymentMessage, setSubscriptionPaymentMessage] = useState<string | null>(null);

  const [subscriptionPaymentStage, setSubscriptionPaymentStage] = useState<SubscriptionPaymentStage>('idle');

  const [subscriptionPaymentAutoCheckAttempt, setSubscriptionPaymentAutoCheckAttempt] = useState(0);

  const [isSubscriptionPaymentAutoChecking, setIsSubscriptionPaymentAutoChecking] = useState(false);

  const [isRestoringSubscriptionPayment, setIsRestoringSubscriptionPayment] = useState(false);

  const prefilledSubscriptionPhoneRef = useRef(false);

  const subscriptionPaymentPollingRunIdRef = useRef(0);

  const subscriptionPaymentMountedRef = useRef(true);

  const restoredSubscriptionPaymentKeyRef = useRef<string | null>(null);

  const subscriptionDeferredSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSubscriptionCardPayment = selectedSubscriptionPaymentChannel === 'card';

  useEffect(() => {
    if (prefilledSubscriptionPhoneRef.current || !currentUser?.phone) {
      return;
    }
    setSubscriptionPhone(formatCongolesePaymentPhone(currentUser.phone));
    prefilledSubscriptionPhoneRef.current = true;
  }, [currentUser?.phone]);

  useEffect(() => {
    subscriptionPaymentMountedRef.current = true;
    return () => {
      subscriptionPaymentMountedRef.current = false;
      subscriptionPaymentPollingRunIdRef.current += 1;
      if (subscriptionDeferredSyncTimerRef.current) {
        clearTimeout(subscriptionDeferredSyncTimerRef.current);
        subscriptionDeferredSyncTimerRef.current = null;
      }
    };
  }, []);
  return {
    isRestoringSubscriptionPayment,
    isSubscriptionCardPayment,
    isSubscriptionPaymentAutoChecking,
    restoredSubscriptionPaymentKeyRef,
    selectedSubscriptionPaymentChannel,
    setIsRestoringSubscriptionPayment,
    setIsSubscriptionPaymentAutoChecking,
    setSelectedSubscriptionPaymentChannel,
    setSubscriptionKeyboardHeight,
    setSubscriptionModalStep,
    setSubscriptionModalVisible,
    setSubscriptionPaymentAutoCheckAttempt,
    setSubscriptionPaymentMessage,
    setSubscriptionPaymentOrderNumber,
    setSubscriptionPaymentStage,
    setSubscriptionPhone,
    subscriptionDeferredSyncTimerRef,
    subscriptionKeyboardHeight,
    subscriptionModalStep,
    subscriptionModalVisible,
    subscriptionPaymentAutoCheckAttempt,
    subscriptionPaymentMessage,
    subscriptionPaymentMountedRef,
    subscriptionPaymentOrderNumber,
    subscriptionPaymentPollingRunIdRef,
    subscriptionPaymentStage,
    subscriptionPhone,
  };
}
