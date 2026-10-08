import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { getPassengerSeatValidation } from '@/utils/passengerSeats';
import React, { useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useAppIsActive } from '@/hooks/useAppIsActive';
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
  const focused = useIsFocused();
  const foreground = useAppIsActive();
  const leaving = useRef(false);
  const active = useRef(focused && foreground);
  active.current = focused && foreground;
  useEffect(() => { if (focused) leaving.current = false; }, [focused]);
  useEffect(() => () => { active.current = false; }, []);

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
    if (!active.current || isBooking) return;
    Keyboard.dismiss();
    setBookingModalVisible(false);
    // Both panels share the route overlay: no UIKit dismissal timer is needed.
    setShowOriginPicker(target === 'origin');
    setShowDestinationPicker(target === 'destination');
  };

  const restoreBookingModalAfterLocationPicker = () => {
    setShowOriginPicker(false);
    setShowDestinationPicker(false);
    if (active.current) setBookingModalVisible(true);
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
    setPassengerOrigin,
    setShouldAutofillPassengerOrigin,
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
    if (!active.current || isBooking || leaving.current) return;
    leaving.current = true; // Ignore a second tap even if the closing panel rerenders.
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
