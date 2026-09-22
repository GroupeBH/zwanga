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

interface Params {
  setProcessingBookingId: React.Dispatch<React.SetStateAction<string | null>>;
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
  routeSignatureRef: React.RefObject<string>;
  isRejectingPassengerInterruption: boolean;
  rejectPassengerTripInterruption: ReturnType<typeof useRejectPassengerTripInterruptionMutation>[0];
}

export function useDriverBookingActions({
  setProcessingBookingId,
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
  const handleAcceptPendingBooking = useCallback(
    async (booking: Booking) => {
      setProcessingBookingId(booking.id);
      try {
        await acceptBooking(booking.id).unwrap();
        rememberAcceptedBooking(booking.id);
        lastRouteFetchTimeRef.current = 0;
        routeFetchedRef.current = false;
        await Promise.all([refetchBookings(), refetchTrip()]);
        void speakNavigationMessage(
          `${booking.passengerName || 'Passager'} accepte. Recalcul de l'itinéraire.`,
          { force: true },
        );
      } catch (error: any) {
        const acceptedBooking = await reconcileBookingStatus(error, booking.id, ['accepted']);
        if (acceptedBooking) {
          rememberAcceptedBooking(booking.id);
          await Promise.all([refetchBookings(), refetchTrip()]);
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
        setProcessingBookingId(null);
      }
    },
    [acceptBooking, lastRouteFetchTimeRef, reconcileBookingStatus, refetchBookings, refetchTrip,
      rememberAcceptedBooking, routeFetchedRef, setProcessingBookingId, showDialog, speakNavigationMessage],
  );

  const handleRejectPendingBooking = useCallback(
    async (booking: Booking) => {
      setProcessingBookingId(booking.id);
      try {
        await rejectBooking({
          id: booking.id,
          reason: 'Refus depuis la navigation conducteur',
        }).unwrap();
        await Promise.all([refetchBookings(), refetchTrip()]);
        void speakNavigationMessage(
          `${booking.passengerName || 'Passager'} refuse.`,
          { force: true },
        );
      } catch (error: any) {
        const rejectedBooking = await reconcileBookingStatus(error, booking.id, ['rejected']);
        if (rejectedBooking) {
          await Promise.all([refetchBookings(), refetchTrip()]);
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
        setProcessingBookingId(null);
      }
    },
    [reconcileBookingStatus, refetchBookings, refetchTrip, rejectBooking, setProcessingBookingId, showDialog, speakNavigationMessage],
  );

  const handleConfirmPassengerInterruption = useCallback(
    (booking: Booking) => {
      if (!booking.id || isConfirmingPassengerInterruption || confirmingInterruptionRef.current) return;

      showDialog({
        variant: 'warning',
        icon: 'walk-outline',
        title: 'Confirmer la descente',
        message: `${booking.passengerName || 'Ce passager'} demande à descendre avant sa destination. Confirmer l'interruption de sa participation ?`,
        actions: [
          { label: 'Annuler', variant: 'ghost' },
          {
            label: 'Confirmer',
            variant: 'primary',
            onPress: async () => {
              if (confirmingInterruptionRef.current || !mountedRef.current) return;
              confirmingInterruptionRef.current = true;
              setProcessingBookingId(booking.id);
              try {
                const completedBooking = await confirmPassengerTripInterruption(booking.id).unwrap();
                if (!mountedRef.current) return;
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
                  message: getDriverInterruptionSettlementMessage(completedBooking),
                });
              } catch (error: any) {
                if (!mountedRef.current) return;
                showDialog({
                  variant: 'danger',
                  icon: 'alert-circle',
                  title: 'Confirmation impossible',
                  message: getApiErrorMessage(error, "Impossible de confirmer l'interruption."),
                });
              } finally {
                confirmingInterruptionRef.current = false;
                if (mountedRef.current) setProcessingBookingId(null);
              }
            },
          },
        ],
      });
    },
    [
      confirmPassengerTripInterruption,
      isConfirmingPassengerInterruption,
      refetchBookings,
      refetchTrip,
      routeFetchedRef,
      routeSignatureRef,
      setProcessingBookingId,
      showDialog,
    ],
  );

  const handleRejectPassengerInterruption = useCallback(
    (booking: Booking) => {
      if (!booking.id || isRejectingPassengerInterruption) return;

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
              setProcessingBookingId(booking.id);
              try {
                await rejectPassengerTripInterruption({
                  bookingId: booking.id,
                  reason: 'Refus depuis la navigation conducteur',
                }).unwrap();
                await Promise.all([refetchBookings(), refetchTrip()]);
                showDialog({
                  variant: 'info',
                  icon: 'information-circle',
                  title: 'Demande refusée',
                  message: 'Le passager sera informé du refus.',
                });
              } catch (error: any) {
                showDialog({
                  variant: 'danger',
                  icon: 'alert-circle',
                  title: 'Refus impossible',
                  message: getApiErrorMessage(error, "Impossible de refuser l'interruption."),
                });
              } finally {
                setProcessingBookingId(null);
              }
            },
          },
        ],
      });
    },
    [
      isRejectingPassengerInterruption,
      refetchBookings,
      refetchTrip,
      rejectPassengerTripInterruption,
      setProcessingBookingId,
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
