import { getLocationText, getLocationCoordinatesObject } from '../../features/trip-detail/tripDetailModel';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import { useCancelBookingMutation, useCreateBookingMutation } from '@/store/api/bookingApi';
import { useGetKycStatusQuery } from '@/store/api/userApi';
import type { Booking, TripPaymentMode } from '@/types';
import { getApiErrorMessage, isPassengerKycRequiredError, isExtraSeatsIdentityError } from '@/utils/errorHelpers';
import { getPassengerSeatValidation } from '@/utils/passengerSeats';
import { isPointOnRoute } from '@/utils/routeHelpers';
import { isCoordinateInKinshasaBounds, normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import React from 'react';
import type { Trip } from '@/types';

interface Params {
  isBooking: boolean;
  trip: Trip | undefined;
  isValidatingDestination: boolean;
  bookingSeats: string;
  isIdentityVerified: boolean;
  seatLimit: number;
  setBookingModalError: React.Dispatch<React.SetStateAction<string>>;
  setBookingStep: React.Dispatch<React.SetStateAction<1 | 2 | 3>>;
  passengerOriginManualAddress: string;
  passengerDestinationManualAddress: string;
  passengerOrigin: MapLocationSelection | null;
  passengerDestination: MapLocationSelection | null;
  setIsValidatingDestination: React.Dispatch<React.SetStateAction<boolean>>;
  resolveManualAddressSelection: (address: string, label: string) => Promise<MapLocationSelection | null>;
  setPassengerOrigin: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setPassengerDestination: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  routeCoordinates: { latitude: number; longitude: number; }[] | null;
  createBooking: ReturnType<typeof useCreateBookingMutation>[0];
  estimatedTotal: number;
  bookingPaymentMode: TripPaymentMode;
  setBookingModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setPassengerOriginManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setPassengerDestinationManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setShouldAutofillPassengerOrigin: React.Dispatch<React.SetStateAction<boolean>>;
  openBookingSuccessModal: (seats: number) => void;
  refreshBookingLists: () => void;
  refetchKycStatus: ReturnType<typeof useGetKycStatusQuery>['refetch'];
  openPassengerIdentityVerification: (source?: "extra_seats" | "book" | "request") => void;
  activeBooking: Booking | null;
  cancelBookingMutation: ReturnType<typeof useCancelBookingMutation>[0];
  showDialog: ReturnType<typeof useDialog>['showDialog'];
}

export function useTripBookingSubmission({
  isBooking,
  trip,
  isValidatingDestination,
  bookingSeats,
  isIdentityVerified,
  seatLimit,
  setBookingModalError,
  setBookingStep,
  passengerOriginManualAddress,
  passengerDestinationManualAddress,
  passengerOrigin,
  passengerDestination,
  setIsValidatingDestination,
  resolveManualAddressSelection,
  setPassengerOrigin,
  setPassengerDestination,
  routeCoordinates,
  createBooking,
  estimatedTotal,
  bookingPaymentMode,
  setBookingModalVisible,
  setPassengerOriginManualAddress,
  setPassengerDestinationManualAddress,
  setShouldAutofillPassengerOrigin,
  openBookingSuccessModal,
  refreshBookingLists,
  refetchKycStatus,
  openPassengerIdentityVerification,
  activeBooking,
  cancelBookingMutation,
  showDialog,
}: Params) {
  const handleConfirmBooking = async () => {
    if (isBooking || !trip || isValidatingDestination) {
      return;
    }
    const seatsValue = parseInt(bookingSeats, 10);
    const seatError = getPassengerSeatValidation(seatsValue, isIdentityVerified, seatLimit);
    if (seatError) {
      setBookingModalError(seatError.message);
      setBookingStep(1);
      return;
    }
    if (Number.isNaN(seatsValue) || seatsValue <= 0) {
      setBookingModalError('Veuillez indiquer un nombre de places valide.');
      return;
    }
    // Vérifier si le nombre de places dépasse les places disponibles
    if (seatsValue > seatLimit) {
      setBookingModalError(
        `Il reste seulement ${seatLimit} place${seatLimit > 1 ? 's' : ''} pour ce trajet.`,
      );
      return;
    }

    setBookingModalError('');

    const manualPassengerOrigin = passengerOriginManualAddress.trim();
    const manualPassengerDestination = passengerDestinationManualAddress.trim();
    let resolvedPassengerOrigin = passengerOrigin;
    let resolvedPassengerDestination = passengerDestination;
    const shouldResolveManualPassengerPoints = Boolean(
      manualPassengerOrigin || manualPassengerDestination,
    );

    if (shouldResolveManualPassengerPoints) {
      setIsValidatingDestination(true);
    }

    if (manualPassengerOrigin) {
      const selection = await resolveManualAddressSelection(manualPassengerOrigin, 'passenger origin');
      if (!selection) {
        setIsValidatingDestination(false);
        setBookingModalError(
          'Impossible de localiser ce point de départ. Vérifiez le texte ou choisissez-le sur la carte.',
        );
        return;
      }
      resolvedPassengerOrigin = selection;
      setPassengerOrigin(selection);
    }

    if (manualPassengerDestination) {
      const selection = await resolveManualAddressSelection(
        manualPassengerDestination,
        'passenger destination',
      );
      if (!selection) {
        setIsValidatingDestination(false);
        setBookingModalError(
          "Impossible de localiser ce point d'arrivée. Vérifiez le texte ou choisissez-le sur la carte.",
        );
        return;
      }
      resolvedPassengerDestination = selection;
      setPassengerDestination(selection);
    }

    if (shouldResolveManualPassengerPoints) {
      setIsValidatingDestination(false);
    }

    const tripDepartureCoordinate = normalizeTripMapCoordinate(
      trip.departure?.lat,
      trip.departure?.lng,
    );
    const tripArrivalCoordinate = normalizeTripMapCoordinate(trip.arrival?.lat, trip.arrival?.lng);
    const isTripInsideKinshasa = Boolean(
      tripDepartureCoordinate &&
        tripArrivalCoordinate &&
        isCoordinateInKinshasaBounds(tripDepartureCoordinate) &&
        isCoordinateInKinshasaBounds(tripArrivalCoordinate),
    );

    if (
      isTripInsideKinshasa &&
      resolvedPassengerOrigin &&
      !isCoordinateInKinshasaBounds(resolvedPassengerOrigin)
    ) {
      setBookingModalError(
        'Le point de prise en charge detecté est hors Kinshasa. Choisissez-le sur la carte ou precisez la commune.',
      );
      return;
    }

    if (
      isTripInsideKinshasa &&
      resolvedPassengerDestination &&
      !isCoordinateInKinshasaBounds(resolvedPassengerDestination)
    ) {
      setBookingModalError(
        "La destination detectée est hors Kinshasa. Choisissez-la sur la carte ou precisez la commune.",
      );
      return;
    }

    const passengerOriginText = getLocationText(resolvedPassengerOrigin, manualPassengerOrigin);
    const passengerDestinationText = getLocationText(
      resolvedPassengerDestination,
      manualPassengerDestination,
    );
    const hasTripArrivalCoordinates = Boolean(tripArrivalCoordinate);
    const isDefaultTripArrivalDestination = Boolean(
      resolvedPassengerDestination &&
      hasTripArrivalCoordinates &&
      tripArrivalCoordinate &&
      Math.abs(resolvedPassengerDestination.latitude - tripArrivalCoordinate.latitude) < 0.000001 &&
      Math.abs(resolvedPassengerDestination.longitude - tripArrivalCoordinate.longitude) < 0.000001,
    );
    const hasCustomPassengerDestination = Boolean(
      (manualPassengerDestination || resolvedPassengerDestination) && !isDefaultTripArrivalDestination,
    );

    // Valider la destination seulement si le passager a choisi une destination personnalisée
    if (
      hasCustomPassengerDestination &&
      resolvedPassengerDestination &&
      routeCoordinates &&
      routeCoordinates.length >= 2
    ) {
      setIsValidatingDestination(true);
      setBookingModalError('');

      try {
        const destinationPoint = {
          latitude: resolvedPassengerDestination.latitude,
          longitude: resolvedPassengerDestination.longitude,
        };

        const isOnRoute = isPointOnRoute(destinationPoint, routeCoordinates, 5); // 5km de tolérance

        if (!isOnRoute) {
          setBookingModalError(
            'La destination sélectionnée n\'est pas sur le trajet. Veuillez choisir une destination située sur l\'itinéraire.',
          );
          setIsValidatingDestination(false);
          return;
        }
      } catch (error) {
        console.warn('Error validating destination:', error);
        setBookingModalError('Erreur lors de la validation de la destination. Veuillez réessayer.');
        setIsValidatingDestination(false);
        return;
      }

      setIsValidatingDestination(false);
    }

    try {
      const booking = await createBooking({
        tripId: trip.id,
        numberOfSeats: seatsValue,
        passengerOrigin: passengerOriginText || undefined,
        passengerOriginCoordinates: getLocationCoordinatesObject(resolvedPassengerOrigin),
        passengerDestination: hasCustomPassengerDestination
          ? passengerDestinationText || undefined
          : undefined,
        passengerDestinationCoordinates: hasCustomPassengerDestination
          ? getLocationCoordinatesObject(resolvedPassengerDestination)
          : undefined,
        paymentMode: estimatedTotal > 0 ? bookingPaymentMode : undefined,
      }).unwrap();
      void trackEvent('booking_created', {
        trip_id: trip.id,
        booking_id: booking.id,
        seats: seatsValue,
        has_custom_destination: hasCustomPassengerDestination,
        has_custom_origin: Boolean(passengerOriginText || resolvedPassengerOrigin),
        payment_mode: estimatedTotal > 0 ? bookingPaymentMode : null,
      });
      setBookingModalVisible(false);
      setBookingModalError('');
      setPassengerOrigin(null);
      setPassengerOriginManualAddress('');
      setPassengerDestination(null);
      setPassengerDestinationManualAddress('');
      setShouldAutofillPassengerOrigin(false);
      setBookingStep(1);
      openBookingSuccessModal(seatsValue);
      refreshBookingLists();
    } catch (error: any) {
      if (isPassengerKycRequiredError(error)) {
        void refetchKycStatus();
        setBookingModalError(getApiErrorMessage(error, 'Vérifiez votre identité avant de continuer.'));
        openPassengerIdentityVerification(isExtraSeatsIdentityError(error) ? 'extra_seats' : 'book');
        return;
      }

      setBookingModalError(
        getApiErrorMessage(error, 'Impossible de créer la réservation pour le moment.'),
      );
    }
  };

  const handleCancelBooking = async () => {
    if (!activeBooking) {
      return;
    }
    try {
      await cancelBookingMutation(activeBooking.id).unwrap();
      void trackEvent('booking_cancelled', {
        booking_id: activeBooking.id,
        trip_id: activeBooking.tripId,
        source_screen: 'trip_details',
      });
      showDialog({
        variant: 'success',
        title: 'Réservation annulée',
        message: 'Votre réservation a été annulée avec succès.',
      });
      refreshBookingLists();
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(error, 'Impossible d’annuler la réservation pour le moment.'),
      });
    }
  };

  const confirmCancelBooking = () => {
    if (!activeBooking) {
      return;
    }
    showDialog({
      variant: 'warning',
      title: 'Annuler la réservation',
      message: 'Souhaitez-vous vraiment annuler cette réservation ?',
      actions: [
        { label: 'Garder', variant: 'ghost' },
        { label: 'Oui, annuler', variant: 'primary', onPress: () => handleCancelBooking() },
      ],
    });
  };

  return {
    confirmCancelBooking,
    handleConfirmBooking,
  };
}
