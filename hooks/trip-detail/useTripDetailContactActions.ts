import { findDirectConversationWithUser } from '../../features/trip-detail/tripDetailModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import { useCreateConversationMutation, useLazyListConversationsQuery } from '@/store/api/messageApi';
import { useCreateTripShareLinkMutation } from '@/store/api/trackingApi';
import type { Booking } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { shareTrip } from '@/utils/shareHelpers';
import { useCallback } from 'react';
import type { Trip, User, Conversation } from '@/types';
import type { Router } from 'expo-router';

interface Params {
  trip: Trip | undefined;
  user: User | null;
  conversations: Conversation[];
  loadConversations: ReturnType<typeof useLazyListConversationsQuery>[0];
  createConversation: ReturnType<typeof useCreateConversationMutation>[0];
  activeBooking: Booking | null;
  router: Router;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  isCreatingTripShareLink: boolean;
  createTripShareLink: ReturnType<typeof useCreateTripShareLinkMutation>[0];
}

export function useTripDetailContactActions({
  trip,
  user,
  conversations,
  loadConversations,
  createConversation,
  activeBooking,
  router,
  showDialog,
  isCreatingTripShareLink,
  createTripShareLink,
}: Params) {
  const handleContactDriver = async () => {
    if (!trip || !user || trip.driverId === user.id) {
      return;
    }

    try {
      const localConversation = findDirectConversationWithUser(conversations, user.id, trip.driverId);
      const remoteConversations = localConversation
        ? undefined
        : (await loadConversations({ page: 1, limit: 100 }).unwrap()).data;
      const existingConversation =
        localConversation ??
        findDirectConversationWithUser(remoteConversations, user.id, trip.driverId);
      const conversation =
        existingConversation ??
        (await createConversation({
          participantIds: [trip.driverId],
        }).unwrap());

      void trackEvent('conversation_opened', {
        source_screen: 'trip_details',
        trip_id: trip.id,
        has_booking: Boolean(activeBooking?.id),
        reused_existing_conversation: Boolean(existingConversation),
      });
      router.push({
        pathname: '/chat/[id]',
        params: {
          id: conversation.id,
          title: trip.driverName,
        },
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
        trip.departure?.name ?? trip.departure?.address,
        trip.arrival?.name ?? trip.arrival?.address,
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
    handleShareTrip,
    handleContactDriver,
  };
}
