import { BookingAutoProgressEvent, PassengerPickupNotice } from '../../features/passenger-navigation/navigationModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { type NavigationCoordinate } from '@/utils/navigation/routeProgress';
import { NavigationSpeech as Speech } from '@/utils/navigationSpeech';
import React, { useCallback, useEffect } from 'react';
import type { Booking } from '@/types';

interface Params {
  isScreenActive: boolean;
  isMountedRef: React.RefObject<boolean>;
  hasPresentedTripCompletedNoticeRef: React.RefObject<boolean>;
  hasPresentedTripDestinationApproachNoticeRef: React.RefObject<boolean>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  pickupNotice: PassengerPickupNotice | null;
  setPickupNoticeCountdown: React.Dispatch<React.SetStateAction<number | null>>;
  hasPresentedArrivalModalRef: React.RefObject<boolean>;
  hasDisplayedDriverNearNotificationRef: React.RefObject<boolean>;
  hasPresentedBoardedNoticeRef: React.RefObject<boolean>;
  hasPresentedDestinationApproachNoticeRef: React.RefObject<boolean>;
  hasPresentedNoShowNoticeRef: React.RefObject<boolean>;
  hasPresentedBoardingUncertainNoticeRef: React.RefObject<boolean>;
  hasObservedPickupStateRef: React.RefObject<boolean>;
  previousPickupStateRef: React.RefObject<boolean>;
  lastAcceptedDriverCoordinateRef: React.RefObject<NavigationCoordinate | null>;
  lastAcceptedDriverTimestampRef: React.RefObject<number | null>;
  lastAcceptedPassengerCoordinateRef: React.RefObject<NavigationCoordinate | null>;
  lastAcceptedPassengerTimestampRef: React.RefObject<number | null>;
  routeSignatureRef: React.RefObject<string>;
  routeFetchedRef: React.RefObject<boolean>;
  lastRouteFetchRef: React.RefObject<number>;
  presentedPickupNoticeKeysRef: React.RefObject<Set<string>>;
  highestPickupNoticePriorityRef: React.RefObject<Map<string, number>>;
  setPickupNotice: React.Dispatch<React.SetStateAction<PassengerPickupNotice | null>>;
  bookingId: string;
  booking: Booking | undefined;
  presentBoardedNotice: () => void;
}

