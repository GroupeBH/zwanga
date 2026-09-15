import type { NavigationCoordinate } from '@/utils/navigation/routeProgress';
import {
  Waypoint,
  PickupNotice,
  PickupBypassConfirmation,
  TripEndNotice,
} from '../../features/driver-navigation/navigationModel';
import * as Location from 'expo-location';
import { NavigationSpeech as Speech } from '@/utils/navigationSpeech';
import React, { useCallback, useEffect } from 'react';
import type { Router } from 'expo-router';

interface Params {
  cancelRouteRequest: () => void;
  cancelLocationRequest: () => void;
  stopDriverMarkerAnimation: () => void;
  recalcRouteTimeoutRef: React.RefObject<NodeJS.Timeout | null>;
  locationSubscription: React.RefObject<Location.LocationSubscription | null>;
  backgroundDisclosureResolverRef: React.RefObject<((accepted: boolean) => void) | null>;
  offRouteSampleCountRef: React.RefObject<number>;
  isReroutingRef: React.RefObject<boolean>;
  hasFetchedInitialDriverRouteRef: React.RefObject<boolean>;
  autoCompletingTripRef: React.RefObject<boolean>;
  lastAcceptedDriverCoordinateRef: React.RefObject<NavigationCoordinate | null>;
  lastAcceptedDriverTimestampRef: React.RefObject<number | null>;
  lastTripCompletionCheckCoordinateRef: React.RefObject<NavigationCoordinate | null>;
  lastBackgroundCheckpointAtRef: React.RefObject<number>;
  isRestCompletionCheckRunningRef: React.RefObject<boolean>;
  lastRestCompletionCheckAtRef: React.RefObject<number>;
  completedDuringInactiveCandidateRef: React.RefObject<boolean>;
  previousTripStatusRef: React.RefObject<TripStatus | null>;
  skippedPickupBookingIdsRef: React.RefObject<ReadonlySet<string>>;
  pickupClosestDistanceMetersRef: React.RefObject<Map<string, number>>;
  presentedPickupBypassBookingIdsRef: React.RefObject<Set<string>>;
  tripDestinationNearSinceMsRef: React.RefObject<number | null>;
  setIsReroutingRoute: React.Dispatch<React.SetStateAction<boolean>>;
  setRouteDistanceMeters: React.Dispatch<React.SetStateAction<number | null>>;
  setRouteDurationSeconds: React.Dispatch<React.SetStateAction<number | null>>;
  setBackgroundDisclosureVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setSecurityModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setPickupNotice: React.Dispatch<React.SetStateAction<PickupNotice | null>>;
  setPickupNoticeCountdown: React.Dispatch<React.SetStateAction<number | null>>;
  pickupBypassConfirmationRef: React.RefObject<PickupBypassConfirmation | null>;
  setPickupBypassConfirmation: React.Dispatch<React.SetStateAction<PickupBypassConfirmation | null>>;
  setPickupBypassAction: React.Dispatch<React.SetStateAction<"cancel" | "confirm" | null>>;
  tripEndNoticeRef: React.RefObject<TripEndNotice | null>;
  setTripEndNotice: React.Dispatch<React.SetStateAction<TripEndNotice | null>>;
  waypointModalVisibleRef: React.RefObject<boolean>;
  setWaypointModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setPassengersPanelVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveWaypoint: React.Dispatch<React.SetStateAction<Waypoint | null>>;
  isExitingRef: React.RefObject<boolean>;
  navigateAfterRelease: (navigate: () => void, onRecovered?: () => void) => boolean;
  tripId: string;
  router: Router;
  isMountedRef: React.RefObject<boolean>;
  isTripOngoingRef: React.RefObject<boolean>;
  isTripOngoing: boolean;
  isVoiceGuidanceEnabledRef: React.RefObject<boolean>;
  isVoiceGuidanceEnabled: boolean;
  spokenInstructionKeysRef: React.RefObject<Set<string>>;
  announcedWaypointIdsRef: React.RefObject<Set<string>>;
  presentedWaypointIdsRef: React.RefObject<Set<string>>;
  lastSpeechAtRef: React.RefObject<number>;
  presentedPickupNoticeKeysRef: React.RefObject<Set<string>>;
  highestPickupNoticePriorityRef: React.RefObject<Map<string, number>>;
  lastOffRouteRerouteAtRef: React.RefObject<number>;
  routeSignatureRef: React.RefObject<string>;
  setSkippedPickupBookingIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  setLocallyAcceptedBookingIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  setLocallyPickedUpBookingIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  setLocallyCancelledBookingIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  presentedPassengerBoardedKeysRef: React.RefObject<Set<string>>;
  presentedPassengerDestinationApproachKeysRef: React.RefObject<Set<string>>;
  presentedPassengerDestinationKeysRef: React.RefObject<Set<string>>;
  presentedTripDestinationKeysRef: React.RefObject<Set<string>>;
}

