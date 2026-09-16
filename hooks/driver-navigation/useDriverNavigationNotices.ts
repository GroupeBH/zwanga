import {
  hasBookingPickupCompleted,
  hasBookingDropoffCompleted,
} from '../../features/driver-navigation/navigationBooking';
import { PICKUP_NOTICE_PRIORITY } from '../../features/driver-navigation/navigationPresentation';
import {
  Waypoint,
  PickupNoticeEventType,
  BookingAutoProgressEvent,
  PickupNotice,
  PickupBypassConfirmation,
  SPEECH_LANGUAGE,
  SPEECH_RATE,
} from '../../features/driver-navigation/navigationModel';
import { useDialog } from '@/components/ui/DialogProvider';
import type { Booking } from '@/types';
import { NavigationSpeech as Speech } from '@/utils/navigationSpeech';
import React, { useCallback } from 'react';

interface Params {
  isMountedRef: React.RefObject<boolean>;
  waypointModalVisibleRef: React.RefObject<boolean>;
  pickupBypassConfirmationRef: React.RefObject<PickupBypassConfirmation | null>;
  presentedWaypointIdsRef: React.RefObject<Set<string>>;
  setActiveWaypoint: React.Dispatch<React.SetStateAction<Waypoint | null>>;
  setWaypointModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  presentedPickupNoticeKeysRef: React.RefObject<Set<string>>;
  highestPickupNoticePriorityRef: React.RefObject<Map<string, number>>;
  pickupNoticeRef: React.RefObject<PickupNotice | null>;
  setPickupNotice: React.Dispatch<React.SetStateAction<PickupNotice | null>>;
  visibleBookings: Booking[] | undefined;
  presentedPassengerBoardedKeysRef: React.RefObject<Set<string>>;
  setPickupNoticeCountdown: React.Dispatch<React.SetStateAction<number | null>>;
  setPickupBypassConfirmation: React.Dispatch<React.SetStateAction<PickupBypassConfirmation | null>>;
  setPickupBypassAction: React.Dispatch<React.SetStateAction<"confirm" | "cancel" | null>>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  presentedPassengerDestinationKeysRef: React.RefObject<Set<string>>;
  presentedPassengerDestinationApproachKeysRef: React.RefObject<Set<string>>;
}

