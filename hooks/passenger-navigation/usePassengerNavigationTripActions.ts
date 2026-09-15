import { PassengerPickupNotice } from '../../features/passenger-navigation/navigationModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { stopPassengerBackgroundLocationTracking } from '@/services/passengerBackgroundLocationTask';
import { useCancelBookingMutation, useGetBookingByIdQuery } from '@/store/api/bookingApi';
import { useCreateTripShareLinkMutation } from '@/store/api/trackingApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { NavigationSpeech as Speech } from '@/utils/navigationSpeech';
import { shareTrip } from '@/utils/shareHelpers';
import * as Location from 'expo-location';
import React, { useCallback } from 'react';
import type { Trip, Booking } from '@/types';

interface Params {
  tripId: string;
  createTripShareLink: ReturnType<typeof useCreateTripShareLinkMutation>[0];
  booking: Booking | undefined;
  trip: Trip | undefined;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  cancelBooking: ReturnType<typeof useCancelBookingMutation>[0];
  passengerLocationSubscriptionRef: React.RefObject<Location.LocationSubscription | null>;
  setPickupNotice: React.Dispatch<React.SetStateAction<PassengerPickupNotice | null>>;
  setPickupNoticeCountdown: React.Dispatch<React.SetStateAction<number | null>>;
  refetchBooking: ReturnType<typeof useGetBookingByIdQuery>['refetch'];
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
  navigateBackSafely: () => void;
  isCancellingBooking: boolean;
}

export function usePassengerNavigationTripActions({
  tripId,
  createTripShareLink,
  booking,
  trip,
  showDialog,
  cancelBooking,
  passengerLocationSubscriptionRef,
  setPickupNotice,
  setPickupNoticeCountdown,
  refetchBooking,
  refetchTrip,
  navigateBackSafely,
  isCancellingBooking,
}: Params) {
  const handleShareTrip = useCallback(async () => {
    if (!tripId) return;

    try {
      const response = await createTripShareLink({
        tripId,
        bookingId: booking?.id,
        message: 'Voici le lien pour suivre mon trajet Zwanga en temps réel.',
      }).unwrap();
      await shareTrip(
        response.publicUrl,
        trip?.departure?.name ?? trip?.departure?.address,
        trip?.arrival?.name ?? trip?.arrival?.address,
      );
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Partage impossible',
        message: getApiErrorMessage(error, 'Impossible de créer le lien web de suivi.'),
      });
    }
  }, [
    booking?.id,
    createTripShareLink,
    showDialog,
    trip?.arrival?.address,
    trip?.arrival?.name,
    trip?.departure?.address,
    trip?.departure?.name,
    tripId,
  ]);

  const handleCancelPassengerTrip = useCallback(async () => {
    if (!booking?.id) return;

    try {
      await cancelBooking(booking.id).unwrap();
      passengerLocationSubscriptionRef.current?.remove();
      passengerLocationSubscriptionRef.current = null;
      void stopPassengerBackgroundLocationTracking(booking.id);
      setPickupNotice(null);
      setPickupNoticeCountdown(null);
      void Speech.stop();
      refetchBooking();
      refetchTrip();

      showDialog({
        variant: 'success',
        title: 'Trajet annulé',
        message: 'Votre participation a été annulée.',
        actions: [
          {
            label: 'Retour',
            variant: 'primary',
            onPress: navigateBackSafely,
          },
        ],
      });
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Annulation impossible',
        message: getApiErrorMessage(error, "Impossible d'annuler votre participation pour le moment."),
      });
    }
  }, [
    booking?.id,
    cancelBooking,
    navigateBackSafely,
    refetchBooking,
    refetchTrip,
    showDialog,
  ]);

  const confirmCancelPassengerTrip = useCallback(() => {
    if (!booking?.id || isCancellingBooking) return;

    showDialog({
      variant: 'warning',
      title: 'Annuler ce trajet',
      message:
        'Voulez-vous vraiment annuler votre participation à ce trajet ? Le conducteur sera informé.',
      actions: [
        { label: 'Garder', variant: 'ghost' },
        {
          label: 'Oui, annuler',
          variant: 'danger',
          onPress: handleCancelPassengerTrip,
        },
      ],
    });
  }, [
    booking?.id,
    handleCancelPassengerTrip,
    isCancellingBooking,
    showDialog,
  ]);

  return {
    handleShareTrip,
    confirmCancelPassengerTrip,
  };
}
