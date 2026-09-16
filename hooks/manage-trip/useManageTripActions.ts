import type { TrackedLocation } from '@/store/slices/locationSlice';
import { hasPassengerBoarded, hasPassengerDroppedOff } from '../../features/manage-trip/manageTripModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import {
  usePauseTripMutation,
  useRequestDriverTripInterruptionMutation,
  useStartTripMutation,
  useUpdateTripMutation,
} from '@/store/api/tripApi';
import type { Booking, TripInterruptionReason } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { getTripLocationCoordinate } from '@/utils/tripCoordinates';
import type { Trip } from '@/types';
import type { Router } from 'expo-router';

interface Params {
  trip: Trip | undefined;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  startTrip: ReturnType<typeof useStartTripMutation>[0];
  showFeedback: (type: "success" | "error", message: string | string[]) => void;
  refreshAll: () => Promise<void>;
  reconcileTripStatus: (error: unknown, expectedStatuses: readonly string[]) => Promise<Trip | null>;
  pauseTrip: ReturnType<typeof usePauseTripMutation>[0];
  requestDriverTripInterruption: ReturnType<typeof useRequestDriverTripInterruptionMutation>[0];
  lastKnownLocation: TrackedLocation | null;
  visibleBookings: Booking[] | undefined;
  router: Router;
  updateTripStatus: ReturnType<typeof useUpdateTripMutation>[0];
  goHome: () => void;
}

export function useManageTripActions({
  trip,
  showDialog,
  startTrip,
  showFeedback,
  refreshAll,
  reconcileTripStatus,
  pauseTrip,
  requestDriverTripInterruption,
  lastKnownLocation,
  visibleBookings,
  router,
  updateTripStatus,
  goHome,
}: Params) {
  const handleStartTrip = async () => {
    if (!trip) return;
    showDialog({
      variant: 'info',
      title: 'Démarrer le trajet',
      message: 'Voulez-vous démarrer ce trajet maintenant ? Les passagers seront notifiés.',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Démarrer',
          variant: 'primary',
          onPress: async () => {
            try {
              await startTrip(trip.id).unwrap();
              void trackEvent('trip_started', {
                trip_id: trip.id,
                source_screen: 'trip_manage',
              });
              showFeedback('success', 'Le trajet a été démarré avec succès.');
              refreshAll();
            } catch (error: any) {
              const startedTrip = await reconcileTripStatus(error, ['ongoing']);
              if (startedTrip) {
                showFeedback('success', 'Le trajet a bien démarré malgré la connexion lente.');
                void refreshAll();
                return;
              }
              showFeedback(
                'error',
                getApiErrorMessage(error, 'Impossible de démarrer ce trajet.'),
              );
            }
          },
        },
      ],
    });
  };

  const pauseTripWithoutPassengerConfirmation = async () => {
    if (!trip) return;

    try {
      await pauseTrip(trip.id).unwrap();
      void trackEvent('trip_paused', {
        trip_id: trip.id,
        source_screen: 'trip_manage',
      });
      showFeedback('success', 'Le trajet a été interrompu avec succès.');
      refreshAll();
    } catch (error: any) {
      const pausedTrip = await reconcileTripStatus(error, ['upcoming']);
      if (pausedTrip) {
        showFeedback('success', 'Le trajet a bien été interrompu malgré la connexion lente.');
        void refreshAll();
        return;
      }
      showFeedback(
        'error',
        getApiErrorMessage(error, 'Impossible d\'interrompre ce trajet.'),
      );
    }
  };

  const sendDriverInterruptionRequest = async (reason: TripInterruptionReason) => {
    if (!trip) return;

    try {
      await requestDriverTripInterruption({
        tripId: trip.id,
        reason,
        note:
          reason === 'emergency'
            ? 'Le conducteur demande une interruption urgente du trajet.'
            : 'Le conducteur demande une interruption du trajet.',
        coordinates: lastKnownLocation?.coords
          ? {
              latitude: lastKnownLocation.coords.latitude,
              longitude: lastKnownLocation.coords.longitude,
            }
          : null,
      }).unwrap();
      void trackEvent('trip_interruption_requested', {
        trip_id: trip.id,
        reason,
        source_screen: 'trip_manage',
      });
      showFeedback(
        'success',
        'Demande envoyée. Tous les passagers à bord doivent confirmer.',
      );
      refreshAll();
    } catch (error: any) {
      showFeedback(
        'error',
        getApiErrorMessage(error, "Impossible d'envoyer la demande d'interruption."),
      );
    }
  };

  const handlePauseTrip = async () => {
    if (!trip) return;
    const passengersOnBoard = (visibleBookings ?? []).filter(
      (booking) =>
        booking.status === 'accepted' &&
        hasPassengerBoarded(booking) &&
        !hasPassengerDroppedOff(booking),
    );

    if (passengersOnBoard.length === 0) {
      showDialog({
        variant: 'warning',
        title: 'Interrompre le trajet',
        message: "Aucun passager n'est à bord. Vous pouvez interrompre ce trajet directement.",
        actions: [
          { label: 'Annuler', variant: 'ghost' },
          {
            label: 'Interrompre',
            variant: 'secondary',
            onPress: pauseTripWithoutPassengerConfirmation,
          },
        ],
      });
      return;
    }

    showDialog({
      variant: 'warning',
      title: 'Demander une interruption',
      message:
        'Cette interruption devra être confirmée par tous les passagers à bord avant de prendre effet.',
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
  };

  const handleOpenNavigation = () => {
    if (!trip) return;

    if (trip.status !== 'ongoing') {
      showDialog({
        variant: 'info',
        title: 'Navigation indisponible',
        message: "Demarrez d'abord le trajet pour acceder à la navigation en direct.",
      });
      return;
    }

    if (!getTripLocationCoordinate(trip.arrival)) {
      showDialog({
        title: 'Erreur',
        message: 'Les coordonnées de destination sont indisponibles.',
        variant: 'danger',
      });
      return;
    }

    // Ouvrir l'écran de navigation intégré
    router.push(`/trip/navigate/${trip.id}`);
  };

  const handleOpenTripEdit = () => {
    if (!trip || (trip.status !== 'upcoming' && trip.status !== 'ongoing')) {
      return;
    }

    router.push(`/trip/${trip.id}?openEdit=1`);
  };

  const handleCancelTrip = () => {
    if (!trip) return;
    showDialog({
      variant: 'warning',
      title: 'Annuler le trajet',
      message: 'Les passagers seront notifiés immédiatement. Voulez-vous continuer ?',
      actions: [
        { label: 'Retour', variant: 'ghost' },
        {
          label: 'Oui, annuler',
          variant: 'primary',
          onPress: async () => {
            try {
              await updateTripStatus({ id: trip.id, updates: { status: 'cancelled' } }).unwrap();
              void trackEvent('trip_cancelled', {
                trip_id: trip.id,
                source_screen: 'trip_manage',
              });
              showFeedback('success', 'Le trajet a été annulé.');
              goHome();
            } catch (error: any) {
              showFeedback(
                'error',
                getApiErrorMessage(error, "Impossible d'annuler ce trajet."),
              );
            }
          },
        },
      ],
    });
  };

  return {
    handleOpenNavigation,
    handleStartTrip,
    handleOpenTripEdit,
    handleCancelTrip,
    handlePauseTrip,
  };
}