export function usePassengerTripDestinationNotice({
  isScreenActive,
  isMountedRef,
  hasPresentedTripCompletedNoticeRef,
  hasPresentedTripDestinationApproachNoticeRef,
  showDialog,
  pickupNotice,
  setPickupNoticeCountdown,
  hasPresentedArrivalModalRef,
  hasDisplayedDriverNearNotificationRef,
  hasPresentedBoardedNoticeRef,
  hasPresentedDestinationApproachNoticeRef,
  hasPresentedNoShowNoticeRef,
  hasPresentedBoardingUncertainNoticeRef,
  hasObservedPickupStateRef,
  previousPickupStateRef,
  lastAcceptedDriverCoordinateRef,
  lastAcceptedDriverTimestampRef,
  lastAcceptedPassengerCoordinateRef,
  lastAcceptedPassengerTimestampRef,
  routeSignatureRef,
  routeFetchedRef,
  lastRouteFetchRef,
  presentedPickupNoticeKeysRef,
  highestPickupNoticePriorityRef,
  setPickupNotice,
  bookingId,
  booking,
  presentBoardedNotice,
}: Params) {
  const presentTripDestinationNotice = useCallback((event: BookingAutoProgressEvent) => {
    if (
      !isMountedRef.current ||
      (event.type !== 'driver_near_destination' && event.type !== 'driver_arrived_destination')
    ) {
      return;
    }

    const isCompleted = event.type === 'driver_arrived_destination';
    const alreadyPresented = isCompleted
      ? hasPresentedTripCompletedNoticeRef.current
      : hasPresentedTripDestinationApproachNoticeRef.current;
    if (alreadyPresented) {
      return;
    }

    if (isCompleted) {
      hasPresentedTripCompletedNoticeRef.current = true;
    } else {
      hasPresentedTripDestinationApproachNoticeRef.current = true;
    }

    const roundedDistance =
      typeof event.distanceMeters === 'number' && Number.isFinite(event.distanceMeters)
        ? Math.max(1, Math.round(event.distanceMeters))
        : null;
    const distanceText = roundedDistance ? ` Distance détectée: ${roundedDistance} m.` : '';
    const isReachedZone = !isCompleted && roundedDistance !== null && roundedDistance <= 10;

    showDialog({
      variant: isCompleted ? 'success' : 'info',
      icon: 'flag',
      title: isCompleted
        ? 'Trajet terminé'
        : isReachedZone
          ? 'Destination finale atteinte'
          : 'Destination finale proche',
      message: isCompleted
        ? `Le trajet est terminé automatiquement.${distanceText}`
        : isReachedZone
          ? `Le point d'arrivée du trajet est atteint. Le trajet sera terminé automatiquement dans 10 minutes si le véhicule reste sur place.${distanceText}`
          : `Le point d'arrivée du trajet est presque atteint.${distanceText}`,
    });

    void Speech.stop().finally(() => {
      if (!isMountedRef.current) return;
      Speech.speak(
        isCompleted
          ? 'Le trajet est terminé automatiquement.'
          : isReachedZone
            ? "Le point d'arrivée du trajet est atteint."
            : "Le point d'arrivée du trajet est presque atteint.",
        {
          language: 'fr-FR',
          rate: 0.95,
        },
      );
    });
  }, [showDialog, isMountedRef, hasPresentedTripCompletedNoticeRef, hasPresentedTripDestinationApproachNoticeRef]);

  useEffect(() => {
    if (!isScreenActive || !pickupNotice?.expiresAt) {
      setPickupNoticeCountdown(null);
      return;
    }

    const expiresAt = new Date(pickupNotice.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) {
      setPickupNoticeCountdown(null);
      return;
    }

    let interval: ReturnType<typeof setInterval> | undefined;
    const updateCountdown = () => {
      const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setPickupNoticeCountdown(remainingSeconds);
      if (remainingSeconds === 0 && interval) clearInterval(interval);
    };

    updateCountdown();
    if (expiresAt > Date.now()) interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [isScreenActive, pickupNotice?.expiresAt, setPickupNoticeCountdown]);

  useEffect(() => {
    hasPresentedArrivalModalRef.current = false;
    hasDisplayedDriverNearNotificationRef.current = false;
    hasPresentedBoardedNoticeRef.current = false;
    hasPresentedDestinationApproachNoticeRef.current = false;
    hasPresentedTripDestinationApproachNoticeRef.current = false;
    hasPresentedTripCompletedNoticeRef.current = false;
    hasPresentedNoShowNoticeRef.current = false;
    hasPresentedBoardingUncertainNoticeRef.current = false;
    hasObservedPickupStateRef.current = false;
    previousPickupStateRef.current = false;
    lastAcceptedDriverCoordinateRef.current = null;
    lastAcceptedDriverTimestampRef.current = null;
    lastAcceptedPassengerCoordinateRef.current = null;
    lastAcceptedPassengerTimestampRef.current = null;
    routeSignatureRef.current = '';
    routeFetchedRef.current = false;
    lastRouteFetchRef.current = 0;
    presentedPickupNoticeKeysRef.current.clear();
    highestPickupNoticePriorityRef.current.clear();
    setPickupNotice(null);
    setPickupNoticeCountdown(null);
  }, [bookingId, hasPresentedArrivalModalRef, hasDisplayedDriverNearNotificationRef,
    hasPresentedBoardedNoticeRef, hasPresentedDestinationApproachNoticeRef,
    hasPresentedTripDestinationApproachNoticeRef, hasPresentedTripCompletedNoticeRef,
    hasPresentedNoShowNoticeRef, hasPresentedBoardingUncertainNoticeRef,
    hasObservedPickupStateRef, previousPickupStateRef, lastAcceptedDriverCoordinateRef,
    lastAcceptedDriverTimestampRef, lastAcceptedPassengerCoordinateRef,
    lastAcceptedPassengerTimestampRef, routeSignatureRef, routeFetchedRef,
    lastRouteFetchRef, presentedPickupNoticeKeysRef, highestPickupNoticePriorityRef,
    setPickupNotice, setPickupNoticeCountdown]);

  useEffect(() => {
    if (!booking?.id) {
      return;
    }

    const isPickedUp = Boolean(
      booking?.pickedUp || booking?.pickedUpConfirmedByPassenger,
    );
    const isDroppedOff = Boolean(
      booking?.droppedOff || booking?.droppedOffConfirmedByPassenger,
    );

    if (isPickedUp) {
      setPickupNotice(null);
      setPickupNoticeCountdown(null);

      if (
        hasObservedPickupStateRef.current &&
        !previousPickupStateRef.current &&
        !isDroppedOff
      ) {
        presentBoardedNotice();
      }
    }

    hasObservedPickupStateRef.current = true;
    previousPickupStateRef.current = isPickedUp;
  }, [
    booking?.droppedOff,
    booking?.droppedOffConfirmedByPassenger,
    booking?.id,
    booking?.pickedUp,
    booking?.pickedUpConfirmedByPassenger,
    presentBoardedNotice,
    hasObservedPickupStateRef,
    previousPickupStateRef,
    setPickupNotice,
    setPickupNoticeCountdown,
  ]);

  return {
    presentTripDestinationNotice,
  };
}
