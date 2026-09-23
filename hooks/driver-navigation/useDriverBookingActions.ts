import { getBookingActionErrorMessage } from '../../features/driver-navigation/navigationPresentation';
import { useDialog } from '@/components/ui/DialogProvider';
import {
  useAcceptBookingMutation,
  useConfirmPassengerTripInterruptionMutation,
  useGetTripBookingsQuery,
  useRejectPassengerTripInterruptionMutation,
  useRejectBookingMutation,
} from '@/store/api/bookingApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import type { Booking } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import React, { useCallback, useEffect, useRef } from 'react';
import { getDriverInterruptionSettlementMessage } from '@/features/arrival-payment/interruptionSettlement';
import type { useDriverBookingActionGuard } from './useDriverBookingActionGuard';
import type { DriverBookingDecision } from '@/store/api/booking/driverDecisionCache';
import { canRespondToPassengerInterruption, isPassengerInterruptionResponse } from '@/features/driver-navigation/passengerInterruptionResponse';

interface Params {
  commitBookingDecision: (source: Booking, status: DriverBookingDecision, response?: Booking) => void;
  beginBookingAction: ReturnType<typeof useDriverBookingActionGuard>;
  acceptBooking: ReturnType<typeof useAcceptBookingMutation>[0];
  rememberAcceptedBooking: (bookingId: string) => void;
  lastRouteFetchTimeRef: React.RefObject<number>;
  routeFetchedRef: React.RefObject<boolean>;
  refetchBookings: ReturnType<typeof useGetTripBookingsQuery>['refetch'];
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
  speakNavigationMessage: (message: string, options?: { force?: boolean; }) => Promise<void>;
  reconcileBookingStatus: (error: unknown, bookingId: string, expectedStatuses: readonly string[]) => Promise<Booking | null>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  rejectBooking: ReturnType<typeof useRejectBookingMutation>[0];
  isConfirmingPassengerInterruption: boolean;
  confirmPassengerTripInterruption: ReturnType<typeof useConfirmPassengerTripInterruptionMutation>[0];
  commitPassengerInterruptionResponse: (response: Booking, source: Booking) => void;
  routeSignatureRef: React.RefObject<string>;
  isRejectingPassengerInterruption: boolean;
  rejectPassengerTripInterruption: ReturnType<typeof useRejectPassengerTripInterruptionMutation>[0];
}

