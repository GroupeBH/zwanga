import { useArrivalPaymentState } from '../hooks/arrival-payment/useArrivalPaymentState';
import { useMixedCashPayment } from '../hooks/arrival-payment/useMixedCashPayment';
import { useArrivalPaymentMonitoring } from '../hooks/arrival-payment/useArrivalPaymentMonitoring';
import { ArrivalPaymentFields } from '../features/arrival-payment/ArrivalPaymentFields';
import { ArrivalPaymentActions } from '../features/arrival-payment/ArrivalPaymentActions';
import { ArrivalPaymentRecovery } from '../features/arrival-payment/ArrivalPaymentRecovery';
import { useArrivalPaymentRecovery } from '../hooks/arrival-payment/useArrivalPaymentRecovery';
import { useTokenCashFallback } from '../hooks/arrival-payment/useTokenCashFallback';
import { useArrivalPaymentNavigation } from '../hooks/arrival-payment/useArrivalPaymentNavigation';
import { useArrivalPaymentProvider } from '../hooks/arrival-payment/useArrivalPaymentProvider';
import { useArrivalPaymentSubmission } from '../hooks/arrival-payment/useArrivalPaymentSubmission';
import { useArrivalPaymentCompletion } from '../hooks/arrival-payment/useArrivalPaymentCompletion';
import {
  formatMoney,
  formatPoints,
  getPaymentChannelLabel,
} from '../features/arrival-payment/paymentModel';
import { DRC_PAYMENT_PHONE_REGEX } from '../features/arrival-payment/paymentPolicy';
import { styles } from '../features/screen-styles/components/PassengerArrivalPaymentCoordinator/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { PassengerInterruptionChoice } from '@/components/trip/PassengerInterruptionChoice';
import React, { useMemo } from 'react';
import { buildPaymentCompletionSummary } from '@/features/arrival-payment/buildPaymentCompletionSummary';
import {
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated, selectUser } from '@/store/selectors';
import { PendingPaymentReminder } from '@/features/arrival-payment/PendingPaymentReminder';
import { Spacing } from '@/constants/styles';
import { openInterruptionChoice } from '@/store/slices/tripsSlice';

WebBrowser.maybeCompleteAuthSession();

export function PassengerArrivalPaymentCoordinator() {
  const user = useAppSelector(selectUser);
  const authenticated = useAppSelector(selectIsAuthenticated);
  return authenticated && user?.id ? <ArrivalPaymentSession key={user.id} /> : null;
}

