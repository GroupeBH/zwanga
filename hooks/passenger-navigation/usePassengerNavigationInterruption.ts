import { useDialog } from '@/components/ui/DialogProvider';
import { useGetBookingByIdQuery, useRequestPassengerTripInterruptionMutation } from '@/store/api/bookingApi';
import {
  useConfirmDriverTripInterruptionMutation,
  useGetTripByIdQuery,
  useRejectDriverTripInterruptionMutation,
} from '@/store/api/tripApi';
import type { TripInterruptionReason, Trip, Booking } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { isPendingTripInterruption } from '@/utils/tripInterruption';
import { createElement, useCallback, useRef } from 'react';
import { PassengerInterruptionFarePreview } from '@/features/passenger-navigation/PassengerInterruptionFarePreview';

interface Params {
  booking: Booking | undefined;
  trip: Trip | undefined;
  requestPassengerTripInterruption: ReturnType<typeof useRequestPassengerTripInterruptionMutation>[0];
  passengerLocation: { latitude: number; longitude: number; } | null;
  refetchBooking: ReturnType<typeof useGetBookingByIdQuery>['refetch'];
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  isRequestingPassengerInterruption: boolean;
  tripId: string;
  confirmDriverTripInterruption: ReturnType<typeof useConfirmDriverTripInterruptionMutation>[0];
  rejectDriverTripInterruption: ReturnType<typeof useRejectDriverTripInterruptionMutation>[0];
}

export function usePassengerNavigationInterruption({
  booking,
  trip,
  requestPassengerTripInterruption,
  passengerLocation,
  refetchBooking,
  refetchTrip,
  showDialog,
  isRequestingPassengerInterruption,
  tripId,
  confirmDriverTripInterruption,
  rejectDriverTripInterruption,
}: Params) {
  const sendingInterruptionRef = useRef(false);
  const pendingPassengerInterruptionRequest = isPendingTripInterruption(
    booking?.interruptionRequest?.status,
  )
    ? booking?.interruptionRequest ?? null
    : null;
  const pendingDriverInterruptionRequest = isPendingTripInterruption(
    trip?.interruptionRequest?.status,
  )
    ? trip?.interruptionRequest ?? null
    : null;
  const driverInterruptionConfirmation = pendingDriverInterruptionRequest?.confirmations.find(
    (confirmation) =>
      confirmation.bookingId === booking?.id ||
      confirmation.passengerId === booking?.passengerId,
  );
  const hasRespondedToDriverInterruption =
    driverInterruptionConfirmation?.status === 'confirmed' ||
    driverInterruptionConfirmation?.status === 'rejected';
  const canRequestPassengerInterruption = Boolean(
    booking?.id &&
      booking.status === 'accepted' &&
      trip?.status === 'ongoing' &&
      booking.pickedUp &&
      booking.pickedUpConfirmedByPassenger &&
      !booking.droppedOff &&
      !booking.droppedOffConfirmedByPassenger &&
      !pendingPassengerInterruptionRequest,
  );
  const canRespondToDriverInterruption = Boolean(
    booking?.id &&
      trip?.status === 'ongoing' &&
      pendingDriverInterruptionRequest &&
      !hasRespondedToDriverInterruption &&
      !booking?.droppedOff &&
      !booking?.droppedOffConfirmedByPassenger,
  );

  const sendPassengerInterruptionRequest = useCallback(
    async (reason: TripInterruptionReason) => {
      if (!booking?.id || sendingInterruptionRef.current) return;
      sendingInterruptionRef.current = true;

      try {
        await requestPassengerTripInterruption({
          bookingId: booking.id,
          reason,
          note:
            reason === 'emergency'
              ? 'Le passager demande à descendre avant sa destination en raison d’une urgence.'
              : 'Le passager demande à descendre avant sa destination.',
          coordinates: passengerLocation,
        }).unwrap();
        await Promise.all([refetchBooking(), refetchTrip()]);
        showDialog({
          variant: 'success',
          title: 'Demande envoyée',
          message: 'Le conducteur doit confirmer avant que votre trajet soit interrompu.',
        });
      } catch (error: any) {
        showDialog({
          variant: 'danger',
          title: 'Demande impossible',
          message: getApiErrorMessage(error, "Impossible d'envoyer votre demande d'interruption."),
        });
      } finally {
        sendingInterruptionRef.current = false;
      }
    },
    [
      booking?.id,
      passengerLocation,
      refetchBooking,
      refetchTrip,
      requestPassengerTripInterruption,
      showDialog,
    ],
  );

  const openPassengerInterruptionDialog = useCallback(() => {
    if (!booking || !canRequestPassengerInterruption || isRequestingPassengerInterruption || sendingInterruptionRef.current) return;

    showDialog({
      variant: 'warning',
      icon: 'walk-outline',
      title: 'Descendre avant destination',
      content: createElement(PassengerInterruptionFarePreview, { booking, coordinates: passengerLocation }),
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Urgence',
          variant: 'danger',
          onPress: () => sendPassengerInterruptionRequest('emergency'),
        },
        {
          label: 'Autre raison',
          variant: 'secondary',
          onPress: () => sendPassengerInterruptionRequest('other'),
        },
      ],
    });
  }, [
    booking,
    passengerLocation,
    canRequestPassengerInterruption,
    isRequestingPassengerInterruption,
    sendPassengerInterruptionRequest,
    showDialog,
  ]);

  const handleConfirmDriverInterruption = useCallback(async () => {
    if (!tripId || !booking?.id) return;

    try {
      await confirmDriverTripInterruption({ tripId, bookingId: booking.id }).unwrap();
      await Promise.all([refetchBooking(), refetchTrip()]);
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Confirmation impossible',
        message: getApiErrorMessage(error, "Impossible de confirmer l'interruption du trajet."),
      });
    }
  }, [
    booking?.id,
    confirmDriverTripInterruption,
    refetchBooking,
    refetchTrip,
    showDialog,
    tripId,
  ]);

  const handleRejectDriverInterruption = useCallback(async () => {
    if (!tripId || !booking?.id) return;

    try {
      await rejectDriverTripInterruption({
        tripId,
        bookingId: booking.id,
        reason: "Le passager refuse l'interruption du trajet.",
      }).unwrap();
      await Promise.all([refetchBooking(), refetchTrip()]);
      showDialog({
        variant: 'info',
        title: 'Réponse envoyée',
        message: 'Votre refus a été transmis au conducteur.',
      });
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Refus impossible',
        message: getApiErrorMessage(error, "Impossible d'envoyer votre refus."),
      });
    }
  }, [
    booking?.id,
    refetchBooking,
    refetchTrip,
    rejectDriverTripInterruption,
    showDialog,
    tripId,
  ]);

  return {
    pendingPassengerInterruptionRequest,
    canRequestPassengerInterruption,
    openPassengerInterruptionDialog,
    pendingDriverInterruptionRequest,
    hasRespondedToDriverInterruption,
    driverInterruptionConfirmation,
    canRespondToDriverInterruption,
    handleRejectDriverInterruption,
    handleConfirmDriverInterruption,
  };
}
