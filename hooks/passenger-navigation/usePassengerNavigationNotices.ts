import {
  BookingAutoProgressEvent,
  PassengerPickupNoticeType,
  PASSENGER_PICKUP_NOTICE_PRIORITY,
  PassengerPickupNotice,
} from '../../features/passenger-navigation/navigationModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { displayNotification } from '@/services/pushNotifications';
import { stopPassengerBackgroundLocationTracking } from '@/services/passengerBackgroundLocationTask';
import { useGetBookingByIdQuery } from '@/store/api/bookingApi';
import { NavigationSpeech as Speech } from '@/utils/navigationSpeech';
import * as Location from 'expo-location';
import React, { useCallback } from 'react';
import type { Booking } from '@/types';

interface Params {
  isMountedRef: React.RefObject<boolean>;
  hasPresentedArrivalModalRef: React.RefObject<boolean>;
  refetchBooking: ReturnType<typeof useGetBookingByIdQuery>['refetch'];
  hasPresentedNoShowNoticeRef: React.RefObject<boolean>;
  setPickupNotice: React.Dispatch<React.SetStateAction<PassengerPickupNotice | null>>;
  setPickupNoticeCountdown: React.Dispatch<React.SetStateAction<number | null>>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  hasPresentedBoardingUncertainNoticeRef: React.RefObject<boolean>;
  passengerLocationSubscriptionRef: React.RefObject<Location.LocationSubscription | null>;
  bookingId: string;
  navigateBackSafely: () => void;
  booking: Booking | undefined;
  presentedPickupNoticeKeysRef: React.RefObject<Set<string>>;
  highestPickupNoticePriorityRef: React.RefObject<Map<string, number>>;
  hasDisplayedDriverNearNotificationRef: React.RefObject<boolean>;
  hasPresentedBoardedNoticeRef: React.RefObject<boolean>;
  hasPresentedDestinationApproachNoticeRef: React.RefObject<boolean>;
}