function ArrivalPaymentSession() {
  const state = useArrivalPaymentState();
  const interruptionChoice = state.interruptionChoice;
  // Already paid/free bookings open their receipt immediately, not another confirmation step.
  const receipt = useMemo(() => state.completionSummary ?? (state.arrivalBooking && (state.paymentAlreadySucceeded || state.arrivalBooking.mixedPaymentAt || state.arrivalBooking.tokenCashFallbackAt)
    ? buildPaymentCompletionSummary(state.arrivalBooking, state.wallet, state.paymentHistory, {}) : null),
  [state.completionSummary, state.arrivalBooking, state.paymentAlreadySucceeded, state.wallet, state.paymentHistory]);

  const completion = useArrivalPaymentCompletion({
    isSessionCurrent: state.isSessionCurrent,
    refetchBookings: state.refetchBookings,
    refetchWallet: state.refetchWallet,
    refetchPaymentHistory: state.refetchPaymentHistory,
    bookings: state.bookings,
    wallet: state.wallet,
    paymentHistory: state.paymentHistory,
    setCompletionSummary: state.setCompletionSummary,
    setStatusMessage: state.setStatusMessage,
    reportPaymentFailure: state.reportPaymentFailure,
    persistBookingState: state.persistBookingState,
    setPaymentError: state.setPaymentError,
  });

  const provider = useArrivalPaymentProvider({
    isSessionCurrent: state.isSessionCurrent,
    setStatusMessage: state.setStatusMessage,
    setPaymentError: state.setPaymentError,
    checkBookingPaymentStatus: state.checkBookingPaymentStatus,
    handleCompletedBookingPayment: completion.handleCompletedBookingPayment,
    updatePaymentMode: state.updatePaymentMode,
    refetchBookings: state.refetchBookings,
    refetchWallet: state.refetchWallet,
    showCompletionSummary: completion.showCompletionSummary,
  });

  const recovery = useArrivalPaymentRecovery(state, provider, completion);
  const cashFallback = useTokenCashFallback(state, completion);
  const monitoring = useArrivalPaymentMonitoring({
    state: { ...state, isPaymentDeferred: state.isPaymentDeferred || recovery.isWorking || cashFallback.isWorking }, provider, completion,
  });
  const mixed = useMixedCashPayment(state, completion);
  const paymentPending = state.hasPendingProviderPayment || mixed.pending || Boolean(state.storageError);

  const submission = useArrivalPaymentSubmission({
    userId: state.user?.id,
    pendingTopUp: state.activeStoredState?.walletTopUpIntent,
    payTokensCash: mixed.cashSelected ? mixed.submit : undefined,
    acknowledgeCash: state.acknowledgeBooking,
    isSessionCurrent: state.isSessionCurrent,
    arrivalBooking: state.arrivalBooking,
    paymentAmount: state.paymentAmount,
    isBusy: state.isBusy || Boolean(state.storageError) || state.isStorageLoading,
    hasPendingProviderPayment: paymentPending,
    reportPaymentFailure: state.reportPaymentFailure,
    setPaymentError: state.setPaymentError,
    setStatusMessage: state.setStatusMessage,
    paymentAlreadySucceeded: state.paymentAlreadySucceeded,
    showCompletionSummary: completion.showCompletionSummary,
    selectedMode: state.selectedMode,
    selectedChannel: state.selectedChannel,
    updatePaymentMode: state.updatePaymentMode,
    requiredPoints: state.requiredPoints,
    isWalletFetching: state.isWalletFetching,
    missingPoints: state.missingPoints,
    settleWithPoints: provider.settleWithPoints,
    mobileMoneyPhone: state.mobileMoneyPhone,
    initiateWalletTopUp: state.initiateWalletTopUp,
    persistBookingState: state.persistBookingState,
    refetchWallet: state.refetchWallet,
    moneyComplement: state.moneyComplement,
    paymentCurrency: state.paymentCurrency,
    initiateBookingPayment: state.initiateBookingPayment,
    openCardPaymentUrl: provider.openCardPaymentUrl,
    handleCompletedBookingPayment: completion.handleCompletedBookingPayment,
  });

  const navigation = useArrivalPaymentNavigation({
    completionSummary: receipt,
    acknowledgeBooking: state.acknowledgeBooking,
    setCompletionSummary: state.setCompletionSummary,
    router: state.router,
    pendingInvoicePaymentIdRef: state.pendingInvoicePaymentIdRef,
    setIsClosingForInvoice: state.setIsClosingForInvoice,
    arrivalBooking: state.arrivalBooking,
    activeStoredState: state.activeStoredState,
    isBusy: state.isBusy,
    setPaymentError: state.setPaymentError,
    openCardPaymentUrl: provider.openCardPaymentUrl,
  });

  const isModalVisible = state.isAppActive && state.isResumeReady && !state.isClosingForInvoice && Boolean(
    interruptionChoice || (!state.isPaymentDeferred && (state.completionSummary || state.arrivalBooking)));

  const destination = state.arrivalBooking?.interruptionFareLocked ? 'Arrêt confirmé pendant le trajet' :
    state.arrivalBooking?.passengerDestination ??
    state.arrivalBooking?.trip?.arrival?.address ??
    state.arrivalBooking?.trip?.arrival?.name ??
    'Votre destination';
  const actionLabel = !state.selectedMode ? 'Choisir un mode de paiement' : state.paymentAlreadySucceeded
    ? state.isBeforeArrival ? 'Continuer le trajet' : 'Terminer'
    : state.selectedMode === 'cash'
      ? state.isBeforeArrival ? 'Préparation du paiement…' : 'Terminer · paiement en espèces'
      : state.selectedMode === 'points'
        ? state.missingPoints > 0
          ? mixed.cashSelected ? `Utiliser ${formatPoints(state.pointsUsed)} + espèces`
            : `Ajouter ${formatMoney(state.moneyComplement, state.paymentCurrency)} et payer`
          : `Payer avec ${formatPoints(state.requiredPoints ?? 0)}`
        : state.selectedChannel === 'card'
          ? 'Payer par carte'
          : `Payer par ${getPaymentChannelLabel(state.selectedChannel)}`;
  const needsMobileMoneyPhone =
    !state.paymentAlreadySucceeded &&
    ((state.selectedMode === 'electronic' && state.selectedChannel !== 'card') ||
      (state.selectedMode === 'points' && state.moneyComplement > 0 && !mixed.cashSelected));
  const isPaymentPhoneInvalid =
    needsMobileMoneyPhone && (!state.mobileMoneyPhone || !DRC_PAYMENT_PHONE_REGEX.test(state.mobileMoneyPhone));
  const isPayButtonDisabled =
    state.isBusy || submission.isSubmitting || mixed.isLoading ||
    !state.selectedMode ||
    paymentPending ||
    state.paymentAmount === null ||
    (state.isBeforeArrival && state.selectedMode === 'cash') ||
    isPaymentPhoneInvalid ||
    (state.selectedMode === 'points' && state.isWalletFetching);
  const recoveryVisible = !receipt && Boolean(state.arrivalBooking) &&
    (paymentPending || state.canChangeFailedPaymentMode || recovery.isWorking || cashFallback.isWorking || submission.isSubmittingCash);
  const retryPayment = state.storageError ? state.retryPaymentStorage
    : state.activeStoredState?.walletTopUpIntent ? () => { void recovery.run(); }
    : mixed.pending ? () => { void mixed.submit(); } : monitoring.retryVerification;

  return (
    <>
    <PendingPaymentReminder visible={state.isAppActive && state.isPaymentDeferred && !isModalVisible}
      bottom={state.insets.bottom + 80} onResume={state.resumePayment} />
    <Modal
      inApp
      priority={70}
      visible={isModalVisible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onDismiss={navigation.handleModalDismiss}
      onRequestClose={receipt ? navigation.handleDismissSummary : state.deferPayment}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.keyboardAvoidingView, { flex: 1 }]}
        >
          <View style={[styles.sheet,
            // A flex/scroll recovery panel needs a bounded, non-zero viewport.
            // maxHeight alone lets Yoga collapse it to its footer on Android.
            recoveryVisible && !interruptionChoice && { height: '82%', maxHeight: 540 },
            { paddingBottom: Math.max(state.insets.bottom, Spacing.lg) + Spacing.md }]}>
            <View style={styles.handle} />
            {interruptionChoice ? (
              <PassengerInterruptionChoice
                key={`${interruptionChoice.requestId}:${interruptionChoice.bookingId}`}
                {...interruptionChoice}
                onResolved={() => {
                  state.setResolvedInterruption(`${interruptionChoice.requestId}:${interruptionChoice.bookingId}`);
                  state.dispatch(openInterruptionChoice(null));
                }}
              />
            ) : recoveryVisible && state.arrivalBooking ? (
              <ArrivalPaymentRecovery bookingId={state.arrivalBooking.id} pending={paymentPending}
                busy={(cashFallback.canSwitch ? state.isMutatingPayment : state.isBusy) || submission.isSubmitting || recovery.isWorking || cashFallback.isWorking || state.isStorageLoading || mixed.isLoading}
                pendingCashAllowed={cashFallback.canSwitch && !state.storageError}
                savingCash={submission.isSubmittingCash || cashFallback.isWorking}
                beforeArrival={state.isBeforeArrival}
                amount={state.paymentAmount} currency={state.paymentCurrency} destination={destination}
                message={cashFallback.message ?? (!paymentPending ? state.paymentError : cashFallback.canSwitch ? undefined : recovery.message ?? (state.storageError ? 'Impossible de retrouver votre paiement sur ce téléphone. Réessayez ou contactez l’aide.'
                  : mixed.pending ? 'Le règlement jetons + espèces doit être confirmé. Vérifiez avant de payer à nouveau.'
                  : monitoring.verification.phase === 'paused' ? monitoring.verification.message : undefined))}
                onVerify={retryPayment}
                onChange={() => { if (!paymentPending) state.setSelectedMode(null); }}
                onCash={cashFallback.canSwitch ? cashFallback.run : submission.payCash} onClose={state.deferPayment}
                onResumeCard={state.hasCardPaymentToResume ? navigation.handleResumeCardPayment : undefined}
                onHelp={() => { state.deferPayment(); state.router.push('/support'); }} />
            ) : state.arrivalBooking || receipt ? (
              <>
                <ArrivalPaymentFields
                  cashComplementAvailable={mixed.supported}
                  cashComplementSelected={mixed.cashSelected}
                  onSelectCashComplement={mixed.selectCash}
                  cashRemainder={mixed.cashRemainder}
                  completionSummary={receipt}
                  arrivalBooking={state.arrivalBooking}
                  isBeforeArrival={state.isBeforeArrival}
                  destination={destination}
                  paymentAmount={state.paymentAmount}
                  paymentCurrency={state.paymentCurrency}
                  paymentAlreadySucceeded={state.paymentAlreadySucceeded}
                  arePointsRecommended={state.arePointsRecommended}
                  isBusy={state.isBusy || submission.isSubmitting || mixed.isLoading || state.isStorageLoading}
                  hasPendingProviderPayment={paymentPending}
                  setSelectedMode={state.setSelectedMode}
                  setPaymentError={state.setPaymentError}
                  setStatusMessage={state.setStatusMessage}
                  pointsCoveragePercentage={state.pointsCoveragePercentage}
                  selectedMode={state.selectedMode}
                  hasPaymentFailure={state.canChangeFailedPaymentMode}
                  isWalletFetching={state.isWalletFetching}
                  walletBalance={state.walletBalance}
                  pointsUsed={mixed.pending ? mixed.displayedPoints : state.pointsUsed}
                  amountCoveredByPoints={mixed.pending ? mixed.displayedTokenAmount : state.amountCoveredByPoints}
                  moneyComplement={state.moneyComplement}
                  selectedChannel={state.selectedChannel}
                  setSelectedChannel={state.setSelectedChannel}
                  needsMobileMoneyPhone={needsMobileMoneyPhone}
                  isPaymentPhoneInvalid={isPaymentPhoneInvalid}
                  paymentPhone={state.paymentPhone}
                  setPaymentPhone={state.setPaymentPhone}
                  hasCardPaymentToResume={state.hasCardPaymentToResume}
                  handleResumeCardPayment={navigation.handleResumeCardPayment}
                  statusMessage={state.statusMessage}
                  paymentError={state.paymentError}
                />

                <ArrivalPaymentActions
                  isBusy={state.isBusy || submission.isSubmitting || mixed.isLoading || state.isStorageLoading}
                  completionSummary={receipt}
                  onDone={navigation.handleDismissSummary}
                  onInvoice={navigation.handleOpenInvoice}
                  hasPendingProviderPayment={paymentPending}
                  paymentAlreadySucceeded={state.paymentAlreadySucceeded}
                  selectedMode={state.selectedMode}
                  actionLabel={actionLabel}
                  isPayButtonDisabled={isPayButtonDisabled}
                  verification={state.storageError ? { phase: 'paused', message: state.storageError }
                    : state.activeStoredState?.walletTopUpIntent ? { phase: 'paused', message: 'Complément à vérifier. Ne payez pas une seconde fois. Reprenez la même recharge ici.' }
                    : mixed.pending ? { phase: 'paused', message: mixed.message } : monitoring.verification}
                  paymentError={state.paymentError}
                  onPay={submission.handlePayment}
                  onRetry={retryPayment}
                  onClose={state.isBeforeArrival && !state.isBusy && !submission.isSubmitting && !state.hasPendingProviderPayment ? state.deferEarlyPayment : state.deferPayment}
                  closeLabel={state.isBeforeArrival ? 'Payer à l’arrivée' : 'Fermer et reprendre plus tard'}
                />
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
    </>
  );
}
