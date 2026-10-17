import { FeedbackState, hasPassengerBoarded } from '../../features/manage-trip/manageTripModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import { useAcceptBookingMutation, useCancelBookingMutation, useRejectBookingMutation } from '@/store/api/bookingApi';
import type { Booking, BookingStatus, Trip } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import React, { useEffect, useRef } from 'react';
import { getTokenSessionVersion } from '@/services/tokenSession';

interface Params {
  setFeedback: React.Dispatch<React.SetStateAction<FeedbackState>>;
  userId: string | undefined;
  isScreenActive: boolean;
  bookings: Booking[] | undefined;
  commitBookingDecision: (booking: Booking, status: 'accepted' | 'rejected', response?: Booking) => void;
  setProcessingBookingId: React.Dispatch<React.SetStateAction<string | null>>;
  acceptBooking: ReturnType<typeof useAcceptBookingMutation>[0];
  rememberAcceptedBooking: (bookingId: string) => void;
  trip: Trip | undefined;
  refreshAll: () => Promise<void>;
  reconcileBookingStatus: (error: unknown, bookingId: string, expectedStatuses: readonly BookingStatus[]) => Promise<Booking | null>;
  rejectBooking: ReturnType<typeof useRejectBookingMutation>[0];
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  cancelBooking: ReturnType<typeof useCancelBookingMutation>[0];
}

export function useManageTripBookingActions({
  setFeedback,
  userId,
  isScreenActive,
  bookings,
  commitBookingDecision,
  setProcessingBookingId,
  acceptBooking,
  rememberAcceptedBooking,
  trip,
  refreshAll,
  reconcileBookingStatus,
  rejectBooking,
  showDialog,
  cancelBooking,
}: Params) {
  const decisionLock = useRef(false);
  const completed = useRef(new Set<string>());
  const mounted = useRef(true);
  const current = useRef({ userId, isScreenActive, trip, bookings });
  current.current = { userId, isScreenActive, trip, bookings };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { completed.current.clear(); }, [userId, trip?.id]);
  const cancelLock = useRef(false);
  const showFeedback = (type: 'success' | 'error', message: string | string[]) => {
    setFeedback({
      type,
      message: Array.isArray(message) ? message.join('\n') : message,
    });
  };

  const answerBooking = async (bookingId: string, status: 'accepted' | 'rejected') => {
    const booking = current.current.bookings?.find(candidate => candidate.id === bookingId);
    if (!mounted.current || !isScreenActive || !userId || trip?.driverId !== userId ||
      current.current.userId !== userId || !current.current.isScreenActive || current.current.trip?.id !== trip.id ||
      !booking || booking.tripId !== trip.id || booking.status !== 'pending' ||
      (trip.status !== 'upcoming' && trip.status !== 'ongoing') || decisionLock.current ||
      cancelLock.current || completed.current.has(bookingId)) return;
    decisionLock.current = true;
    const version = getTokenSessionVersion();
    const isCurrent = () => mounted.current && current.current.isScreenActive &&
      current.current.userId === userId && current.current.trip?.id === trip.id &&
      getTokenSessionVersion() === version;
    const commit = (response?: Booking) => {
      if (!isCurrent()) return;
      completed.current.add(bookingId);
      if (completed.current.size > 100) completed.current.delete(completed.current.values().next().value!);
      commitBookingDecision(booking, status, response);
      if (status === 'accepted') rememberAcceptedBooking(bookingId);
      showFeedback('success', status === 'accepted' ? 'Réservation acceptée.' : 'Réservation refusée.');
      // A refresh failure must not turn a confirmed decision into an error.
      void Promise.resolve().then(refreshAll).catch(() => {});
    };
    setProcessingBookingId(bookingId);
    try {
      const result = status === 'accepted' ? await acceptBooking(bookingId).unwrap()
        : await rejectBooking({ id: bookingId, reason: 'Refus du conducteur' }).unwrap();
      if (!isCurrent()) return;
      commit(result);
      void trackEvent(status === 'accepted' ? 'booking_accepted' : 'booking_rejected', {
        booking_id: bookingId, trip_id: trip.id, source_screen: 'trip_manage',
      }).catch(() => {});
    } catch (error: unknown) {
      if (!isCurrent()) return;
      const reconciled = await reconcileBookingStatus(error, bookingId, [status]).catch(() => null);
      if (!isCurrent()) return;
      if (reconciled) { commit(reconciled); return; }
      showFeedback('error', getApiErrorMessage(error, status === 'accepted'
        ? 'Impossible d’accepter cette réservation. Réessayez.' : 'Impossible de refuser cette réservation. Réessayez.'));
    } finally {
      decisionLock.current = false;
      if (mounted.current) setProcessingBookingId(null);
    }
  };
  const handleAcceptBooking = (bookingId: string) => answerBooking(bookingId, 'accepted');
  const handleRejectBooking = (booking: Booking) => answerBooking(booking.id, 'rejected');

  const handleCancelBookingBeforePickup = (booking: Booking) => {
    if (!trip || cancelLock.current || decisionLock.current) return;

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
            if (cancelLock.current || decisionLock.current) return;
            cancelLock.current = true;
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
              cancelLock.current = false;
              setProcessingBookingId(null);
            }
          },
        },
      ],
    });
  };

  return {
    showFeedback,
    handleRejectBooking,
    handleAcceptBooking,
    handleCancelBookingBeforePickup,
  };
}
