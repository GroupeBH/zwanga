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
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PassengerInterruptionFarePreview } from '@/features/passenger-navigation/PassengerInterruptionFarePreview';

interface Params {
  isScreenActive: boolean;
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
  commitDriverInterruptionResponse: (trip: Trip, requestId: string) => void;
  rejectDriverTripInterruption: ReturnType<typeof useRejectDriverTripInterruptionMutation>[0];
}

export function usePassengerNavigationInterruption({
  isScreenActive,
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
  commitDriverInterruptionResponse,
  rejectDriverTripInterruption,
}: Params) {
  const sendingInterruptionRef = useRef(false);
  const sendingResponseRef = useRef(false);
  const respondedRequestRef = useRef<string | null>(null);
  const [acknowledgedResponse, setAcknowledgedResponse] = useState<{ key: string; status: 'confirmed' | 'rejected' } | null>(null);
  const mounted = useRef(true);
  const requestId = trip?.interruptionRequest?.id;
  const responseKey = `${tripId}:${booking?.id}:${booking?.passengerId}:${requestId}`;
  const lifecycle = useMemo(() => ({ bookingId: booking?.id, passengerId: booking?.passengerId, tripId, requestId, isScreenActive }),
    [booking?.id, booking?.passengerId, tripId, requestId, isScreenActive]);
  const currentLifecycle = useRef(lifecycle);
  currentLifecycle.current = lifecycle;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isCurrent = useCallback(() => mounted.current && isScreenActive && currentLifecycle.current === lifecycle, [isScreenActive, lifecycle]);
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
  const serverConfirmation = pendingDriverInterruptionRequest?.confirmations.find(
    (confirmation) =>
      confirmation.bookingId === booking?.id && confirmation.passengerId === booking?.passengerId,
  );
  // A stale read must not restore active buttons after the server acknowledged
  // this reservation's response. This UI acknowledgement is scoped to one request.
  const driverInterruptionConfirmation = serverConfirmation?.status === 'pending' && acknowledgedResponse?.key === responseKey
    ? { ...serverConfirmation, status: acknowledgedResponse.status }
    : serverConfirmation;
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
      driverInterruptionConfirmation?.status === 'pending' &&
      !hasRespondedToDriverInterruption &&
      !booking?.droppedOff &&
      !booking?.droppedOffConfirmedByPassenger,
  );

  const sendPassengerInterruptionRequest = useCallback(
    async (reason: TripInterruptionReason) => {
      if (!booking?.id || sendingInterruptionRef.current || !isCurrent() || !canRequestPassengerInterruption) return;
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
        if (!isCurrent()) return;
        await Promise.all([refetchBooking(), refetchTrip()]);
        if (!isCurrent()) return;
        showDialog({
          variant: 'success',
          title: 'Demande envoyée',
          message: 'Le conducteur doit confirmer avant que votre trajet soit interrompu.',
        });
      } catch (error: any) {
        if (!isCurrent()) return;
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
      isCurrent,
      canRequestPassengerInterruption,
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
    if (!tripId || !booking?.id || !requestId || booking.tripId !== tripId || !canRespondToDriverInterruption || !isCurrent() || sendingResponseRef.current || respondedRequestRef.current === responseKey) return;
    sendingResponseRef.current = true;

    try {
      const response = await confirmDriverTripInterruption({ tripId, bookingId: booking.id }).unwrap();
      if (!isCurrent()) return;
      const confirmation = response?.interruptionRequest?.confirmations.find(item =>
        item.bookingId === booking.id && item.passengerId === booking.passengerId);
      if (response?.id !== tripId || response.interruptionRequest?.id !== requestId || confirmation?.status !== 'confirmed') {
        throw new Error('La confirmation n’a pas pu être vérifiée. Actualisez le trajet puis réessayez.');
      }
      respondedRequestRef.current = responseKey;
      setAcknowledgedResponse({ key: responseKey, status: 'confirmed' });
      commitDriverInterruptionResponse(response, requestId);
      // Reads may fail or remain slow after a committed mutation. They must not
      // keep the action locked or report that the already-confirmed stop failed.
      void Promise.allSettled([
        Promise.resolve().then(() => refetchBooking()),
        Promise.resolve().then(() => refetchTrip()),
      ]);
    } catch (error: any) {
      if (!isCurrent()) return;
      showDialog({
        variant: 'danger',
        title: 'Confirmation impossible',
        message: getApiErrorMessage(error, "Impossible de confirmer l'interruption du trajet."),
      });
    } finally { sendingResponseRef.current = false; }
  }, [
    booking?.id,
    booking?.tripId, booking?.passengerId, canRespondToDriverInterruption, isCurrent,
    commitDriverInterruptionResponse, requestId, responseKey,
    confirmDriverTripInterruption,
    refetchBooking,
    refetchTrip,
    showDialog,
    tripId,
  ]);

  const handleRejectDriverInterruption = useCallback(async () => {
    if (!tripId || !booking?.id || !requestId || booking.tripId !== tripId || !canRespondToDriverInterruption || !isCurrent() || sendingResponseRef.current || respondedRequestRef.current === responseKey) return;
    sendingResponseRef.current = true;

    try {
      const response = await rejectDriverTripInterruption({
        tripId,
        bookingId: booking.id,
        reason: "Le passager refuse l'interruption du trajet.",
      }).unwrap();
      if (!isCurrent()) return;
      if (response?.id !== tripId) throw new Error('Votre réponse n’a pas pu être vérifiée. Actualisez le trajet puis réessayez.');
      respondedRequestRef.current = responseKey;
      setAcknowledgedResponse({ key: responseKey, status: 'rejected' });
      commitDriverInterruptionResponse(response, requestId);
      void Promise.allSettled([
        Promise.resolve().then(() => refetchBooking()),
        Promise.resolve().then(() => refetchTrip()),
      ]);
      showDialog({
        variant: 'info',
        title: 'Réponse envoyée',
        message: 'Votre refus a été transmis au conducteur.',
      });
    } catch (error: any) {
      if (!isCurrent()) return;
      showDialog({
        variant: 'danger',
        title: 'Refus impossible',
        message: getApiErrorMessage(error, "Impossible d'envoyer votre refus."),
      });
    } finally { sendingResponseRef.current = false; }
  }, [
    booking?.id,
    booking?.tripId, canRespondToDriverInterruption, isCurrent,
    commitDriverInterruptionResponse, requestId, responseKey,
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
