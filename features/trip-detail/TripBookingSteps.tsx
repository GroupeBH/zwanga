import { TRIP_PAYMENT_MODE_OPTIONS, getTripPaymentModeLabel, getTripPaymentSelectionIcon } from './tripDetailModel';
import { styles } from '../screen-styles/app/trip/detail/index';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { Colors } from '@/constants/styles';
import type { TripPaymentMode } from '@/types';
import { PassengerSeatNotice } from '@/components/PassengerSeatNotice';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Trip } from '@/types';

interface TripBookingStepsProps {
  viewportHeight: number;
  bookingStep: 1 | 2 | 3;
  adjustBookingSeats: (delta: number) => void;
  isBooking: boolean;
  bookingSeats: string;
  handleBookingSeatsChange: (value: string) => void;
  seatLimit: number;
  isIdentityVerified: boolean;
  openPassengerIdentityVerification: (source?: "extra_seats" | "book" | "request") => void;
  estimatedTotal: number;
  bookingPaymentMode: TripPaymentMode;
  setBookingPaymentMode: React.Dispatch<React.SetStateAction<TripPaymentMode>>;
  openBookingLocationPicker: (target: "origin" | "destination") => void;
  passengerOriginDisplay: string;
  passengerOriginManualAddress: string;
  setPassengerOriginManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setShouldAutofillPassengerOrigin: React.Dispatch<React.SetStateAction<boolean>>;
  setPassengerOrigin: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  isValidatingDestination: boolean;
  passengerDestinationDisplay: string;
  passengerDestinationManualAddress: string;
  setPassengerDestinationManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setPassengerDestination: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  trip: Trip | undefined;
}

