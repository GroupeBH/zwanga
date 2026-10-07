import {
  formatMoney,
  formatPoints,
  formatPaymentPhone,
  normalizePaymentPhone,
  getPaymentChannelLabel,
} from './paymentModel';
import { PaymentCompletionSummary, PaymentChannel, PAYMENT_OPTIONS, ELECTRONIC_PAYMENT_CHANNELS } from './paymentTypes';
import { styles } from '../screen-styles/components/PassengerArrivalPaymentCoordinator/index';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ELECTRONIC_PAYMENTS_ENABLED } from '@/constants/paymentFeatures';
import { Colors } from '@/constants/styles';
import { ArrivalPaymentReceipt } from './ArrivalPaymentReceipt';
import type { Booking, TripPaymentMode } from '@/types';
import { getInterruptionDistanceLabel } from './interruptionSettlement';
import { useBookingPaymentOptionsQuery } from '@/store/api/driverFinanceApi';

interface ArrivalPaymentFieldsProps {
  arrivalBooking: Booking | null;
  completionSummary?: PaymentCompletionSummary | null;
  isBeforeArrival?: boolean;
  destination: string;
  paymentAmount: number | null;
  paymentCurrency: string;
  paymentAlreadySucceeded: boolean;
  arePointsRecommended: boolean;
  isBusy: boolean;
  hasPendingProviderPayment: boolean;
  setSelectedMode: React.Dispatch<React.SetStateAction<TripPaymentMode | null>>;
  setPaymentError: React.Dispatch<React.SetStateAction<string>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  pointsCoveragePercentage: number;
  selectedMode: TripPaymentMode | null;
  hasPaymentFailure: boolean;
  isWalletFetching: boolean;
  walletBalance: number;
  pointsUsed: number;
  amountCoveredByPoints: number;
  moneyComplement: number;
  selectedChannel: PaymentChannel;
  setSelectedChannel: React.Dispatch<React.SetStateAction<PaymentChannel>>;
  needsMobileMoneyPhone: boolean;
  isPaymentPhoneInvalid: boolean;
  paymentPhone: string;
  setPaymentPhone: React.Dispatch<React.SetStateAction<string>>;
  hasCardPaymentToResume: boolean;
  handleResumeCardPayment: () => Promise<void>;
  statusMessage: string;
  paymentError: string;
}

