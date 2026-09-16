import { LOCATION_PICKER_OPEN_DELAY_MS } from '../../features/trip-detail/tripDetailModel';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { getPassengerSeatValidation } from '@/utils/passengerSeats';
import React, { useEffect } from 'react';
import { Keyboard } from 'react-native';
import type { Router } from 'expo-router';

interface Params {
  isBooking: boolean;
  setBookingModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setBookingStep: React.Dispatch<React.SetStateAction<1 | 2 | 3>>;
  setShouldAutofillPassengerOrigin: React.Dispatch<React.SetStateAction<boolean>>;
  setPassengerOriginManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setPassengerDestinationManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setShowOriginPicker: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDestinationPicker: React.Dispatch<React.SetStateAction<boolean>>;
  bookingModalVisible: boolean;
  shouldAutofillPassengerOrigin: boolean;
  passengerOrigin: MapLocationSelection | null;
  defaultPassengerOriginSelection: MapLocationSelection | null;
  setPassengerOrigin: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  bookingStep: 1 | 2 | 3;
  bookingSeats: string;
  setBookingModalError: React.Dispatch<React.SetStateAction<string>>;
  seatLimit: number;
  isIdentityVerified: boolean;
  setBookingSuccess: React.Dispatch<React.SetStateAction<{ visible: boolean; seats: number; }>>;
  router: Router;
}

export function useTripBookingWizard({
  isBooking,
  setBookingModalVisible,
  setBookingStep,
  setShouldAutofillPassengerOrigin,
  setPassengerOriginManualAddress,
  setPassengerDestinationManualAddress,
  setShowOriginPicker,
  setShowDestinationPicker,
  bookingModalVisible,
  shouldAutofillPassengerOrigin,
  passengerOrigin,
  defaultPassengerOriginSelection,
  setPassengerOrigin,
  bookingStep,
  bookingSeats,
  setBookingModalError,
  seatLimit,
  isIdentityVerified,
  setBookingSuccess,
  router,
}: Params) {
  const closeBookingModal = () => {
    if (isBooking) {
      return;
    }
    setBookingModalVisible(false);
    setBookingStep(1);
    setShouldAutofillPassengerOrigin(false);
    setPassengerOriginManualAddress('');
    setPassengerDestinationManualAddress('');
  };

  const openBookingLocationPicker = (target: 'origin' | 'destination') => {
    Keyboard.dismiss();
    setBookingModalVisible(false);
    setTimeout(() => {
      if (target === 'origin') {
        setShowOriginPicker(true);
      } else {
        setShowDestinationPicker(true);
      }
    }, LOCATION_PICKER_OPEN_DELAY_MS);
  };

  const restoreBookingModalAfterLocationPicker = () => {
    setShowOriginPicker(false);
    setShowDestinationPicker(false);
    setTimeout(() => {
      setBookingModalVisible(true);
    }, LOCATION_PICKER_OPEN_DELAY_MS);
  };

  useEffect(() => {
    if (
      !bookingModalVisible ||
      !shouldAutofillPassengerOrigin ||
      passengerOrigin ||
      !defaultPassengerOriginSelection
    ) {
      return;
    }
    setPassengerOrigin(defaultPassengerOriginSelection);
    setShouldAutofillPassengerOrigin(false);
  }, [
    bookingModalVisible,
    shouldAutofillPassengerOrigin,
    passengerOrigin,
    defaultPassengerOriginSelection,
  ]);

  const goToNextBookingStep = () => {
    if (bookingStep === 1) {
      // Valider le nombre de places avant de continuer
      const seatsValue = parseInt(bookingSeats, 10);
      if (isNaN(seatsValue) || seatsValue < 1) {
        setBookingModalError('Veuillez entrer un nombre de places valide');
        return;
      }
      if (seatsValue > seatLimit) {
        setBookingModalError(`Maximum ${seatLimit} place(s) disponible(s)`);
        return;
      }
      const seatError = getPassengerSeatValidation(seatsValue, isIdentityVerified, seatLimit);
      if (seatError) {
        setBookingModalError(seatError.message);
        return;
      }
      setBookingModalError('');
      setBookingStep(2);
    } else if (bookingStep === 2) {
      setBookingModalError('');
      setBookingStep(3);
    }
  };

  const goToPreviousBookingStep = () => {
    if (bookingStep === 2) {
      setBookingStep(1);
    } else if (bookingStep === 3) {
      setBookingStep(2);
    }
  };

  const openBookingSuccessModal = (seats: number) => {
    setBookingSuccess({ visible: true, seats });
  };

  const closeBookingSuccessModal = () => {
    if (isBooking) {
      return;
    }
    setBookingSuccess({ visible: false, seats: 0 });
  };

  const handleViewBookings = () => {
    closeBookingSuccessModal();
    router.push('/bookings');
  };

  return {
    openBookingSuccessModal,
    openBookingLocationPicker,
    closeBookingModal,
    goToPreviousBookingStep,
    goToNextBookingStep,
    restoreBookingModalAfterLocationPicker,
    closeBookingSuccessModal,
    handleViewBookings,
  };
}
