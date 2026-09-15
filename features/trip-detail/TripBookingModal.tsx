import { TripBookingSteps } from './TripBookingSteps';
import { styles } from '../screen-styles/app/trip/detail/index';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { FormModal } from '@/components/forms/FormLayout';
import { Colors } from '@/constants/styles';
import type { TripPaymentMode } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import type { Trip } from '@/types';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface TripBookingModalProps {
  bookingModalVisible: boolean;
  insets: EdgeInsets;
  bookingStep: 2 | 1 | 3;
  viewportHeight: number;
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
  bookingModalError: string;
  closeBookingModal: () => void;
  goToPreviousBookingStep: () => void;
  goToNextBookingStep: () => void;
  handleConfirmBooking: () => Promise<void>;
}

export function TripBookingModal({
  bookingModalVisible,
  insets,
  bookingStep,
  viewportHeight,
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
  bookingModalError,
  closeBookingModal,
  goToPreviousBookingStep,
  goToNextBookingStep,
  handleConfirmBooking,
}: TripBookingModalProps) {
  return (
    <FormModal animationType="fade" transparent visible={bookingModalVisible}>
      <View style={styles.bookingModalOverlay}>
        <View style={[styles.bookingModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
          {/* Step Indicator */}
          <View style={styles.bookingStepIndicator}>
            <View style={[styles.bookingStepDot, bookingStep >= 1 && styles.bookingStepDotActive]} />
            <View style={[styles.bookingStepLine, bookingStep >= 2 && styles.bookingStepLineActive]} />
            <View style={[styles.bookingStepDot, bookingStep >= 2 && styles.bookingStepDotActive]} />
            <View style={[styles.bookingStepLine, bookingStep >= 3 && styles.bookingStepLineActive]} />
            <View style={[styles.bookingStepDot, bookingStep >= 3 && styles.bookingStepDotActive]} />
          </View>

          <TripBookingSteps
            viewportHeight={viewportHeight}
            bookingStep={bookingStep}
            adjustBookingSeats={adjustBookingSeats}
            isBooking={isBooking}
            bookingSeats={bookingSeats}
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
            <Text style={styles.bookingModalError}>{bookingModalError}</Text>
          ) : null}

          <View style={styles.bookingModalActions}>
            {bookingStep === 1 ? (
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonSecondary]}
                onPress={closeBookingModal}
                disabled={isBooking}
              >
                <Text style={styles.bookingModalButtonSecondaryText}>Annuler</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonSecondary]}
                onPress={goToPreviousBookingStep}
                disabled={isBooking}
              >
                <Ionicons name="arrow-back" size={18} color={Colors.gray[700]} style={{ marginRight: 4 }} />
                <Text style={styles.bookingModalButtonSecondaryText}>Retour</Text>
              </TouchableOpacity>
            )}

            {bookingStep < 3 ? (
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonPrimary]}
                onPress={goToNextBookingStep}
                disabled={isBooking}
              >
                <Text style={styles.bookingModalButtonPrimaryText}>Suivant</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.white} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonPrimary]}
                onPress={handleConfirmBooking}
                disabled={isBooking || isValidatingDestination}
              >
                {isBooking || isValidatingDestination ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.bookingModalButtonPrimaryText}>Confirmer</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          </View>
        </View>
    </FormModal>
  );
}
