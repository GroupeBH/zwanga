import {
  formatMoney,
  formatPoints,
  formatPaymentPhone,
  normalizePaymentPhone,
  getPaymentChannelLabel,
} from './paymentModel';
import { PaymentChannel, PAYMENT_OPTIONS, ELECTRONIC_PAYMENT_CHANNELS } from './paymentTypes';
import { styles } from '../screen-styles/components/PassengerArrivalPaymentCoordinator/index';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Keyboard, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ELECTRONIC_PAYMENTS_ENABLED } from '@/constants/paymentFeatures';
import { Colors } from '@/constants/styles';
import type { TripPaymentMode } from '@/types';
import type { Booking } from '@/types';

interface ArrivalPaymentFieldsProps {
  arrivalBooking: Booking;
  isBeforeArrival?: boolean;
  destination: string;
  paymentAmount: number | null;
  paymentCurrency: string;
  paymentAlreadySucceeded: boolean;
  arePointsRecommended: boolean;
  isBusy: boolean;
  hasPendingProviderPayment: boolean;
  setSelectedMode: React.Dispatch<React.SetStateAction<TripPaymentMode>>;
  setPaymentError: React.Dispatch<React.SetStateAction<string>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  pointsCoveragePercentage: number;
  selectedMode: TripPaymentMode;
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

export function ArrivalPaymentFields({
  arrivalBooking,
  isBeforeArrival = false,
  destination,
  paymentAmount,
  paymentCurrency,
  paymentAlreadySucceeded,
  arePointsRecommended,
  isBusy,
  hasPendingProviderPayment,
  setSelectedMode,
  setPaymentError,
  setStatusMessage,
  pointsCoveragePercentage,
  selectedMode,
  isWalletFetching,
  walletBalance,
  pointsUsed,
  amountCoveredByPoints,
  moneyComplement,
  selectedChannel,
  setSelectedChannel,
  needsMobileMoneyPhone,
  isPaymentPhoneInvalid,
  paymentPhone,
  setPaymentPhone,
  hasCardPaymentToResume,
  handleResumeCardPayment,
  statusMessage,
  paymentError,
}: ArrivalPaymentFieldsProps) {
  return (
    <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.content}
              >
                <View style={styles.header}>
                  <View style={styles.arrivalIcon}>
    <Ionicons name="flag" size={28} color={Colors.white} />
                  </View>
                  <View style={styles.headerCopy}>
    <Text style={styles.eyebrow}>{isBeforeArrival ? 'DESTINATION À PROXIMITÉ' : arrivalBooking.interruptionFareLocked ? 'ARRÊT CONFIRMÉ' : 'ARRIVÉE CONFIRMÉE'}</Text>
    <Text style={styles.title}>{isBeforeArrival ? 'Préparez votre arrivée' : arrivalBooking.interruptionFareLocked ? 'Votre trajet s’arrête ici' : 'Vous êtes arrivé'}</Text>
                  </View>
                </View>

                <View style={styles.destinationRow}>
                  <Ionicons name="location" size={18} color={Colors.primary} />
                  <Text style={styles.destination} numberOfLines={2}>{destination}</Text>
                </View>

                <View style={styles.amountCard}>
                  <Text style={styles.amountLabel}>Montant du trajet</Text>
                  <Text style={styles.amountValue}>
    {paymentAmount === null
      ? 'Calcul en cours...'
      : formatMoney(paymentAmount, paymentCurrency)}
                  </Text>
                  <Text style={styles.amountHint}>
    {isBeforeArrival ? 'Vous êtes à proximité de votre destination. Réglez maintenant pour pouvoir descendre sans attendre. Votre trajet continue normalement.' : 'Choisissez comment régler ce trajet. Cette fenêtre restera ouverte jusqu’à votre action.'}
                  </Text>
                </View>

                {paymentAlreadySucceeded ? (
                  <View style={styles.successBox}>
    <Ionicons name="checkmark-circle" size={22} color={Colors.successDark} />
    <View style={styles.successCopy}>
      <Text style={styles.successTitle}>Paiement déjà confirmé</Text>
      <Text style={styles.successText}>Vous pouvez terminer ce récapitulatif.</Text>
    </View>
                  </View>
                ) : (
                  <>
    <Text style={styles.sectionTitle}>Moyen de paiement</Text>
    {arePointsRecommended ? (
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={isBusy || hasPendingProviderPayment}
        onPress={() => {
          setSelectedMode('points');
          setPaymentError('');
          setStatusMessage('');
        }}
        style={styles.pointsRecommendation}
      >
        <View style={styles.pointsRecommendationIcon}>
          <Ionicons name="sparkles" size={18} color={Colors.primaryDark} />
        </View>
        <View style={styles.pointsRecommendationCopy}>
          <Text style={styles.pointsRecommendationTitle}>
            Vos jetons couvrent {pointsCoveragePercentage} % du trajet
          </Text>
          <Text style={styles.pointsRecommendationText}>
            Utilisez-les et ne payez que le complément restant.
          </Text>
        </View>
        <View style={styles.pointsRecommendationAction}>
          <Text style={styles.pointsRecommendationActionText}>Utiliser</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.primaryDark} />
        </View>
      </TouchableOpacity>
    ) : null}
    <View style={styles.options}>
      {PAYMENT_OPTIONS.filter(
        (option) => (!isBeforeArrival || option.id !== 'cash') &&
          (option.id !== 'electronic' || ELECTRONIC_PAYMENTS_ENABLED),
      ).map((option) => {
        const isSelected = selectedMode === option.id;
        const isRecommended = arePointsRecommended && option.id === 'points';
        return (
          <TouchableOpacity
            key={option.id}
            activeOpacity={0.85}
            disabled={isBusy || hasPendingProviderPayment}
            onPress={() => {
              setSelectedMode(option.id);
              setPaymentError('');
              setStatusMessage('');
            }}
            style={[
              styles.option,
              isRecommended && styles.optionRecommended,
              isSelected && styles.optionSelected,
            ]}
          >
            <View style={[styles.optionIcon, isSelected && styles.optionIconSelected]}>
              <Ionicons
                name={option.icon}
                size={22}
                color={isSelected ? Colors.primary : Colors.gray[600]}
              />
            </View>
            <View style={styles.optionCopy}>
              <View style={styles.optionTitleRow}>
                <Text style={[styles.optionTitle, isSelected && styles.optionTitleSelected]}>
                  {option.title}
                </Text>
                {isRecommended ? (
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedBadgeText}>RECOMMANDÉ</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.optionDescription}>
                {isRecommended
                  ? `${pointsCoveragePercentage} % du montant déjà couvert`
                  : option.description}
              </Text>
            </View>
            <Ionicons
              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={isSelected ? Colors.primary : Colors.gray[300]}
            />
          </TouchableOpacity>
        );
      })}
    </View>
                  </>
                )}

