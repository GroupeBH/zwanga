import { TripBookingSteps } from './TripBookingSteps';
import { BookingPaymentChoices } from './BookingPaymentChoices';
import { compactBookingStyles as s } from './compactBookingStyles';
import { styles } from '../screen-styles/app/trip/detail/index';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { FormModal } from '@/components/forms/FormLayout';
import { Colors } from '@/constants/styles';
import type { Trip, TripPaymentMode } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { BookingLocationLabels } from './bookingLocationLabels';
import type { TripBookingReferences } from '@/hooks/trip-detail/useTripBookingReferences';

interface TripBookingModalProps {
  bookingReferences?: TripBookingReferences;
  bookingLocationLabels?: BookingLocationLabels;
  bookingModalVisible: boolean;
  insets: EdgeInsets;
  bookingStep: 2 | 1 | 3;
  viewportHeight: number;
  adjustBookingSeats: (delta: number) => void;
  isBooking: boolean;
  bookingSeats: string;
  bookingProposedPrice?: string;
  setBookingProposedPrice?: (value: string) => void;
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
  bookingModalError: string;
  closeBookingModal: () => void;
  goToPreviousBookingStep: () => void;
  goToNextBookingStep: () => void;
  handleConfirmBooking: () => Promise<void>;
}

export function TripBookingModal({
  bookingReferences,
  bookingLocationLabels,
  bookingModalVisible,
  insets,
  bookingStep,
  viewportHeight,
  adjustBookingSeats,
  isBooking,
  bookingSeats,
  bookingProposedPrice = '',
  setBookingProposedPrice,
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
  bookingModalError,
  closeBookingModal,
  handleConfirmBooking,
}: TripBookingModalProps) {
  const [confirming, setConfirming] = useState(false);
  const { fontScale } = useWindowDimensions();
  const confirmingRef = useRef(false);
  const busy = confirming || isBooking || isValidatingDestination;
  const compact = fontScale > 1.3 || viewportHeight < 650;
  const payment = <BookingPaymentChoices trip={trip} seats={bookingSeats} total={estimatedTotal} value={bookingPaymentMode}
    onChange={setBookingPaymentMode} busy={busy} visible={bookingModalVisible} />;
  const total = <View style={[s.totalRow, fontScale > 1.3 && s.totalStack]}>
    <View style={s.copy}><Text style={s.value}>{bookingProposedPrice.trim() ? 'Total proposé' : 'Total'}</Text>
      <Text style={s.hint}>{bookingSeats || '0'} place{Number(bookingSeats) > 1 ? 's' : ''}</Text></View>
    <Text style={s.price}>{estimatedTotal === 0 ? 'Gratuit' : `${estimatedTotal.toLocaleString('fr-FR')} FC`}</Text>
  </View>;
  const footnote = <Text style={s.footnote}>{bookingProposedPrice.trim()
    ? 'Le conducteur doit accepter votre prix. Aucun paiement maintenant.'
    : 'Le conducteur recevra votre réservation. Aucun paiement maintenant.'}</Text>;
  const close = () => { if (!busy && !confirmingRef.current) closeBookingModal(); };
  const confirm = async () => {
    if (busy || confirmingRef.current) return;
    confirmingRef.current = true; setConfirming(true);
    try { await handleConfirmBooking(); }
    finally { confirmingRef.current = false; setConfirming(false); }
  };
  return (
    <FormModal animationType="fade" transparent visible={bookingModalVisible} onRequestClose={close}>
      <KeyboardAvoidingView style={styles.bookingModalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.card, { paddingBottom: Math.max(insets.bottom, 16), maxHeight: '95%', flexShrink: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={s.title}>Réserver ce trajet</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer la réservation"
              disabled={busy} onPress={close} style={s.close}>
              <Ionicons name="close" size={24} color={Colors.gray[700]} />
            </TouchableOpacity>
          </View>

          {!compact && payment}

          <TripBookingSteps
            bookingReferences={bookingReferences}
            bookingLocationLabels={bookingLocationLabels}
            header={compact ? payment : undefined}
            footer={compact ? <>{total}{footnote}</> : undefined}
            viewportHeight={viewportHeight}
            bookingStep={bookingStep}
            adjustBookingSeats={adjustBookingSeats}
            isBooking={busy}
            bookingSeats={bookingSeats}
            bookingProposedPrice={bookingProposedPrice}
            setBookingProposedPrice={setBookingProposedPrice}
            handleBookingSeatsChange={handleBookingSeatsChange}
            seatLimit={seatLimit}
            isIdentityVerified={isIdentityVerified}
            openPassengerIdentityVerification={openPassengerIdentityVerification}
            estimatedTotal={estimatedTotal}
            bookingPaymentMode={bookingPaymentMode}
            setBookingPaymentMode={setBookingPaymentMode}
            openBookingLocationPicker={openBookingLocationPicker}
            passengerOriginDisplay={passengerOriginDisplay}
            passengerOriginManualAddress={passengerOriginManualAddress}
            setPassengerOriginManualAddress={setPassengerOriginManualAddress}
            setShouldAutofillPassengerOrigin={setShouldAutofillPassengerOrigin}
            setPassengerOrigin={setPassengerOrigin}
            isValidatingDestination={isValidatingDestination}
            passengerDestinationDisplay={passengerDestinationDisplay}
            passengerDestinationManualAddress={passengerDestinationManualAddress}
            setPassengerDestinationManualAddress={setPassengerDestinationManualAddress}
            setPassengerDestination={setPassengerDestination}
            trip={trip}
          />

          {bookingModalError ? (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
              style={styles.bookingModalError}>{bookingModalError}</Text>
          ) : null}

          {!compact && total}
          <View>
            <TouchableOpacity accessibilityRole="button"
              style={[s.button, busy && { opacity: 0.6 }]}
              onPress={() => { void confirm(); }} disabled={busy} accessibilityState={{ disabled: busy, busy }}>
              {busy ? <ActivityIndicator color={Colors.white} />
                : <Text style={s.buttonText}>
                    {bookingProposedPrice.trim() ? 'Envoyer mon prix' : 'Confirmer la réservation'}
                  </Text>}
            </TouchableOpacity>
          </View>
          {!compact && footnote}
        </View>
      </KeyboardAvoidingView>
    </FormModal>
  );
}