export function ArrivalPaymentFields(props: ArrivalPaymentFieldsProps) {
  const { arrivalBooking, completionSummary: receipt, destination, paymentAmount, paymentCurrency,
    paymentAlreadySucceeded, isBeforeArrival = false, isBusy, hasPendingProviderPayment,
    selectedMode, setSelectedMode, hasPaymentFailure, setPaymentError, setStatusMessage,
    arePointsRecommended, pointsCoveragePercentage, isWalletFetching, walletBalance, pointsUsed,
    amountCoveredByPoints, moneyComplement, selectedChannel, setSelectedChannel, needsMobileMoneyPhone,
    isPaymentPhoneInvalid, paymentPhone, setPaymentPhone, hasCardPaymentToResume, handleResumeCardPayment, statusMessage } = props;
  const scrollRef = useRef<ScrollView>(null);
  const modePickerY = useRef(0);
  const complete = Boolean(receipt || paymentAlreadySucceeded);
  const { currentData: paymentOptions, isError: optionsError } = useBookingPaymentOptionsQuery(arrivalBooking?.id ?? '', {
    skip: !arrivalBooking?.id || complete, refetchOnMountOrArgChange: true,
  });
  const locked = isBusy || hasPendingProviderPayment;
  const beforeArrival = receipt?.beforeArrival ?? isBeforeArrival;
  const cash = receipt?.cashInstructions || (!complete && selectedMode === 'cash');
  const seats = receipt?.numberOfSeats ?? arrivalBooking?.numberOfSeats ?? 1;
  const amount = receipt?.amount ?? paymentAmount;
  const currency = receipt?.currency ?? paymentCurrency;
  const distanceLabel = arrivalBooking ? getInterruptionDistanceLabel(arrivalBooking) : null;
  useEffect(() => {
    if ((selectedMode === null || hasPaymentFailure) && !complete) {
      scrollRef.current?.scrollTo({ y: modePickerY.current, animated: false });
    }
  }, [selectedMode, complete, hasPaymentFailure]);
  useEffect(() => {
    if (complete) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [complete]);
  return <ScrollView ref={scrollRef} bounces={false} showsVerticalScrollIndicator={false}
    keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{beforeArrival ? 'DESTINATION À PROXIMITÉ' : arrivalBooking?.interruptionFareLocked ? 'ARRÊT CONFIRMÉ' : 'ARRIVÉE CONFIRMÉE'}</Text>
        <Text style={styles.title} accessibilityLiveRegion="polite">
          {complete ? cash ? 'Règlement en espèces' : amount === 0 ? 'Trajet gratuit' : 'Paiement confirmé' : 'Régler le trajet'}
        </Text>
      </View>
      <Ionicons name={complete && !cash ? 'checkmark-circle' : 'wallet-outline'} size={28}
        color={complete && !cash ? Colors.successDark : Colors.primary} />
    </View>
    <View style={styles.destinationRow}>
      <Ionicons name="location-outline" size={16} color={Colors.gray[600]} />
      <Text style={styles.destination}>{receipt?.destination ?? destination}</Text>
    </View>
    <View style={styles.amountCard}>
      <Text style={styles.amountLabel}>{seats > 1 ? `Total pour ${seats} places` : 'Montant du trajet'}</Text>
      <Text style={styles.amountValue}>{amount === null ? 'Calcul en cours…' : formatMoney(amount, currency)}</Text>
      <Text style={styles.amountHint}>
        {cash ? 'À remettre au conducteur. Aucun prélèvement dans l’application.'
          : complete ? 'Rien à payer de nouveau.'
          : hasPendingProviderPayment ? 'Paiement en cours : ne payez pas une seconde fois.'
          : beforeArrival ? 'Vous pouvez payer maintenant ; le trajet continue jusqu’à votre destination.'
          : arrivalBooking?.interruptionFareLocked ? 'Montant définitif pour la partie du trajet effectuée.'
          : 'Choisissez votre moyen de paiement ci-dessous.'}
      </Text>
      {distanceLabel ? <Text style={styles.amountHint}>{distanceLabel}</Text> : null}
    </View>
    {receipt ? <ArrivalPaymentReceipt summary={receipt} /> : complete ? null : <>
      <View onLayout={({ nativeEvent }) => {
        modePickerY.current = nativeEvent.layout.y;
        if (selectedMode === null || hasPaymentFailure) scrollRef.current?.scrollTo({ y: modePickerY.current, animated: false });
      }}>
        <Text style={styles.sectionTitle}>Moyen de paiement</Text>
        {!paymentOptions && <Text style={styles.amountHint}>{optionsError ? 'Modes de paiement indisponibles. Rouvrez cet écran pour réessayer.' : 'Vérification des modes de paiement…'}</Text>}
        {paymentOptions?.cashUnavailableReason && <Text style={styles.amountHint}>{paymentOptions.cashUnavailableReason}</Text>}
        {hasPaymentFailure && <Text style={styles.amountHint}>Vous pouvez réessayer ou choisir un autre moyen de paiement.</Text>}
        <View style={styles.options}>
          {PAYMENT_OPTIONS.filter(option => (!beforeArrival || option.id !== 'cash') &&
            (option.id !== 'electronic' || ELECTRONIC_PAYMENTS_ENABLED) &&
            (!paymentOptions || paymentOptions.acceptedPaymentModes.includes(option.id) || arrivalBooking?.paymentMode === option.id)).map(option => {
            const selected = selectedMode === option.id;
            const disabled = locked || !paymentOptions || !paymentOptions.availablePaymentModes.includes(option.id);
            return <TouchableOpacity key={option.id} accessibilityRole="radio" accessibilityLabel={option.title}
              accessibilityState={{ checked: selected, disabled }} activeOpacity={0.85} disabled={disabled}
              onPress={() => { if (disabled) return; setSelectedMode(option.id); setPaymentError(''); setStatusMessage(''); }}
              style={[styles.option, selected && styles.optionSelected, disabled && { opacity: 0.5 }]}>
              <Ionicons name={option.icon} size={20} color={selected ? Colors.primary : Colors.gray[600]} />
              <View style={styles.optionCopy}>
                <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>{option.title}</Text>
                {option.id === 'points' && arePointsRecommended &&
                  <Text style={styles.optionDescription}>{pointsCoveragePercentage} % couvert par vos jetons</Text>}
              </View>
              <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? Colors.primary : Colors.gray[300]} />
            </TouchableOpacity>;
          })}
        </View>
      </View>
      {selectedMode === 'points' && <View style={styles.pointsCard}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Jetons disponibles</Text>
          <Text style={styles.breakdownValue}>{isWalletFetching ? 'Actualisation…' : formatPoints(walletBalance)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Jetons utilisés</Text>
          <Text style={styles.breakdownValue}>{formatPoints(pointsUsed)} · {formatMoney(amountCoveredByPoints, currency)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Complément Mobile Money</Text>
          <Text style={styles.breakdownValue}>{formatMoney(moneyComplement, currency)}</Text>
        </View>
        {moneyComplement > 0 && <Text style={styles.pointsHint}>Le complément recharge les jetons manquants, puis règle ce trajet avec vos jetons actuels.</Text>}
      </View>}
      {selectedMode === 'electronic' && ELECTRONIC_PAYMENTS_ENABLED && <View style={styles.electronicCard}>
        <Text style={styles.paymentFieldLabel}>Opérateur ou carte</Text>
        <View style={styles.channelGrid}>
          {ELECTRONIC_PAYMENT_CHANNELS.map(channel => <TouchableOpacity key={channel.id} activeOpacity={0.86}
            accessibilityRole="radio" accessibilityLabel={channel.title} accessibilityState={{ checked: selectedChannel === channel.id, disabled: locked }}
            disabled={locked} onPress={() => { if (locked) return; setSelectedChannel(channel.id); setPaymentError(''); setStatusMessage(''); }}
            style={[styles.channelOption, selectedChannel === channel.id && styles.channelOptionSelected]}>
            <Ionicons name={channel.icon} size={18} color={selectedChannel === channel.id ? Colors.primary : Colors.gray[600]} />
            <Text style={[styles.channelTitle, selectedChannel === channel.id && styles.channelTitleSelected]}>{channel.title}</Text>
          </TouchableOpacity>)}
        </View>
      </View>}
      {needsMobileMoneyPhone && <View style={styles.phoneCard}>
        <Text style={styles.paymentFieldLabel}>Numéro Mobile Money</Text>
        <View style={[styles.phoneInputRow, isPaymentPhoneInvalid && paymentPhone.length > 0 && styles.phoneInputRowInvalid]}>
          <Ionicons name="call-outline" size={18} color={Colors.gray[500]} />
          <TextInput value={paymentPhone} accessibilityLabel="Numéro Mobile Money"
            onChangeText={value => { setPaymentPhone(normalizePaymentPhone(value)); setPaymentError(''); }}
            onBlur={() => setPaymentPhone(formatPaymentPhone(paymentPhone) ?? paymentPhone)}
            placeholder="+243…" placeholderTextColor={Colors.gray[400]} keyboardType="phone-pad"
            editable={!locked} style={styles.phoneInput} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
        </View>
        <Text style={[styles.phoneHint, isPaymentPhoneInvalid && paymentPhone.length > 0 && styles.phoneHintInvalid]}>
          {isPaymentPhoneInvalid ? 'Saisissez un numéro congolais valide (+243).'
            : selectedMode === 'points' ? 'Ce numéro sert uniquement au complément.'
            : `La demande sera envoyée via ${getPaymentChannelLabel(selectedChannel)}.`}
        </Text>
      </View>}
      {hasCardPaymentToResume && <TouchableOpacity activeOpacity={0.88} accessibilityRole="button" disabled={isBusy}
        onPress={() => { if (!isBusy) void handleResumeCardPayment(); }} style={styles.resumePaymentButton}>
        <Ionicons name="open-outline" size={18} color={Colors.primary} />
        <Text style={styles.resumePaymentText}>Rouvrir la page carte</Text>
      </TouchableOpacity>}
      {statusMessage && !hasPendingProviderPayment ? <View style={styles.statusBox} accessibilityLiveRegion="polite">
        {isBusy ? <ActivityIndicator size="small" color={Colors.infoDark} /> : <Ionicons name="information-circle-outline" size={20} color={Colors.infoDark} />}
        <Text style={styles.statusText}>{statusMessage}</Text>
      </View> : null}
    </>}
  </ScrollView>;
}