                {!paymentAlreadySucceeded && selectedMode === 'points' && (
                  <View style={styles.pointsCard}>
    <View style={styles.pointsHeader}>
      <View>
        <Text style={styles.pointsLabel}>Vos jetons disponibles</Text>
        <Text style={styles.pointsBalance}>
          {isWalletFetching ? 'Actualisation...' : formatPoints(walletBalance)}
        </Text>
      </View>
      <View style={styles.walletBadge}>
        <Ionicons name="wallet" size={18} color={Colors.primary} />
      </View>
    </View>
    <View style={styles.breakdownDivider} />
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>Jetons utilisés</Text>
      <Text style={styles.breakdownValue}>{formatPoints(pointsUsed)}</Text>
    </View>
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>Montant couvert</Text>
      <Text style={styles.breakdownValue}>
        {formatMoney(amountCoveredByPoints, paymentCurrency)}
      </Text>
    </View>
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>Complément Mobile Money</Text>
      <Text style={[styles.breakdownValue, moneyComplement > 0 && styles.complementValue]}>
        {formatMoney(moneyComplement, paymentCurrency)}
      </Text>
    </View>
    {moneyComplement > 0 && (
      <Text style={styles.pointsHint}>
        Seul le complément achètera les jetons manquants. Vos jetons actuels seront ensuite ajoutés pour régler la totalité du trajet.
      </Text>
    )}
                  </View>
                )}