export function useDriverNavigationExit({
  cancelRouteRequest,
  cancelLocationRequest,
  stopDriverMarkerAnimation,
  recalcRouteTimeoutRef,
  locationSubscription,
  backgroundDisclosureResolverRef,
  offRouteSampleCountRef,
  isReroutingRef,
  hasFetchedInitialDriverRouteRef,
  autoCompletingTripRef,
  lastAcceptedDriverCoordinateRef,
  lastAcceptedDriverTimestampRef,
  lastTripCompletionCheckCoordinateRef,
  lastBackgroundCheckpointAtRef,
  isRestCompletionCheckRunningRef,
  lastRestCompletionCheckAtRef,
  completedDuringInactiveCandidateRef,
  previousTripStatusRef,
  skippedPickupBookingIdsRef,
  pickupClosestDistanceMetersRef,
  presentedPickupBypassBookingIdsRef,
  tripDestinationNearSinceMsRef,
  setIsReroutingRoute,
  setRouteDistanceMeters,
  setRouteDurationSeconds,
  setBackgroundDisclosureVisible,
  setSecurityModalVisible,
  setPickupNotice,
  setPickupNoticeCountdown,
  pickupBypassConfirmationRef,
  setPickupBypassConfirmation,
  setPickupBypassAction,
  tripEndNoticeRef,
  setTripEndNotice,
  waypointModalVisibleRef,
  setWaypointModalVisible,
  setPassengersPanelVisible,
  setActiveWaypoint,
  isExitingRef,
  navigateAfterRelease,
  tripId,
  router,
  isMountedRef,
  isTripOngoingRef,
  isTripOngoing,
  isVoiceGuidanceEnabledRef,
  isVoiceGuidanceEnabled,
  spokenInstructionKeysRef,
  announcedWaypointIdsRef,
  presentedWaypointIdsRef,
  lastSpeechAtRef,
  presentedPickupNoticeKeysRef,
  highestPickupNoticePriorityRef,
  lastOffRouteRerouteAtRef,
  routeSignatureRef,
  setSkippedPickupBookingIds,
  setLocallyAcceptedBookingIds,
  setLocallyPickedUpBookingIds,
  setLocallyCancelledBookingIds,
  presentedPassengerBoardedKeysRef,
  presentedPassengerDestinationApproachKeysRef,
  presentedPassengerDestinationKeysRef,
  presentedTripDestinationKeysRef,
}: Params) {
  const stopNavigationSideEffects = useCallback(() => {
    cancelRouteRequest();
    cancelLocationRequest();
    stopDriverMarkerAnimation();
    if (recalcRouteTimeoutRef.current) {
      clearTimeout(recalcRouteTimeoutRef.current);
      recalcRouteTimeoutRef.current = null;
    }
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    if (backgroundDisclosureResolverRef.current) {
      backgroundDisclosureResolverRef.current(false);
      backgroundDisclosureResolverRef.current = null;
    }
    void Speech.stop();
  }, [cancelLocationRequest, cancelRouteRequest, stopDriverMarkerAnimation]);

  const cleanupNavigationUi = useCallback(() => {
    stopNavigationSideEffects();
    offRouteSampleCountRef.current = 0;
    isReroutingRef.current = false;
    hasFetchedInitialDriverRouteRef.current = false;
    autoCompletingTripRef.current = false;
    lastAcceptedDriverCoordinateRef.current = null;
    lastAcceptedDriverTimestampRef.current = null;
    lastTripCompletionCheckCoordinateRef.current = null;
    lastBackgroundCheckpointAtRef.current = 0;
    isRestCompletionCheckRunningRef.current = false;
    lastRestCompletionCheckAtRef.current = 0;
    completedDuringInactiveCandidateRef.current = false;
    previousTripStatusRef.current = null;
    skippedPickupBookingIdsRef.current = new Set();
    pickupClosestDistanceMetersRef.current.clear();
    presentedPickupBypassBookingIdsRef.current.clear();
    tripDestinationNearSinceMsRef.current = null;
    setIsReroutingRoute(false);
    setRouteDistanceMeters(null);
    setRouteDurationSeconds(null);
    setBackgroundDisclosureVisible(false);
    setSecurityModalVisible(false);
    setPickupNotice(null);
    setPickupNoticeCountdown(null);
    pickupBypassConfirmationRef.current = null;
    setPickupBypassConfirmation(null);
    setPickupBypassAction(null);
    tripEndNoticeRef.current = null;
    setTripEndNotice(null);
    waypointModalVisibleRef.current = false;
    setWaypointModalVisible(false);
    setPassengersPanelVisible(false);
    setActiveWaypoint(null);
  }, [stopNavigationSideEffects]);

  const navigateBackSafely = useCallback(() => {
    if (isExitingRef.current) {
      return;
    }

    isExitingRef.current = true;
    stopNavigationSideEffects();
    const scheduled = navigateAfterRelease(() => {
      if (tripId) {
        router.replace(`/trip/manage/${tripId}`);
      } else {
        router.replace('/(tabs)');
      }
    }, () => { isExitingRef.current = false; });
    if (!scheduled) isExitingRef.current = false;
  }, [navigateAfterRelease, router, stopNavigationSideEffects, tripId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopNavigationSideEffects();
    };
  }, [stopNavigationSideEffects]);

  useEffect(() => {
    isTripOngoingRef.current = isTripOngoing;
  }, [isTripOngoing]);

  useEffect(() => {
    isVoiceGuidanceEnabledRef.current = isVoiceGuidanceEnabled;
    if (!isVoiceGuidanceEnabled) {
      void Speech.stop();
    }
  }, [isVoiceGuidanceEnabled]);

  useEffect(() => {
    spokenInstructionKeysRef.current.clear();
    announcedWaypointIdsRef.current.clear();
    presentedWaypointIdsRef.current.clear();
    lastSpeechAtRef.current = 0;
    setPickupNotice(null);
    setPickupNoticeCountdown(null);
    pickupBypassConfirmationRef.current = null;
    setPickupBypassConfirmation(null);
    setPickupBypassAction(null);
    presentedPickupNoticeKeysRef.current.clear();
    presentedPickupBypassBookingIdsRef.current.clear();
    highestPickupNoticePriorityRef.current.clear();
    offRouteSampleCountRef.current = 0;
    lastOffRouteRerouteAtRef.current = 0;
    isReroutingRef.current = false;
    routeSignatureRef.current = '';
    hasFetchedInitialDriverRouteRef.current = false;
    autoCompletingTripRef.current = false;
    lastAcceptedDriverCoordinateRef.current = null;
    lastAcceptedDriverTimestampRef.current = null;
    lastTripCompletionCheckCoordinateRef.current = null;
    lastBackgroundCheckpointAtRef.current = 0;
    isRestCompletionCheckRunningRef.current = false;
    lastRestCompletionCheckAtRef.current = 0;
    completedDuringInactiveCandidateRef.current = false;
    skippedPickupBookingIdsRef.current = new Set();
    pickupClosestDistanceMetersRef.current.clear();
    setSkippedPickupBookingIds(new Set());
    setLocallyAcceptedBookingIds(new Set());
    setLocallyPickedUpBookingIds(new Set());
    setLocallyCancelledBookingIds(new Set());
    setRouteDistanceMeters(null);
    setRouteDurationSeconds(null);
    setIsReroutingRoute(false);
    presentedPassengerBoardedKeysRef.current.clear();
    presentedPassengerDestinationApproachKeysRef.current.clear();
    presentedPassengerDestinationKeysRef.current.clear();
    presentedTripDestinationKeysRef.current.clear();
    void Speech.stop();
  }, [tripId]);

  useEffect(() => {
    if (isTripOngoing) {
      return;
    }
    void Speech.stop();
    waypointModalVisibleRef.current = false;
    setWaypointModalVisible(false);
    setPassengersPanelVisible(false);
    setActiveWaypoint(null);
    pickupBypassConfirmationRef.current = null;
    setPickupBypassConfirmation(null);
    setPickupBypassAction(null);
  }, [isTripOngoing]);

  return {
    navigateBackSafely,
    cleanupNavigationUi,
  };
}
import type { TripStatus } from '@/types';
