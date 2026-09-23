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
  getPaymentModeLabel,
} from '../features/arrival-payment/paymentModel';
import { DRC_PAYMENT_PHONE_REGEX } from '../features/arrival-payment/paymentPolicy';
import { styles } from '../features/screen-styles/components/PassengerArrivalPaymentCoordinator/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { PassengerInterruptionChoice } from '@/components/trip/PassengerInterruptionChoice';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated, selectUser } from '@/store/selectors';
import { PendingPaymentReminder } from '@/features/arrival-payment/PendingPaymentReminder';
import { Colors, Spacing } from '@/constants/styles';
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
    completionSummary: state.completionSummary,
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
      ? state.isBeforeArrival ? 'Préparation du paiement…' : 'Continuer avec le paiement cash'
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
    state.isBusy ||
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
      onRequestClose={state.completionSummary ? navigation.handleDismissSummary : state.deferPayment}
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
            ) : state.completionSummary ? (
              <>
                <ScrollView
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.content}
                >
                  <View style={styles.header}>
                    <View style={[styles.arrivalIcon, styles.summaryIcon]}>
                      <Ionicons name="checkmark" size={30} color={Colors.white} />
                    </View>
                    <View style={styles.headerCopy}>
                      <Text style={styles.eyebrow}>{state.completionSummary.cashInstructions ? 'PAIEMENT CASH' : 'PAIEMENT CONFIRMÉ'}</Text>
                      <Text style={styles.title}>{state.completionSummary.beforeArrival ? 'Votre paiement est réglé' : 'Trajet terminé'}</Text>
                    </View>
                  </View>

                  <View style={styles.amountCard}>
                    <Text style={styles.amountLabel}>{state.completionSummary.cashInstructions ? 'Montant à remettre au conducteur' : 'Montant réglé'}</Text>
                    <Text style={styles.amountValue}>
                      {formatMoney(state.completionSummary.amount, state.completionSummary.currency)}
                    </Text>
                    <Text style={styles.amountHint}>
                      Moyen utilisé : {getPaymentModeLabel(state.completionSummary.mode, state.completionSummary.channel)}
                    </Text>
                  </View>

                  <View style={styles.summaryRows}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Nouveau solde</Text>
                      <Text style={styles.summaryValue}>
                        {state.completionSummary.walletBalance === null
                          ? 'Actualisation en cours'
                          : formatPoints(state.completionSummary.walletBalance)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Jetons gagnés</Text>
                      <Text style={styles.summaryValue}>
                        {state.completionSummary.earnedPointsKnown
                          ? formatPoints(state.completionSummary.earnedPoints)
                          : state.completionSummary.beforeArrival ? 'Calculés à l’arrivée' : 'Calcul en cours'}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Référence</Text>
                      <Text style={styles.summaryValue} numberOfLines={1}>
                        {state.completionSummary.paymentReference ?? 'A venir'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.successBox}>
                    <Ionicons name="notifications-outline" size={22} color={Colors.successDark} />
                    <View style={styles.successCopy}>
                      <Text style={styles.successTitle}>{state.completionSummary.cashInstructions ? 'Règlement au conducteur' : 'Conducteur informé'}</Text>
                      <Text style={styles.successText}>{state.completionSummary.driverNotice}</Text>
                    </View>
                  </View>
                </ScrollView>

                <View style={styles.summaryActions}>
                  {state.completionSummary.invoiceUrl ? (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={navigation.handleOpenInvoice}
                      style={[styles.payButton, styles.invoiceButton]}
                    >
                      <Ionicons name="receipt-outline" size={20} color={Colors.primary} />
                      <Text style={[styles.payButtonText, styles.invoiceButtonText]}>Voir la facture</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity activeOpacity={0.88} onPress={navigation.handleDismissSummary} style={styles.payButton}>
                    <Ionicons name="checkmark" size={20} color={Colors.white} />
                    <Text style={styles.payButtonText}>{state.completionSummary.beforeArrival ? 'Continuer le trajet' : 'Terminer'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : state.arrivalBooking ? (
              <>
                <ArrivalPaymentFields
                  arrivalBooking={state.arrivalBooking}
                  isBeforeArrival={state.isBeforeArrival}
                  destination={destination}
                  paymentAmount={state.paymentAmount}
                  paymentCurrency={state.paymentCurrency}
                  paymentAlreadySucceeded={state.paymentAlreadySucceeded}
                  arePointsRecommended={state.arePointsRecommended}
                  isBusy={state.isBusy}
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
                  isBusy={state.isBusy}
                  hasPendingProviderPayment={state.hasPendingProviderPayment}
                  paymentAlreadySucceeded={state.paymentAlreadySucceeded}
                  selectedMode={state.selectedMode}
                  actionLabel={actionLabel}
                  isPayButtonDisabled={isPayButtonDisabled}
                  verification={monitoring.verification}
                  onPay={submission.handlePayment}
                  onRetry={monitoring.retryVerification}
                  onClose={state.deferPayment}
                />
                {state.isBeforeArrival && !state.paymentAlreadySucceeded && !state.isBusy && !state.hasPendingProviderPayment ? (
                  <TouchableOpacity onPress={state.deferEarlyPayment} style={[styles.payButton, styles.invoiceButton]}>
                    <Text style={[styles.payButtonText, styles.invoiceButtonText]}>Payer à l’arrivée</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
    </>
  );
}
