import { useTripContactMessaging } from '@/hooks/navigation/useTripContactMessaging';
import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import { useCreateTripShareLinkMutation } from '@/store/api/trackingApi';
import type { Booking, Trip, User } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { shareTrip } from '@/utils/shareHelpers';
import { getRouteStopLabel } from '@/utils/routeLocationLabels';
import { useCallback } from 'react';

interface Params {
  trip: Trip | undefined;
  user: User | null;
  activeBooking: Booking | null;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  isCreatingTripShareLink: boolean;
  createTripShareLink: ReturnType<typeof useCreateTripShareLinkMutation>[0];
}

export function useTripDetailContactActions({
  trip,
  user,
  activeBooking,
  showDialog,
  isCreatingTripShareLink,
  createTripShareLink,
}: Params) {
  const contact = trip ? { id: trip.driverId, name: trip.driverName, phone: null, detail: 'Votre conducteur',
    bookingId: activeBooking?.id } : null;
  const messaging = useTripContactMessaging(contact ? [contact] : [], () => undefined);
  const handleContactDriver = async () => {
    if (!trip || !user || !contact || trip.driverId === user.id) {
      return;
    }

    try {
      const opened = await messaging.openMessage(contact);
      if (opened) void trackEvent('conversation_opened', {
        source_screen: 'trip_details',
        trip_id: trip.id,
        has_booking: Boolean(activeBooking?.id),
      });
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(error, "Impossible d'ouvrir la conversation pour le moment."),
      });
    }
  };

  const handleShareTrip = useCallback(async () => {
    if (!trip?.id || isCreatingTripShareLink) {
      return;
    }

    try {
      const response = await createTripShareLink({
        tripId: trip.id,
        bookingId: activeBooking?.id,
        message: 'Voici le lien pour suivre mon trajet Zwanga en temps réel.',
      }).unwrap();

      await shareTrip(
        response.publicUrl,
        getRouteStopLabel({ name: trip.departure?.name, address: trip.departure?.address }, 'Point de départ').title,
        getRouteStopLabel({ name: trip.arrival?.name, address: trip.arrival?.address }, 'Destination').title,
      );
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Partage impossible',
        message: getApiErrorMessage(error, 'Impossible de créer le lien web de suivi.'),
      });
    }
  }, [
    activeBooking?.id,
    createTripShareLink,
    isCreatingTripShareLink,
    showDialog,
    trip?.arrival?.address,
    trip?.arrival?.name,
    trip?.departure?.address,
    trip?.departure?.name,
    trip?.id,
  ]);

  return {
    isOpeningConversation: messaging.isOpeningConversation,
    handleShareTrip,
    handleContactDriver,
  };
}