export function TripBookingSteps({
  viewportHeight,
  bookingStep,
  adjustBookingSeats,
  isBooking,
  bookingSeats,
  handleBookingSeatsChange,
  seatLimit,
  isIdentityVerified,
  openPassengerIdentityVerification,
  estimatedTotal,
  bookingPaymentMode,
  setBookingPaymentMode,
  openBookingLocationPicker,
  passengerOriginDisplay,
  passengerOriginManualAddress,
  setPassengerOriginManualAddress,
  setShouldAutofillPassengerOrigin,
  setPassengerOrigin,
  isValidatingDestination,
  passengerDestinationDisplay,
  passengerDestinationManualAddress,
  setPassengerDestinationManualAddress,
  setPassengerDestination,
  trip,
}: TripBookingStepsProps) {
  return (
    <ScrollView
      style={[
        styles.bookingStepContent,
        { maxHeight: Math.min(560, Math.max(360, viewportHeight * 0.62)) },
      ]}
      contentContainerStyle={styles.bookingStepContentInner}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
    {/* Step 1: Nombre de places */}
    {bookingStep === 1 && (
      <>
        <Text style={styles.bookingModalTitle}>Nombre de places</Text>
        <Text style={styles.bookingModalDescription}>
          Combien de places souhaitez-vous réserver ?
        </Text>

        <View style={styles.bookingSeatRow}>
          <TouchableOpacity
            style={styles.bookingSeatButton}
            onPress={() => adjustBookingSeats(-1)}
            disabled={isBooking || Number(bookingSeats) <= 1}
          >
            <Ionicons name="remove" size={18} color={Colors.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.bookingSeatInput}
            keyboardType="numeric"
            placeholder="1"
            placeholderTextColor={Colors.gray[400]}
            value={bookingSeats}
            onChangeText={handleBookingSeatsChange}
            editable={!isBooking}
            maxLength={String(Math.max(1, seatLimit)).length}
          />
          <TouchableOpacity
            style={styles.bookingSeatButton}
            onPress={() => adjustBookingSeats(1)}
            disabled={isBooking || Number(bookingSeats) >= seatLimit}
          >
            <Ionicons name="add" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.bookingModalHint}>
          {seatLimit} place{seatLimit > 1 ? 's' : ''} disponible{seatLimit > 1 ? 's' : ''}
        </Text>
        <PassengerSeatNotice
          isIdentityVerified={isIdentityVerified}
          capacity={seatLimit}
          onVerify={() => openPassengerIdentityVerification()}
        />

        <Text style={styles.bookingModalPrice}>
          Total estimé :{' '}
          <Text style={styles.bookingModalPriceValue}>
            {estimatedTotal === 0 ? 'Gratuit' : `${estimatedTotal} FC`}
          </Text>
        </Text>

        {estimatedTotal > 0 ? (
          <View style={styles.bookingPaymentSection}>
            <Text style={styles.bookingPaymentTitle}>Mode de paiement</Text>
            {TRIP_PAYMENT_MODE_OPTIONS.map((option) => {
              const selected = bookingPaymentMode === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.bookingPaymentOption,
                    selected && styles.bookingPaymentOptionSelected,
                  ]}
                  onPress={() => setBookingPaymentMode(option.id)}
                  disabled={isBooking}
                >
                  <Ionicons
                    name={option.icon}
                    size={20}
                    color={selected ? Colors.primary : Colors.gray[500]}
                  />
                  <View style={styles.bookingPaymentCopy}>
                    <Text style={styles.bookingPaymentOptionTitle}>{option.label}</Text>
                    <Text style={styles.bookingPaymentOptionText}>{option.description}</Text>
                  </View>
                  <Ionicons
                    name={getTripPaymentSelectionIcon(option, selected)}
                    size={20}
                    color={selected ? Colors.primary : Colors.gray[300]}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </>
    )}

    {/* Step 2: Points du trajet */}
    {bookingStep === 2 && (
      <>
        <Text style={styles.bookingModalTitle}>Où monter et descendre ?</Text>
        <Text style={styles.bookingModalDescription}>
          Touchez un point pour le modifier.
        </Text>

        <View style={styles.bookingRouteCard}>
          <TouchableOpacity
            style={styles.bookingRoutePoint}
            onPress={() => openBookingLocationPicker('origin')}
            disabled={isBooking}
            activeOpacity={0.88}
          >
            <View style={[styles.bookingPointIcon, styles.bookingPointIconDeparture]}>
              <Ionicons name="location" size={20} color={Colors.white} />
            </View>
            <View style={styles.bookingRouteCopy}>
              <Text style={[styles.bookingDestinationButtonLabel, styles.bookingDestinationButtonLabelDeparture]}>
                Départ / prise en charge
              </Text>
              <Text style={styles.bookingRouteValue} numberOfLines={1}>
                {passengerOriginDisplay || 'Choisir le point de départ'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
          </TouchableOpacity>
          <View style={styles.bookingManualInputWrap}>
            <Text style={styles.bookingManualInputLabel}>Saisie manuelle</Text>
            <TextInput
              style={styles.bookingManualInput}
              value={passengerOriginManualAddress}
              onChangeText={(value) => {
                setPassengerOriginManualAddress(value);
                setShouldAutofillPassengerOrigin(false);
                if (value.trim()) {
                  setPassengerOrigin(null);
                }
              }}
              placeholder="Ex: station Kintambo Magasin"
              placeholderTextColor={Colors.gray[400]}
              returnKeyType="next"
              editable={!isBooking}
            />
          </View>

          <View style={styles.bookingRouteDivider} />

          <TouchableOpacity
            style={styles.bookingRoutePoint}
            onPress={() => openBookingLocationPicker('destination')}
            disabled={isBooking || isValidatingDestination}
            activeOpacity={0.88}
          >
            <View style={[styles.bookingPointIcon, styles.bookingPointIconArrival]}>
              <Ionicons name="flag" size={19} color={Colors.white} />
            </View>
            <View style={styles.bookingRouteCopy}>
              <Text style={[styles.bookingDestinationButtonLabel, styles.bookingDestinationButtonLabelArrival]}>
                Arrivée / destination
              </Text>
              <Text style={styles.bookingRouteValue} numberOfLines={1}>
                {passengerDestinationDisplay || "Choisir le point d'arrivée"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
          </TouchableOpacity>
          <View style={styles.bookingManualInputWrap}>
            <Text style={styles.bookingManualInputLabel}>Saisie manuelle</Text>
            <TextInput
              style={styles.bookingManualInput}
              value={passengerDestinationManualAddress}
              onChangeText={(value) => {
                setPassengerDestinationManualAddress(value);
                if (value.trim()) {
                  setPassengerDestination(null);
                }
              }}
              placeholder="Ex: rond-point Victoire"
              placeholderTextColor={Colors.gray[400]}
              returnKeyType="done"
              editable={!isBooking && !isValidatingDestination}
            />
          </View>
        </View>
      </>
    )}

    {/* Step 3: Preview */}
    {bookingStep === 3 && (
      <>
        <Text style={styles.bookingModalTitle}>Prévisualisation</Text>
        <Text style={styles.bookingModalDescription}>
          Vérifiez les informations avant d&apos;envoyer votre demande au conducteur.
        </Text>

        <View style={styles.bookingPreviewHero}>
          <View style={styles.bookingPreviewIcon}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.white} />
          </View>
          <View style={styles.bookingPreviewCopy}>
            <Text style={styles.bookingPreviewTitle}>Vérifiez votre réservation</Text>
            <Text style={styles.bookingPreviewText}>
              Le conducteur recevra ces informations pour accepter votre place.
            </Text>
          </View>
        </View>

        {/* Récapitulatif */}
        <View style={styles.bookingSummary}>
          <Text style={styles.bookingSummaryTitle}>Récapitulatif</Text>
          <View style={styles.bookingSummaryRow}>
            <Ionicons name="people" size={16} color={Colors.gray[600]} />
            <Text style={styles.bookingSummaryText}>{bookingSeats} place{parseInt(bookingSeats) > 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.bookingSummaryPointRow}>
            <View style={[styles.bookingSummaryPointIcon, styles.bookingSummaryPointIconDeparture]}>
              <Ionicons name="location" size={15} color={Colors.white} />
            </View>
            <View style={styles.bookingSummaryPointCopy}>
              <Text style={[styles.bookingSummaryPointLabel, styles.bookingSummaryPointLabelDeparture]}>
                D&eacute;part / prise en charge
              </Text>
              <Text style={styles.bookingSummaryText} numberOfLines={1}>
                {passengerOriginDisplay || trip?.departure?.address}
              </Text>
            </View>
          </View>
          <View style={styles.bookingSummaryPointRow}>
            <View style={[styles.bookingSummaryPointIcon, styles.bookingSummaryPointIconArrival]}>
              <Ionicons name="flag" size={14} color={Colors.white} />
            </View>
            <View style={styles.bookingSummaryPointCopy}>
              <Text style={[styles.bookingSummaryPointLabel, styles.bookingSummaryPointLabelArrival]}>
                Arriv&eacute;e / destination
              </Text>
              <Text style={styles.bookingSummaryText} numberOfLines={1}>
                {passengerDestinationDisplay || trip?.arrival?.address}
              </Text>
            </View>
          </View>
          <View style={styles.bookingSummaryRow}>
            <Ionicons name="cash" size={16} color={Colors.success} />
            <Text style={styles.bookingSummaryText}>
              {estimatedTotal === 0 ? 'Gratuit' : `${estimatedTotal} FC`}
            </Text>
          </View>
          {estimatedTotal > 0 ? (
            <View style={styles.bookingSummaryRow}>
              <Ionicons name="card-outline" size={16} color={Colors.primary} />
              <Text style={styles.bookingSummaryText}>
                {getTripPaymentModeLabel(bookingPaymentMode)}
              </Text>
            </View>
          ) : null}
          {trip?.requiresPassengerKyc ? (
            <View style={styles.bookingSummaryKycRow}>
              <Ionicons name="shield-checkmark-outline" size={16} color={Colors.primary} />
              <Text style={styles.bookingSummaryKycText}>
                Vérification d&apos;identité passager requise
              </Text>
            </View>
          ) : null}
        </View>
      </>
    )}

    </ScrollView>
  );
}