export function useDriverBookingActions({
  commitBookingDecision,
  beginBookingAction,
  acceptBooking,
  rememberAcceptedBooking,
  lastRouteFetchTimeRef,
  routeFetchedRef,
  refetchBookings,
  refetchTrip,
  speakNavigationMessage,
  reconcileBookingStatus,
  showDialog,
  rejectBooking,
  isConfirmingPassengerInterruption,
  confirmPassengerTripInterruption,
  commitPassengerInterruptionResponse,
  routeSignatureRef,
  isRejectingPassengerInterruption,
  rejectPassengerTripInterruption,
}: Params) {
  const confirmingInterruptionRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const refreshInBackground = useCallback(() => {
    void Promise.allSettled([Promise.resolve().then(() => refetchBookings()), Promise.resolve().then(() => refetchTrip())]);
  }, [refetchBookings, refetchTrip]);
  const handleAcceptPendingBooking = useCallback(
    async (booking: Booking) => {
      const action = beginBookingAction(booking, 'accept');
      if (!action) return;
      try {
        const accepted = await acceptBooking(booking.id).unwrap();
        if (!action.isCurrent()) return;
        commitBookingDecision(action.booking, 'accepted', accepted);
        action.complete();
        rememberAcceptedBooking(booking.id);
        lastRouteFetchTimeRef.current = 0;
        routeFetchedRef.current = false;
        refreshInBackground();
        if (!action.isCurrent()) return;
        void speakNavigationMessage(
          `${booking.passengerName || 'Passager'} accepte. Recalcul de l'itinéraire.`,
          { force: true },
        );
      } catch (error: any) {
        if (!action.isCurrent()) return;
        const acceptedBooking = await reconcileBookingStatus(error, booking.id, ['accepted']);
        if (!action.isCurrent()) return;
        if (acceptedBooking) {
          commitBookingDecision(action.booking, 'accepted', acceptedBooking);
          action.complete();
          rememberAcceptedBooking(booking.id);
          refreshInBackground();
          return;
        }
        showDialog({
          variant: 'danger',
          title: 'Réservation impossible',
          message: getBookingActionErrorMessage(
            error,
            "Impossible d'accepter cette réservation pour le moment.",
          ),
        });
      } finally {
        action.finish();
      }
    },
    [beginBookingAction, acceptBooking, commitBookingDecision, refreshInBackground, lastRouteFetchTimeRef, reconcileBookingStatus,
      rememberAcceptedBooking, routeFetchedRef, showDialog, speakNavigationMessage],
  );

  const handleRejectPendingBooking = useCallback(
    async (booking: Booking) => {
      const action = beginBookingAction(booking, 'reject');
      if (!action) return;
      try {
        const rejected = await rejectBooking({
          id: booking.id,
          reason: 'Refus depuis la navigation conducteur',
        }).unwrap();
        if (!action.isCurrent()) return;
        commitBookingDecision(action.booking, 'rejected', rejected);
        action.complete();
        refreshInBackground();
        if (!action.isCurrent()) return;
        void speakNavigationMessage(
          `${booking.passengerName || 'Passager'} refuse.`,
          { force: true },
        );
      } catch (error: any) {
        if (!action.isCurrent()) return;
        const rejectedBooking = await reconcileBookingStatus(error, booking.id, ['rejected']);
        if (!action.isCurrent()) return;
        if (rejectedBooking) {
          commitBookingDecision(action.booking, 'rejected', rejectedBooking);
          action.complete();
          refreshInBackground();
          return;
        }
        showDialog({
          variant: 'danger',
          title: 'Refus impossible',
          message: getBookingActionErrorMessage(
            error,
            'Impossible de refuser cette réservation pour le moment.',
          ),
        });
      } finally {
        action.finish();
      }
    },
    [beginBookingAction, commitBookingDecision, refreshInBackground, reconcileBookingStatus, rejectBooking, showDialog, speakNavigationMessage],
  );

  const handleConfirmPassengerInterruption = useCallback(
    (booking: Booking) => {
      if (!booking.id || !canRespondToPassengerInterruption(booking) || isConfirmingPassengerInterruption || confirmingInterruptionRef.current) return;

      showDialog({
        variant: 'warning',
        icon: 'walk-outline',
        title: 'Confirmer la descente',
        message: `${booking.passengerName || 'Ce passager'} demande à descendre avant sa destination. Confirmer l'interruption de ${booking.numberOfSeats > 1 ? `sa réservation de ${booking.numberOfSeats} places` : 'sa participation'} ? Les autres réservations ne sont pas interrompues.`,
        actions: [
          { label: 'Annuler', variant: 'ghost' },
          {
            label: 'Confirmer',
            variant: 'primary',
            onPress: async () => {
              if (confirmingInterruptionRef.current || !mountedRef.current) return;
              const action = beginBookingAction(booking, 'interrupt-confirm');
              if (!action) return;
              confirmingInterruptionRef.current = true;
              try {
                const completedBooking = await confirmPassengerTripInterruption(booking.id).unwrap();
                if (!mountedRef.current || !action.isCurrent()) return;
                if (!isPassengerInterruptionResponse(completedBooking, action.booking, 'confirm')) {
                  throw new Error('La descente n’a pas pu être vérifiée. Actualisez les réservations puis réessayez.');
                }
                commitPassengerInterruptionResponse(completedBooking, action.booking);
                routeFetchedRef.current = false;
                routeSignatureRef.current = '';
                // Confirmation is committed: slow/failed reads must not hide the receipt
                // or report a failed confirmation that would invite a duplicate mutation.
                void Promise.allSettled([
                  Promise.resolve().then(() => refetchBookings()),
                  Promise.resolve().then(() => refetchTrip()),
                ]);
                showDialog({
                  variant: 'success',
                  icon: 'checkmark-circle',
                  title: 'Descente confirmée',
                  message: `${booking.passengerName || 'Passager'}\n\n${getDriverInterruptionSettlementMessage(completedBooking)}`,
                });
              } catch (error: any) {
                if (!mountedRef.current || !action.isCurrent()) return;
                showDialog({
                  variant: 'danger',
                  icon: 'alert-circle',
                  title: 'Confirmation impossible',
                  message: getApiErrorMessage(error, "Impossible de confirmer l'interruption."),
                });
              } finally {
                confirmingInterruptionRef.current = false;
                action.finish();
              }
            },
          },
        ],
      });
    },
    [
      confirmPassengerTripInterruption,
      commitPassengerInterruptionResponse,
      beginBookingAction,
      isConfirmingPassengerInterruption,
      refetchBookings,
      refetchTrip,
      routeFetchedRef,
      routeSignatureRef,
      showDialog,
    ],
  );

  const handleRejectPassengerInterruption = useCallback(
    (booking: Booking) => {
      if (!booking.id || !canRespondToPassengerInterruption(booking) || isRejectingPassengerInterruption) return;

      showDialog({
        variant: 'warning',
        icon: 'close-circle-outline',
        title: 'Refuser la descente',
        message: `Refuser la demande de ${booking.passengerName || 'ce passager'} ?`,
        actions: [
          { label: 'Annuler', variant: 'ghost' },
          {
            label: 'Refuser',
            variant: 'danger',
            onPress: async () => {
              const action = beginBookingAction(booking, 'interrupt-reject');
              if (!action) return;
              try {
                const updatedBooking = await rejectPassengerTripInterruption({
                  bookingId: booking.id,
                  reason: 'Refus depuis la navigation conducteur',
                }).unwrap();
                if (!action.isCurrent()) return;
                if (!isPassengerInterruptionResponse(updatedBooking, action.booking, 'reject')) {
                  throw new Error('Le refus n’a pas pu être vérifié. Actualisez les réservations puis réessayez.');
                }
                commitPassengerInterruptionResponse(updatedBooking, action.booking);
                void Promise.allSettled([
                  Promise.resolve().then(() => refetchBookings()),
                  Promise.resolve().then(() => refetchTrip()),
                ]);
                showDialog({
                  variant: 'info',
                  icon: 'information-circle',
                  title: 'Demande refusée',
                  message: `${booking.passengerName || 'Le passager'} sera informé du refus.`,
                });
              } catch (error: any) {
                if (!action.isCurrent()) return;
                showDialog({
                  variant: 'danger',
                  icon: 'alert-circle',
                  title: 'Refus impossible',
                  message: getApiErrorMessage(error, "Impossible de refuser l'interruption."),
                });
              } finally {
                action.finish();
              }
            },
          },
        ],
      });
    },
    [
      isRejectingPassengerInterruption,
      commitPassengerInterruptionResponse,
      beginBookingAction,
      refetchBookings,
      refetchTrip,
      rejectPassengerTripInterruption,
      showDialog,
    ],
  );

  return {
    handleRejectPendingBooking,
    handleAcceptPendingBooking,
    handleRejectPassengerInterruption,
    handleConfirmPassengerInterruption,
  };
}
