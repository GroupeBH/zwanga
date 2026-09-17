import type { DriverTripInterruptionRequest } from '@/types';
import {
  hasBookingPickupCompleted,
  hasBookingDropoffCompleted,
} from '../../features/driver-navigation/navigationBooking';
import { useDialog } from '@/components/ui/DialogProvider';
import { useGetTripBookingsQuery } from '@/store/api/bookingApi';
import { useCreateTripShareLinkMutation } from '@/store/api/trackingApi';
import { useCancelDriverTripInterruptionMutation, useGetTripByIdQuery } from '@/store/api/tripApi';
import type { Booking, Trip, TripInterruptionReason } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { shareTrip } from '@/utils/shareHelpers';
import React, { useCallback, useEffect } from 'react';
import { BackHandler } from 'react-native';
import type { Router } from 'expo-router';

interface Params {
  tripId: string;
  isPausingTrip: boolean;
  isRequestingDriverInterruption: boolean;
  isCancellingDriverInterruption: boolean;
  activeDriverInterruptionRequest: DriverTripInterruptionRequest | null;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  activeDriverInterruptionConfirmedCount: number;
  activeDriverInterruptionRequiredCount: number;
  cancelDriverTripInterruption: ReturnType<typeof useCancelDriverTripInterruptionMutation>[0];
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
  refetchBookings: ReturnType<typeof useGetTripBookingsQuery>['refetch'];
  bookingsRef: React.RefObject<Booking[] | undefined>;
  pauseTripWithoutPassengerConfirmation: () => Promise<void>;
  sendDriverInterruptionRequest: (reason: TripInterruptionReason) => Promise<void>;
  createTripShareLink: ReturnType<typeof useCreateTripShareLinkMutation>[0];
  trip: Trip | undefined;
  cleanupNavigationUi: () => void;
  navigateAfterRelease: (navigate: () => void, onRecovered?: () => void) => boolean;
  router: Router;
  isFocused: boolean;
  securityModalVisible: boolean;
  setSecurityModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  handleExitNavigation: () => void;
}

export function useDriverTripActions({
  tripId,
  isPausingTrip,
  isRequestingDriverInterruption,
  isCancellingDriverInterruption,
  activeDriverInterruptionRequest,
  showDialog,
  activeDriverInterruptionConfirmedCount,
  activeDriverInterruptionRequiredCount,
  cancelDriverTripInterruption,
  refetchTrip,
  refetchBookings,
  bookingsRef,
  pauseTripWithoutPassengerConfirmation,
  sendDriverInterruptionRequest,
  createTripShareLink,
  trip,
  cleanupNavigationUi,
  navigateAfterRelease,
  router,
  isFocused,
  securityModalVisible,
  setSecurityModalVisible,
  handleExitNavigation,
}: Params) {
  const handlePauseTripFromNavigation = useCallback(() => {
    if (
      !tripId ||
      isPausingTrip ||
      isRequestingDriverInterruption ||
      isCancellingDriverInterruption
    ) {
      return;
    }

    if (activeDriverInterruptionRequest) {
      showDialog({
        title: 'Interruption en attente',
        message: `${activeDriverInterruptionConfirmedCount}/${activeDriverInterruptionRequiredCount} passager(s) ont confirmé.`,
        variant: 'info',
        icon: 'hourglass-outline',
        actions: [
          { label: 'Quitter la navigation', variant: 'primary', onPress: handleExitNavigation },
          { label: 'Fermer', variant: 'ghost' },
          {
            label: 'Annuler la demande',
            variant: 'danger',
            onPress: async () => {
              await cancelDriverTripInterruption(tripId).unwrap();
              await Promise.all([refetchTrip(), refetchBookings()]);
            },
          },
        ],
      });
      return;
    }

    const passengersOnBoard = (bookingsRef.current ?? []).filter(
      (booking) =>
        booking.status === 'accepted' &&
        hasBookingPickupCompleted(booking) &&
        !hasBookingDropoffCompleted(booking),
    );

    if (passengersOnBoard.length === 0) {
      showDialog({
        title: 'Interrompre le trajet',
        message: "Aucun passager n'est à bord. Le trajet sera interrompu et vous reviendrez à sa gestion.",
        variant: 'warning',
        icon: 'pause-circle-outline',
        actions: [
          { label: 'Annuler', variant: 'ghost' },
          {
            label: 'Interrompre et quitter',
            variant: 'danger',
            onPress: pauseTripWithoutPassengerConfirmation,
          },
        ],
      });
      return;
    }

    showDialog({
      title: 'Demander une interruption',
      message:
        'Choisissez le motif pour envoyer la demande et quitter la navigation. Le trajet reste en cours jusqu’à la confirmation de tous les passagers à bord.',
      variant: 'warning',
      icon: 'stop-circle-outline',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Urgence',
          variant: 'danger',
          onPress: () => sendDriverInterruptionRequest('emergency'),
        },
        {
          label: 'Autre raison',
          variant: 'secondary',
          onPress: () => sendDriverInterruptionRequest('other'),
        },
      ],
    });
  }, [
    bookingsRef,
    handleExitNavigation,
    activeDriverInterruptionConfirmedCount,
    activeDriverInterruptionRequest,
    activeDriverInterruptionRequiredCount,
    cancelDriverTripInterruption,
    isCancellingDriverInterruption,
    isPausingTrip,
    isRequestingDriverInterruption,
    pauseTripWithoutPassengerConfirmation,
    refetchBookings,
    refetchTrip,
    sendDriverInterruptionRequest,
    showDialog,
    tripId,
  ]);

  const handleShareTrip = useCallback(async () => {
    if (!tripId) return;

    try {
      const response = await createTripShareLink({
        tripId,
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
    createTripShareLink,
    showDialog,
    trip?.arrival?.address,
    trip?.arrival?.name,
    trip?.departure?.address,
    trip?.departure?.name,
    tripId,
  ]);

  const handleEditTripFromNavigation = useCallback(() => {
    if (!tripId) {
      return;
    }

    cleanupNavigationUi();
    navigateAfterRelease(() => router.replace(`/trip/${tripId}?openEdit=1`));
  }, [cleanupNavigationUi, navigateAfterRelease, router, tripId]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (securityModalVisible) {
        setSecurityModalVisible(false);
        return true;
      }
      handleExitNavigation();
      return true;
    });

    return () => {
      backHandler.remove();
    };
  }, [handleExitNavigation, isFocused, securityModalVisible]);

  return {
    handleEditTripFromNavigation,
    handlePauseTripFromNavigation,
    handleShareTrip,
  };
}
