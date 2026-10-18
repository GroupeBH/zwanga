import { useArrivalPaymentState } from '../hooks/arrival-payment/useArrivalPaymentState';
import { useArrivalPaymentMonitoring } from '../hooks/arrival-payment/useArrivalPaymentMonitoring';
import { ArrivalPaymentFields } from '../features/arrival-payment/ArrivalPaymentFields';
import { ArrivalPaymentActions } from '../features/arrival-payment/ArrivalPaymentActions';
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
  const receipt = useMemo(() => state.completionSummary ?? (state.arrivalBooking && state.paymentAlreadySucceeded
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

  const monitoring = useArrivalPaymentMonitoring({ state, provider, completion });

  const submission = useArrivalPaymentSubmission({
    acknowledgeCash: state.acknowledgeBooking,
    isSessionCurrent: state.isSessionCurrent,
    arrivalBooking: state.arrivalBooking,
    paymentAmount: state.paymentAmount,
    isBusy: state.isBusy,
    hasPendingProviderPayment: state.hasPendingProviderPayment,
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
          ? `Ajouter ${formatMoney(state.moneyComplement, state.paymentCurrency)} et payer`
          : `Payer avec ${formatPoints(state.requiredPoints ?? 0)}`
        : state.selectedChannel === 'card'
          ? 'Payer par carte'
          : `Payer par ${getPaymentChannelLabel(state.selectedChannel)}`;
  const needsMobileMoneyPhone =
    !state.paymentAlreadySucceeded &&
    ((state.selectedMode === 'electronic' && state.selectedChannel !== 'card') ||
      (state.selectedMode === 'points' && state.moneyComplement > 0));
  const isPaymentPhoneInvalid =
    needsMobileMoneyPhone && (!state.mobileMoneyPhone || !DRC_PAYMENT_PHONE_REGEX.test(state.mobileMoneyPhone));
  const isPayButtonDisabled =
    state.isBusy || submission.isSubmitting ||
    !state.selectedMode ||
    state.hasPendingProviderPayment ||
    state.paymentAmount === null ||
    (state.isBeforeArrival && state.selectedMode === 'cash') ||
    isPaymentPhoneInvalid ||
    (state.selectedMode === 'points' && state.isWalletFetching);

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
          <View style={[styles.sheet, { paddingBottom: Math.max(state.insets.bottom, Spacing.lg) + Spacing.md }]}>
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
            ) : state.arrivalBooking || receipt ? (
              <>
                <ArrivalPaymentFields
                  completionSummary={receipt}
                  arrivalBooking={state.arrivalBooking}
                  isBeforeArrival={state.isBeforeArrival}
                  destination={destination}
                  paymentAmount={state.paymentAmount}
                  paymentCurrency={state.paymentCurrency}
                  paymentAlreadySucceeded={state.paymentAlreadySucceeded}
                  arePointsRecommended={state.arePointsRecommended}
                  isBusy={state.isBusy || submission.isSubmitting}
                  hasPendingProviderPayment={state.hasPendingProviderPayment}
                  setSelectedMode={state.setSelectedMode}
                  setPaymentError={state.setPaymentError}
                  setStatusMessage={state.setStatusMessage}
                  pointsCoveragePercentage={state.pointsCoveragePercentage}
                  selectedMode={state.selectedMode}
                  hasPaymentFailure={state.canChangeFailedPaymentMode}
                  isWalletFetching={state.isWalletFetching}
                  walletBalance={state.walletBalance}
                  pointsUsed={state.pointsUsed}
                  amountCoveredByPoints={state.amountCoveredByPoints}
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
                  isBusy={state.isBusy || submission.isSubmitting}
                  completionSummary={receipt}
                  onDone={navigation.handleDismissSummary}
                  onInvoice={navigation.handleOpenInvoice}
                  hasPendingProviderPayment={state.hasPendingProviderPayment}
                  paymentAlreadySucceeded={state.paymentAlreadySucceeded}
                  selectedMode={state.selectedMode}
                  actionLabel={actionLabel}
                  isPayButtonDisabled={isPayButtonDisabled}
                  verification={monitoring.verification}
                  paymentError={state.paymentError}
                  onPay={submission.handlePayment}
                  onRetry={monitoring.retryVerification}
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
