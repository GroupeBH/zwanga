import {
  Waypoint,
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
import { useDriverPickupNoticeQueue } from './useDriverPickupNoticeQueue';

interface Params {
  tripId: string;
  isScreenActive: boolean;
  pickupNotice: PickupNotice | null;
  pickupBypassConfirmation: PickupBypassConfirmation | null;
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
  tripId, isScreenActive, pickupNotice, pickupBypassConfirmation,
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
  }, [isMountedRef, pickupBypassConfirmationRef, presentedWaypointIdsRef, setActiveWaypoint, setWaypointModalVisible, waypointModalVisibleRef]);

  const presentPickupNotice = useDriverPickupNoticeQueue({ tripId, isScreenActive, pickupNotice, pickupBypassConfirmation,
    isMountedRef, pickupBypassConfirmationRef, presentedPickupNoticeKeysRef, highestPickupNoticePriorityRef,
    pickupNoticeRef, setPickupNotice, setPickupNoticeCountdown, visibleBookings });

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
      if (pickupNoticeRef.current?.waypoint.booking.id === event.bookingId) {
        pickupNoticeRef.current = null;
        setPickupNotice(null);
        setPickupNoticeCountdown(null);
      }
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
    [getPassengerNameForBooking, showDialog, isMountedRef, pickupBypassConfirmationRef, pickupNoticeRef,
      presentedPassengerBoardedKeysRef, setPickupBypassAction, setPickupBypassConfirmation, setPickupNotice, setPickupNoticeCountdown],
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
    [getPassengerNameForBooking, showDialog, isMountedRef, presentedPassengerDestinationKeysRef],
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
    [getPassengerNameForBooking, showDialog, isMountedRef, presentedPassengerDestinationApproachKeysRef],
  );

  return {
    showInformation: showDialog,
    getPassengerNameForBooking,
    presentPickupNotice,
    presentPassengerBoardedNotice,
    presentPassengerDestinationApproachNotice,
    presentPassengerDestinationNotice,
    presentWaypointModal,
  };
}
