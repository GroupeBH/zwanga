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
import { passengerPickupMessage, pickupVehicleReminder } from '@/features/navigation/pickupAwareness';
import * as Location from 'expo-location';
import React, { useCallback, useRef } from 'react';
import type { Booking, Trip } from '@/types';

interface Params {
  isScreenActive: boolean;
  trip: Trip | undefined;
  isMountedRef: React.RefObject<boolean>;
  hasPresentedArrivalModalRef: React.RefObject<boolean>;
  refetchBooking: ReturnType<typeof useGetBookingByIdQuery>['refetch'];
  hasPresentedNoShowNoticeRef: React.RefObject<boolean>;
  setPickupNotice: React.Dispatch<React.SetStateAction<PassengerPickupNotice | null>>;
  setPickupNoticeCountdown: React.Dispatch<React.SetStateAction<number | null>>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  showNotice: ReturnType<typeof useDialog>['showDialog'];
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
  isScreenActive,
  trip,
  isMountedRef,
  hasPresentedArrivalModalRef,
  refetchBooking,
  hasPresentedNoShowNoticeRef,
  setPickupNotice,
  setPickupNoticeCountdown,
  showDialog,
  showNotice,
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
  const pickupContext = useRef({ bookingId, isScreenActive, booking });
  pickupContext.current = { bookingId, isScreenActive, booking };
  const latestPickupEvent = useRef<BookingAutoProgressEvent | null>(null);
  if (!isScreenActive) latestPickupEvent.current = null;
  const vehicleReminder = pickupVehicleReminder(trip ?? booking?.trip);
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
    const context = pickupContext.current;
    const currentBooking = context.booking;
    if (!isMountedRef.current || !context.isScreenActive || event.bookingId !== context.bookingId ||
      !currentBooking || event.tripId !== currentBooking.tripId ||
      !['accepted', 'no_show'].includes(currentBooking.status) ||
      !['driver_near_pickup', 'driver_arrived_pickup', 'parties_nearby'].includes(event.type) ||
      currentBooking.pickedUp || currentBooking.pickedUpConfirmedByPassenger ||
      currentBooking.droppedOff || currentBooking.droppedOffConfirmedByPassenger) return;

    const key = `${event.type}:${event.bookingId}`;
    if (presentedPickupNoticeKeysRef.current.has(key)) return;
    const nextType = event.type as PassengerPickupNoticeType;
    const nextPriority = PASSENGER_PICKUP_NOTICE_PRIORITY[nextType];
    const highest = highestPickupNoticePriorityRef.current.get(event.bookingId!) ?? -1;
    // Readiness at the meeting point can precede the driver's approach.
    if (nextType === 'driver_near_pickup'
      ? presentedPickupNoticeKeysRef.current.has(`driver_arrived_pickup:${event.bookingId}`)
      : highest >= nextPriority) return;

    presentedPickupNoticeKeysRef.current.add(key);
    highestPickupNoticePriorityRef.current.set(event.bookingId!, Math.max(highest, nextPriority));
    const message = passengerPickupMessage(nextType, event.distanceMeters, vehicleReminder);
    if (nextType === 'driver_near_pickup' && !hasDisplayedDriverNearNotificationRef.current) {
      hasDisplayedDriverNearNotificationRef.current = true;
      void displayNotification('Votre conducteur approche', message, {
        type: nextType, bookingId: event.bookingId, tripId: event.tripId,
      }).catch(() => { /* The in-app notice remains visible if notifications are unavailable. */ });
    }
    setPickupNotice({ type: nextType, distanceMeters: event.distanceMeters, detectedAt: event.detectedAt,
      expiresAt: event.expiresAt, pickupWaitSeconds: event.pickupWaitSeconds });
    latestPickupEvent.current = event;
    void Speech.stop().then(() => {
      const current = pickupContext.current;
      if (latestPickupEvent.current !== event || !isMountedRef.current || !current.isScreenActive || current.bookingId !== event.bookingId ||
        current.booking?.pickedUp || current.booking?.pickedUpConfirmedByPassenger ||
        current.booking?.droppedOff || current.booking?.droppedOffConfirmedByPassenger) return;
      Speech.speak(message, { language: 'fr-FR', rate: 0.95 });
    }).catch(() => { /* Voice is optional. */ });
  }, [isMountedRef, vehicleReminder, presentedPickupNoticeKeysRef, highestPickupNoticePriorityRef,
    hasDisplayedDriverNearNotificationRef, setPickupNotice]);

  const presentBoardedNotice = useCallback(() => {
    if (!isMountedRef.current || hasPresentedBoardedNoticeRef.current) {
      return;
    }

    hasPresentedBoardedNoticeRef.current = true;
    setPickupNotice(null);
    setPickupNoticeCountdown(null);

    showNotice({
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
  }, [showNotice]);

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
      showNotice({
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
  }, [booking?.paymentAmount, booking?.paymentMode, booking?.paymentStatus, showNotice]);

  return {
    presentBoardedNotice,
    presentPickupNotice,
    presentNoShowNotice,
    presentBoardingUncertainNotice,
    presentDestinationApproachNotice,
    presentArrivalModal,
  };
}