export function useDriverNavigationNotices({
  isMountedRef,
  waypointModalVisibleRef,
  pickupBypassConfirmationRef,
  presentedWaypointIdsRef,
  setActiveWaypoint,
  setWaypointModalVisible,
  presentedPickupNoticeKeysRef,
  highestPickupNoticePriorityRef,
  pickupNoticeRef,
  setPickupNotice,
  visibleBookings,
  presentedPassengerBoardedKeysRef,
  setPickupNoticeCountdown,
  setPickupBypassConfirmation,
  setPickupBypassAction,
  showDialog,
  presentedPassengerDestinationKeysRef,
  presentedPassengerDestinationApproachKeysRef,
}: Params) {
  const presentWaypointModal = useCallback((waypoint: Waypoint) => {
    if (
      !isMountedRef.current ||
      waypoint.completed ||
      waypointModalVisibleRef.current ||
      pickupBypassConfirmationRef.current ||
      presentedWaypointIdsRef.current.has(waypoint.id)
    ) {
      return;
    }

    presentedWaypointIdsRef.current.add(waypoint.id);
    waypointModalVisibleRef.current = true;
    setActiveWaypoint(waypoint);
    setWaypointModalVisible(true);
  }, []);

  const presentPickupNotice = useCallback(
    (event: BookingAutoProgressEvent, waypoint: Waypoint) => {
      if (
        !isMountedRef.current ||
        pickupBypassConfirmationRef.current ||
        !event.bookingId ||
        !['driver_arrived_pickup', 'parties_nearby', 'passenger_ready_pickup'].includes(event.type)
      ) {
        return;
      }

      if (
        waypoint.completed ||
        hasBookingPickupCompleted(waypoint.booking) ||
        hasBookingDropoffCompleted(waypoint.booking)
      ) {
        return;
      }

      const key = `${event.type}:${event.bookingId}`;
      if (presentedPickupNoticeKeysRef.current.has(key)) {
        return;
      }

      const nextType = event.type as PickupNoticeEventType;
      const nextPriority = PICKUP_NOTICE_PRIORITY[nextType];
      const highestPriorityForBooking =
        highestPickupNoticePriorityRef.current.get(event.bookingId) ?? -1;
      if (highestPriorityForBooking >= nextPriority) {
        return;
      }

      const currentNotice = pickupNoticeRef.current;
      if (
        currentNotice?.waypoint.booking.id === event.bookingId &&
        PICKUP_NOTICE_PRIORITY[currentNotice.type] >= nextPriority
      ) {
        return;
      }

      presentedPickupNoticeKeysRef.current.add(key);
      const nextNotice: PickupNotice = {
        type: nextType,
        waypoint,
        distanceMeters: event.distanceMeters,
        detectedAt: event.detectedAt,
        expiresAt: event.expiresAt,
        pickupWaitSeconds: event.pickupWaitSeconds,
      };
      pickupNoticeRef.current = nextNotice;
      highestPickupNoticePriorityRef.current.set(event.bookingId, nextPriority);
      setPickupNotice(nextNotice);

      const passengerName = waypoint.passenger.name || 'Le passager';
      const speech =
        event.type === 'passenger_ready_pickup'
          ? `${passengerName} s'est signalé au point de récupération.`
          : event.type === 'parties_nearby'
            ? `${passengerName} est là et prêt à être embarqué.`
            : `Vous êtes arrivé au point de récupération de ${passengerName}.`;

      void Speech.stop().finally(() => {
        if (!isMountedRef.current) return;
        Speech.speak(speech, { language: 'fr-FR', rate: 0.95 });
      });
    },
    [],
  );

  const getPassengerNameForBooking = useCallback(
    (bookingId: string, waypoint?: Waypoint | null) =>
      waypoint?.passenger.name ||
      visibleBookings?.find((booking) => booking.id === bookingId)?.passengerName ||
      'Le passager',
    [visibleBookings],
  );

  const presentPassengerBoardedNotice = useCallback(
    (event: BookingAutoProgressEvent, waypoint?: Waypoint | null) => {
      if (!isMountedRef.current || event.type !== 'pickup_confirmed' || !event.bookingId) {
        return;
      }

      const key = `pickup_confirmed:${event.bookingId}`;
      if (presentedPassengerBoardedKeysRef.current.has(key)) {
        return;
      }

      presentedPassengerBoardedKeysRef.current.add(key);
      const passengerName = getPassengerNameForBooking(event.bookingId, waypoint);
      setPickupNotice((current) =>
        current?.waypoint.booking.id === event.bookingId ? null : current,
      );
      setPickupNoticeCountdown(null);
      if (pickupBypassConfirmationRef.current?.waypoint.booking.id === event.bookingId) {
        pickupBypassConfirmationRef.current = null;
        setPickupBypassConfirmation(null);
        setPickupBypassAction(null);
      }

      showDialog({
        variant: 'success',
        icon: 'checkmark-circle',
        title: 'Passager embarqu\u00e9',
        message: `${passengerName} a \u00e9t\u00e9 embarqu\u00e9. Vous pouvez continuer vers sa destination.`,
      });

      void Speech.stop().finally(() => {
        if (!isMountedRef.current) return;
        Speech.speak(`${passengerName} a \u00e9t\u00e9 embarqu\u00e9.`, {
          language: SPEECH_LANGUAGE,
          rate: SPEECH_RATE,
        });
      });
    },
    [getPassengerNameForBooking, showDialog],
  );

  const presentPassengerDestinationNotice = useCallback(
    (event: BookingAutoProgressEvent, waypoint?: Waypoint | null) => {
      if (!isMountedRef.current || event.type !== 'dropoff_confirmed' || !event.bookingId) {
        return;
      }

      const key = `dropoff_confirmed:${event.bookingId}`;
      if (presentedPassengerDestinationKeysRef.current.has(key)) {
        return;
      }

      presentedPassengerDestinationKeysRef.current.add(key);
      const passengerName = getPassengerNameForBooking(event.bookingId, waypoint);

      showDialog({
        variant: 'success',
        icon: 'flag',
        title: 'Destination atteinte',
        message: `Nous sommes arriv\u00e9s au point de destination de ${passengerName}.`,
      });

      void Speech.stop().finally(() => {
        if (!isMountedRef.current) return;
        Speech.speak(`Nous sommes arriv\u00e9s au point de destination de ${passengerName}.`, {
          language: SPEECH_LANGUAGE,
          rate: SPEECH_RATE,
        });
      });
    },
    [getPassengerNameForBooking, showDialog],
  );

  const presentPassengerDestinationApproachNotice = useCallback(
    (event: BookingAutoProgressEvent, waypoint?: Waypoint | null) => {
      if (!isMountedRef.current || event.type !== 'passenger_near_destination' || !event.bookingId) {
        return;
      }

      const key = `passenger_near_destination:${event.bookingId}`;
      if (presentedPassengerDestinationApproachKeysRef.current.has(key)) {
        return;
      }

      presentedPassengerDestinationApproachKeysRef.current.add(key);
      const passengerName = getPassengerNameForBooking(event.bookingId, waypoint);
      const roundedDistance =
        typeof event.distanceMeters === 'number' && Number.isFinite(event.distanceMeters)
          ? Math.max(1, Math.round(event.distanceMeters))
          : null;
      const distanceText = roundedDistance ? ` Distance detectée: ${roundedDistance} m.` : '';

      showDialog({
        variant: 'info',
        icon: 'flag',
        title: 'Destination passager proche',
        message: `Le point d'arrivée de ${passengerName} va être atteint.${distanceText}`,
      });

      void Speech.stop().finally(() => {
        if (!isMountedRef.current) return;
        Speech.speak(`Le point d'arrivée de ${passengerName} va être atteint.`, {
          language: SPEECH_LANGUAGE,
          rate: SPEECH_RATE,
        });
      });
    },
    [getPassengerNameForBooking, showDialog],
  );

  return {
    getPassengerNameForBooking,
    presentPickupNotice,
    presentPassengerBoardedNotice,
    presentPassengerDestinationApproachNotice,
    presentPassengerDestinationNotice,
    presentWaypointModal,
  };
}
