import { useSubscriptionPaymentState } from './useSubscriptionPaymentState';
import { useSubscriptionPaymentLifecycle } from './useSubscriptionPaymentLifecycle';
import { useSubscriptionPaymentActions } from './useSubscriptionPaymentActions';
import { useSubscriptionPaymentRestore } from './useSubscriptionPaymentRestore';
import { useSubscriptionPaymentBrowser } from './useSubscriptionPaymentBrowser';
import { useSubscriptionPaymentMonitoring } from './useSubscriptionPaymentMonitoring';
import { useSubscriptionPaymentStorage } from './useSubscriptionPaymentStorage';
import { useSubscriptionPaymentPresentation } from './useSubscriptionPaymentPresentation';



export function useSubscriptionPaymentController() {
  const state = useSubscriptionPaymentState();

  const presentation = useSubscriptionPaymentPresentation({
    stage: state.stage,
    orderNumber: state.orderNumber,
    isPointsPayment: state.isPointsPayment,
    isCardPayment: state.isCardPayment,
    autoCheckAttempt: state.autoCheckAttempt,
    message: state.message,
    isSubscribing: state.isSubscribing,
    isPayingWithPoints: state.isPayingWithPoints,
    isChecking: state.isChecking,
    isAutoChecking: state.isAutoChecking,
    isPremiumActive: state.isPremiumActive,
    isDriver: state.isDriver,
    paymentMethod: state.paymentMethod,
    paymentUrl: state.paymentUrl,
  });

  const storage = useSubscriptionPaymentStorage({
    pollingRunIdRef: state.pollingRunIdRef,
    mountedRef: state.mountedRef,
    setIsAutoChecking: state.setIsAutoChecking,
    storageKey: state.storageKey,
    isPremiumActive: state.isPremiumActive,
    setOrderNumber: state.setOrderNumber,
    setPaymentUrl: state.setPaymentUrl,
    setStage: state.setStage,
    setMessage: state.setMessage,
    setAutoCheckAttempt: state.setAutoCheckAttempt,
    currentUser: state.currentUser,
    setSelectedChannel: state.setSelectedChannel,
    setPaymentMethod: state.setPaymentMethod,
  });

  const monitoring = useSubscriptionPaymentMonitoring({
    stopAutoCheck: storage.stopAutoCheck,
    clearStoredPayment: storage.clearStoredPayment,
    refetchPremiumOverview: state.refetchPremiumOverview,
    refetchProfile: state.refetchProfile,
    refetchWallet: state.refetchWallet,
    setStage: state.setStage,
    setOrderNumber: state.setOrderNumber,
    setPaymentUrl: state.setPaymentUrl,
    setMessage: state.setMessage,
    subscriptionRewardTokens: state.subscriptionRewardTokens,
    setAutoCheckAttempt: state.setAutoCheckAttempt,
    showDialog: state.showDialog,
    checkPaymentStatus: state.checkPaymentStatus,
    pollingRunIdRef: state.pollingRunIdRef,
    setIsAutoChecking: state.setIsAutoChecking,
    paymentMethod: state.paymentMethod,
    mountedRef: state.mountedRef,
  });

  const browser = useSubscriptionPaymentBrowser({
    setStage: state.setStage,
    checkPaymentByOrderNumber: monitoring.checkPaymentByOrderNumber,
    startAutoCheck: monitoring.startAutoCheck,
    setMessage: state.setMessage,
  });

  const recovery = useSubscriptionPaymentRestore({
    currentUser: state.currentUser,
    readStoredPayment: storage.readStoredPayment,
    applyStoredPayment: storage.applyStoredPayment,
    paymentHistory: state.paymentHistory,
    selectedChannel: state.selectedChannel,
    persistStoredPayment: storage.persistStoredPayment,
    setRefreshing: state.setRefreshing,
    refetchProfile: state.refetchProfile,
    isDriver: state.isDriver,
    refetchPremiumOverview: state.refetchPremiumOverview,
    refetchPaymentHistory: state.refetchPaymentHistory,
    refetchWallet: state.refetchWallet,
  });

  const actions = useSubscriptionPaymentActions({
    isDriver: state.isDriver,
    showDialog: state.showDialog,
    isPremiumActive: state.isPremiumActive,
    setStage: state.setStage,
    setMessage: state.setMessage,
    orderNumber: state.orderNumber,
    paymentMethod: state.paymentMethod,
    paymentUrl: state.paymentUrl,
    openCardPaymentUrl: browser.openCardPaymentUrl,
    stage: state.stage,
    stopAutoCheck: storage.stopAutoCheck,
    checkPaymentByOrderNumber: monitoring.checkPaymentByOrderNumber,
    startAutoCheck: monitoring.startAutoCheck,
    isPointsPayment: state.isPointsPayment,
    walletSummary: state.walletSummary,
    subscriptionPointsAmount: state.subscriptionPointsAmount,
    walletBalance: state.walletBalance,
    walletBalanceLabel: state.walletBalanceLabel,
    subscriptionPointsLabel: state.subscriptionPointsLabel,
    clearStoredPayment: storage.clearStoredPayment,
    setOrderNumber: state.setOrderNumber,
    setPaymentUrl: state.setPaymentUrl,
    setAutoCheckAttempt: state.setAutoCheckAttempt,
    subscribeToProWithPoints: state.subscribeToProWithPoints,
    finishPayment: monitoring.finishPayment,
    selectedChannel: state.selectedChannel,
    phone: state.phone,
    setPhone: state.setPhone,
    setPaymentMethod: state.setPaymentMethod,
    subscribeToPro: state.subscribeToPro,
    persistStoredPayment: storage.persistStoredPayment,
    openExternalUrl: browser.openExternalUrl,
    restorePayment: recovery.restorePayment,
  });

  const lifecycle = useSubscriptionPaymentLifecycle({
    scrollRef: state.scrollRef,
    phoneFieldOffsetRef: state.phoneFieldOffsetRef,
    prefilledPhoneRef: state.prefilledPhoneRef,
    currentUser: state.currentUser,
    setPhone: state.setPhone,
    mountedRef: state.mountedRef,
    pollingRunIdRef: state.pollingRunIdRef,
    storageKey: state.storageKey,
    isPremiumActive: state.isPremiumActive,
    recentPendingPayment: state.recentPendingPayment,
    restoredKeyRef: state.restoredKeyRef,
    restorePayment: recovery.restorePayment,
    checkPaymentByOrderNumber: monitoring.checkPaymentByOrderNumber,
    startAutoCheck: monitoring.startAutoCheck,
    returnedPaymentStatus: state.returnedPaymentStatus,
    orderNumber: state.orderNumber,
    handledPaymentStatusRef: state.handledPaymentStatusRef,
    setStage: state.setStage,
    setMessage: state.setMessage,
    isDriver: state.isDriver,
    stage: state.stage,
    paymentMethod: state.paymentMethod,
    isAutoChecking: state.isAutoChecking,
  });

  return {
    state,
    recovery,
    presentation,
    lifecycle,
    actions,
  };
}