export function usePassengerNavigationNotices({
  isMountedRef,
  hasPresentedArrivalModalRef,
  refetchBooking,
  hasPresentedNoShowNoticeRef,
  setPickupNotice,
  setPickupNoticeCountdown,
  showDialog,
  hasPresentedBoardingUncertainNoticeRef,
  passengerLocationSubscriptionRef,
  bookingId,
  navigateBackSafely,
  booking,
  presentedPickupNoticeKeysRef,
  highestPickupNoticePriorityRef,
  hasDisplayedDriverNearNotificationRef,
  hasPresentedBoardedNoticeRef,
  hasPresentedDestinationApproachNoticeRef,
}: Params) {
  const presentArrivalModal = useCallback(() => {
    if (!isMountedRef.current || hasPresentedArrivalModalRef.current) return;

    hasPresentedArrivalModalRef.current = true;
    void refetchBooking();
    void Speech.stop().finally(() => {
      if (!isMountedRef.current) return;
      Speech.speak(
        "Vous êtes arrivé à votre destination. L'arrivée se confirme automatiquement.",
        { language: 'fr-FR', rate: 0.95 },
      );
    });
  }, [refetchBooking]);

  const presentNoShowNotice = useCallback(() => {
    if (!isMountedRef.current || hasPresentedNoShowNoticeRef.current) return;

    hasPresentedNoShowNoticeRef.current = true;
    setPickupNotice(null);
    setPickupNoticeCountdown(null);
    void Speech.stop();
    showDialog({
      variant: 'info',
      icon: 'person-remove',
      title: 'Non-embarquement détecté',
      message:
        "Le conducteur s'est éloigné du point de rendez-vous sans que votre prise en charge soit détectée. Aucun paiement n'a été effectué. Le partage de position reste actif pendant le trajet : si vous rejoignez le véhicule plus tard, Zwanga pourra valider automatiquement votre embarquement.",
      actions: [
        {
          label: 'Continuer le suivi',
          variant: 'primary',
        },
      ],
    });
  }, [showDialog]);

  const presentBoardingUncertainNotice = useCallback(() => {
    if (!isMountedRef.current || hasPresentedBoardingUncertainNoticeRef.current) return;

    hasPresentedBoardingUncertainNoticeRef.current = true;
    passengerLocationSubscriptionRef.current?.remove();
    passengerLocationSubscriptionRef.current = null;
    setPickupNotice(null);
    setPickupNoticeCountdown(null);
    void stopPassengerBackgroundLocationTracking(bookingId);
    void Speech.stop();
    showDialog({
      variant: 'warning',
      icon: 'help-circle',
      title: 'Embarquement non confirmé',
      message:
        "Le trajet est arrivé à destination sans preuve GPS suffisante de votre embarquement. La réservation est clôturée et aucun paiement n'a été effectué.",
      actions: [
        {
          label: 'Retour',
          variant: 'primary',
          onPress: navigateBackSafely,
        },
      ],
    });
  }, [bookingId, navigateBackSafely, showDialog]);

  const presentPickupNotice = useCallback((event: BookingAutoProgressEvent) => {
    if (
      !isMountedRef.current ||
      !event.bookingId ||
      !['driver_near_pickup', 'driver_arrived_pickup', 'parties_nearby'].includes(event.type)
    ) {
      return;
    }

    if (
      booking?.pickedUp ||
      booking?.pickedUpConfirmedByPassenger ||
      booking?.droppedOff ||
      booking?.droppedOffConfirmedByPassenger
    ) {
      return;
    }

    const key = `${event.type}:${event.bookingId}`;
    if (presentedPickupNoticeKeysRef.current.has(key)) {
      return;
    }

    const nextType = event.type as PassengerPickupNoticeType;
    const nextPriority = PASSENGER_PICKUP_NOTICE_PRIORITY[nextType];
    const highestPriorityForBooking =
      highestPickupNoticePriorityRef.current.get(event.bookingId) ?? -1;
    if (highestPriorityForBooking >= nextPriority) {
      return;
    }

    presentedPickupNoticeKeysRef.current.add(key);
    highestPickupNoticePriorityRef.current.set(event.bookingId, nextPriority);
    if (event.type === 'driver_near_pickup' && !hasDisplayedDriverNearNotificationRef.current) {
      hasDisplayedDriverNearNotificationRef.current = true;
      void displayNotification(
        'Conducteur bient\u00f4t l\u00e0',
        'Le conducteur sera bient\u00f4t l\u00e0. Pr\u00e9parez-vous \u00e0 rejoindre le point de r\u00e9cup\u00e9ration.',
        {
          type: 'driver_near_pickup',
          bookingId: event.bookingId,
          tripId: event.tripId,
        },
      );
    }
    setPickupNotice({
      type: nextType,
      distanceMeters: event.distanceMeters,
      detectedAt: event.detectedAt,
      expiresAt: event.expiresAt,
      pickupWaitSeconds: event.pickupWaitSeconds,
    });
    const speech =
      event.type === 'driver_near_pickup'
        ? 'Le conducteur sera bient\u00f4t l\u00e0. Pr\u00e9parez-vous \u00e0 rejoindre le point de r\u00e9cup\u00e9ration.'
        : event.type === 'parties_nearby'
          ? 'Vous \u00eates au point de r\u00e9cup\u00e9ration. La prise en charge sera confirm\u00e9e automatiquement.'
          : 'Le conducteur est arriv\u00e9 au point de r\u00e9cup\u00e9ration. La prise en charge sera confirm\u00e9e automatiquement.';

    void Speech.stop().finally(() => {
      if (!isMountedRef.current) return;
      Speech.speak(speech, { language: 'fr-FR', rate: 0.95 });
    });
  }, [
    booking?.droppedOff,
    booking?.droppedOffConfirmedByPassenger,
    booking?.pickedUp,
    booking?.pickedUpConfirmedByPassenger,
  ]);

  const presentBoardedNotice = useCallback(() => {
    if (!isMountedRef.current || hasPresentedBoardedNoticeRef.current) {
      return;
    }

    hasPresentedBoardedNoticeRef.current = true;
    setPickupNotice(null);
    setPickupNoticeCountdown(null);

    showDialog({
      variant: 'success',
      icon: 'checkmark-circle',
      title: 'Prise en charge confirm\u00e9e',
      message: 'Votre prise en charge est confirm\u00e9e. Vous \u00eates maintenant en route vers votre destination.',
    });

    void Speech.stop().finally(() => {
      if (!isMountedRef.current) return;
      Speech.speak('Votre prise en charge est confirm\u00e9e.', {
        language: 'fr-FR',
        rate: 0.95,
      });
    });
  }, [showDialog]);

  const presentDestinationApproachNotice = useCallback((event: BookingAutoProgressEvent) => {
    if (
      !isMountedRef.current ||
      event.type !== 'passenger_near_destination' ||
      hasPresentedDestinationApproachNoticeRef.current
    ) {
      return;
    }

    hasPresentedDestinationApproachNoticeRef.current = true;
    const roundedDistance =
      typeof event.distanceMeters === 'number' && Number.isFinite(event.distanceMeters)
        ? Math.max(1, Math.round(event.distanceMeters))
        : null;
    const distanceText = roundedDistance ? ` Distance détectée: ${roundedDistance} m.` : '';

    const usesEarlyPayment = ['electronic', 'points'].includes(booking?.paymentMode ?? '') &&
      booking?.paymentStatus !== 'succeeded' && Number(booking?.paymentAmount) > 0;
    // Keep the voice notice, but do not stack an informational modal over the payment sheet.
    if (!usesEarlyPayment) {
      showDialog({
        variant: 'info',
        icon: 'flag',
        title: 'Votre arrivée approche',
        message: `Votre point d'arrivée va être atteint.${distanceText}`,
      });
    }

    void Speech.stop().finally(() => {
      if (!isMountedRef.current) return;
      Speech.speak("Votre point d'arrivée va être atteint.", {
        language: 'fr-FR',
        rate: 0.95,
      });
    });
  }, [booking?.paymentAmount, booking?.paymentMode, booking?.paymentStatus, showDialog]);

  return {
    presentBoardedNotice,
    presentPickupNotice,
    presentNoShowNotice,
    presentBoardingUncertainNotice,
    presentDestinationApproachNotice,
    presentArrivalModal,
  };
}