                {!paymentAlreadySucceeded && selectedMode === 'electronic' && ELECTRONIC_PAYMENTS_ENABLED && (
                  <View style={styles.electronicCard}>
    <Text style={styles.paymentFieldLabel}>Canal de paiement</Text>
    <View style={styles.channelGrid}>
      {ELECTRONIC_PAYMENT_CHANNELS.map((channel) => {
        const isSelected = selectedChannel === channel.id;
        return (
          <TouchableOpacity
            key={channel.id}
            activeOpacity={0.86}
            disabled={isBusy || hasPendingProviderPayment}
            onPress={() => {
              setSelectedChannel(channel.id);
              setPaymentError('');
              setStatusMessage('');
            }}
            style={[styles.channelOption, isSelected && styles.channelOptionSelected]}
          >
            <Ionicons
              name={channel.icon}
              size={20}
              color={isSelected ? Colors.primary : Colors.gray[600]}
            />
            <View style={styles.channelCopy}>
              <Text style={[styles.channelTitle, isSelected && styles.channelTitleSelected]}>
                {channel.title}
              </Text>
              <Text style={styles.channelDescription} numberOfLines={2}>
                {channel.description}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
                  </View>
                )}

                {needsMobileMoneyPhone && (
                  <View style={styles.phoneCard}>
    <Text style={styles.paymentFieldLabel}>Numéro Mobile Money</Text>
    <View style={[styles.phoneInputRow, isPaymentPhoneInvalid && styles.phoneInputRowInvalid]}>
      <Ionicons name="call-outline" size={18} color={Colors.gray[500]} />
      <TextInput
        value={paymentPhone}
        onChangeText={(value) => {
          setPaymentPhone(normalizePaymentPhone(value));
          setPaymentError('');
        }}
        onBlur={() => setPaymentPhone(formatPaymentPhone(paymentPhone) ?? paymentPhone)}
        placeholder="+243891234567"
        placeholderTextColor={Colors.gray[400]}
        keyboardType="phone-pad"
        editable={!isBusy && !hasPendingProviderPayment}
        style={styles.phoneInput}
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
      />
    </View>
    <Text style={[styles.phoneHint, isPaymentPhoneInvalid && styles.phoneHintInvalid]}>
      {isPaymentPhoneInvalid
        ? 'Entrez un numero congolais valide commencant par +243.'
        : selectedMode === 'points'
          ? 'Ce numero servira seulement si un complement est necessaire.'
          : selectedChannel === 'card'
            ? 'Aucun numero requis pour le paiement par carte.'
            : `Demande envoyee via ${getPaymentChannelLabel(selectedChannel)}.`}
    </Text>
                  </View>
                )}

                {hasCardPaymentToResume && (
                  <TouchableOpacity
    activeOpacity={0.88}
    disabled={isBusy}
    onPress={() => void handleResumeCardPayment()}
    style={styles.resumePaymentButton}
                  >
    <Ionicons name="open-outline" size={18} color={Colors.primary} />
    <Text style={styles.resumePaymentText}>Rouvrir la page carte</Text>
                  </TouchableOpacity>
                )}

                {statusMessage ? (
                  <View style={styles.statusBox}>
    <ActivityIndicator size="small" color={Colors.infoDark} />
    <Text style={styles.statusText}>{statusMessage}</Text>
                  </View>
                ) : null}
                {paymentError ? (
                  <View style={styles.errorBox}>
    <Ionicons name="alert-circle" size={20} color={Colors.dangerDark} />
    <Text style={styles.errorText}>{paymentError}</Text>
                  </View>
                ) : null}
              </ScrollView>
  );
}
