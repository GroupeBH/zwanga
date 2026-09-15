import { FeedbackState, hasPassengerBoarded } from '../../features/manage-trip/manageTripModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import { useAcceptBookingMutation, useCancelBookingMutation, useRejectBookingMutation } from '@/store/api/bookingApi';
import type { Booking, BookingStatus } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import React from 'react';
import type { Trip } from '@/types';

interface Params {
  setFeedback: React.Dispatch<React.SetStateAction<FeedbackState>>;
  setTargetBooking: React.Dispatch<React.SetStateAction<Booking | null>>;
  setRejectReason: React.Dispatch<React.SetStateAction<string>>;
  setRejectError: React.Dispatch<React.SetStateAction<string>>;
  setRejectModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isRejecting: boolean;
  setProcessingBookingId: React.Dispatch<React.SetStateAction<string | null>>;
  acceptBooking: ReturnType<typeof useAcceptBookingMutation>[0];
  rememberAcceptedBooking: (bookingId: string) => void;
  trip: Trip | undefined;
  refreshAll: () => Promise<void>;
  reconcileBookingStatus: (error: unknown, bookingId: string, expectedStatuses: readonly BookingStatus[]) => Promise<Booking | null>;
  targetBooking: Booking | null;
  rejectReason: string;
  rejectBooking: ReturnType<typeof useRejectBookingMutation>[0];
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  cancelBooking: ReturnType<typeof useCancelBookingMutation>[0];
}

export function useManageTripBookingActions({
  setFeedback,
  setTargetBooking,
  setRejectReason,
  setRejectError,
  setRejectModalVisible,
  isRejecting,
  setProcessingBookingId,
  acceptBooking,
  rememberAcceptedBooking,
  trip,
  refreshAll,
  reconcileBookingStatus,
  targetBooking,
  rejectReason,
  rejectBooking,
  showDialog,
  cancelBooking,
}: Params) {
  const showFeedback = (type: 'success' | 'error', message: string | string[]) => {
    setFeedback({
      type,
      message: Array.isArray(message) ? message.join('\n') : message,
    });
  };

  const openRejectModal = (booking: Booking) => {
    setTargetBooking(booking);
    setRejectReason('');
    setRejectError('');
    setRejectModalVisible(true);
  };

  const closeRejectModal = () => {
    if (isRejecting) return;
    setRejectModalVisible(false);
    setTargetBooking(null);
    setRejectReason('');
    setRejectError('');
  };

  const handleAcceptBooking = async (bookingId: string) => {
    setProcessingBookingId(bookingId);
    try {
      await acceptBooking(bookingId).unwrap();
      rememberAcceptedBooking(bookingId);
      void trackEvent('booking_accepted', {
        booking_id: bookingId,
        trip_id: trip?.id ?? '',
        source_screen: 'trip_manage',
      });
      showFeedback('success', 'La réservation a été acceptée.');
      refreshAll();
    } catch (error: any) {
      const acceptedBooking = await reconcileBookingStatus(error, bookingId, ['accepted']);
      if (acceptedBooking) {
        rememberAcceptedBooking(bookingId);
        showFeedback('success', 'La réservation a bien été acceptée malgré la connexion lente.');
        void refreshAll();
        return;
      }
      showFeedback(
        'error',
        getApiErrorMessage(error, 'Impossible d’accepter cette réservation.'),
      );
    } finally {
      setProcessingBookingId(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!targetBooking) return;
    if (!rejectReason.trim()) {
      setRejectError('Veuillez indiquer un motif de refus.');
      return;
    }
    setProcessingBookingId(targetBooking.id);
    try {
      await rejectBooking({ id: targetBooking.id, reason: rejectReason.trim() }).unwrap();
      void trackEvent('booking_rejected', {
        booking_id: targetBooking.id,
        trip_id: trip?.id ?? '',
        source_screen: 'trip_manage',
      });
      showFeedback('success', 'La réservation a été refusée.');
      closeRejectModal();
      refreshAll();
    } catch (error: any) {
      const rejectedBooking = await reconcileBookingStatus(error, targetBooking.id, ['rejected']);
      if (rejectedBooking) {
        setRejectModalVisible(false);
        setTargetBooking(null);
        setRejectReason('');
        setRejectError('');
        showFeedback('success', 'La réservation a bien été refusée malgré la connexion lente.');
        void refreshAll();
        return;
      }
      setRejectError(
        getApiErrorMessage(error, 'Impossible de refuser cette réservation.'),
      );
    } finally {
      setProcessingBookingId(null);
    }
  };

  const handleCancelBookingBeforePickup = (booking: Booking) => {
    if (!trip) return;

    if (booking.status !== 'accepted' || hasPassengerBoarded(booking)) {
      showFeedback('error', 'Impossible d\'annuler cette réservation : le passager a déjà embarqué.');
      return;
    }

    const passengerName = booking.passengerName || 'ce passager';

    showDialog({
      variant: 'warning',
      title: 'Annuler la réservation',
      message: `Voulez-vous annuler la réservation de ${passengerName} ? Cette action est possible uniquement avant l'embarquement du passager.`,
      actions: [
        { label: 'Retour', variant: 'ghost' },
        {
          label: 'Oui, annuler',
          variant: 'primary',
          onPress: async () => {
            setProcessingBookingId(booking.id);
            try {
              await cancelBooking(booking.id).unwrap();
              void trackEvent('driver_booking_cancelled_before_pickup', {
                booking_id: booking.id,
                trip_id: trip.id,
                source_screen: 'trip_manage',
              });
              showFeedback('success', 'La réservation a été annulée. Le passager sera notifié.');
              refreshAll();
            } catch (error: any) {
              const cancelledBooking = await reconcileBookingStatus(error, booking.id, ['cancelled']);
              if (cancelledBooking) {
                showFeedback('success', 'La réservation a bien été annulée malgré la connexion lente.');
                void refreshAll();
                return;
              }
              showFeedback(
                'error',
                getApiErrorMessage(error, 'Impossible d\'annuler cette réservation.'),
              );
            } finally {
              setProcessingBookingId(null);
            }
          },
        },
      ],
    });
  };

  return {
    showFeedback,
    openRejectModal,
    handleAcceptBooking,
    handleCancelBookingBeforePickup,
    closeRejectModal,
    handleRejectSubmit,
  };
}
