import {
  RouteStep,
  Waypoint,
  RouteCoordinate,
  FetchRouteOptions,
} from '../../features/driver-navigation/navigationModel';
import type { Booking, Trip } from '@/types';
import * as Location from 'expo-location';
import { useRef } from 'react';

interface Params {
  trip: Trip | undefined;
}

export function useDriverNavigationRefs({
  trip,
}: Params) {
  const routeFetchedRef = useRef(false);
  const routeCoordinatesRef = useRef<RouteCoordinate[]>([]);
  const lastRouteFetchTimeRef = useRef(0);
  const fetchRouteRef = useRef<((options?: FetchRouteOptions) => Promise<void>) | null>(null);
  const updateCurrentStepRef = useRef<((location: Location.LocationObject) => void) | null>(null);
  const routeSignatureRef = useRef('');
  const hasFetchedInitialDriverRouteRef = useRef(false);
  const offRouteSampleCountRef = useRef(0);
  const lastOffRouteRerouteAtRef = useRef(0);
  const isReroutingRef = useRef(false);
  const currentLocationRef = useRef<Location.LocationObject | null>(null);
  const hasEnabled3DRef = useRef(false);
  const isExitingRef = useRef(false);
  const isVoiceGuidanceEnabledRef = useRef(true);
  const lastSpeechAtRef = useRef(0);
  const spokenInstructionKeysRef = useRef<Set<string>>(new Set());
  const announcedWaypointIdsRef = useRef<Set<string>>(new Set());
  const presentedWaypointIdsRef = useRef<Set<string>>(new Set());
  const presentedPickupNoticeKeysRef = useRef<Set<string>>(new Set());
  const presentedPickupBypassBookingIdsRef = useRef<Set<string>>(new Set());
  const highestPickupNoticePriorityRef = useRef<Map<string, number>>(new Map());
  const skippedPickupBookingIdsRef = useRef<ReadonlySet<string>>(new Set());
  const pickupClosestDistanceMetersRef = useRef<Map<string, number>>(new Map());
  const tripDestinationNearSinceMsRef = useRef<number | null>(null);
  const evaluatePickupBypassRef = useRef<
    ((driverCoordinate: RouteCoordinate, gpsHeadingDegrees: number | null) => void) | null
  >(null);
  const autoCompletingTripRef = useRef(false);
  const presentedPassengerBoardedKeysRef = useRef<Set<string>>(new Set());
  const presentedPassengerDestinationApproachKeysRef = useRef<Set<string>>(new Set());
  const presentedPassengerDestinationKeysRef = useRef<Set<string>>(new Set());
  const presentedTripDestinationKeysRef = useRef<Set<string>>(new Set());
  const previousTripStatusRef = useRef<Trip['status'] | null>(trip?.status ?? null);
  const stepsRef = useRef<RouteStep[]>([]);
  const currentStepIndexRef = useRef(0);
  const waypointsRef = useRef<Waypoint[]>([]);
  const currentWaypointIndexRef = useRef(0);
  const waypointModalVisibleRef = useRef(false);
  const bookingsRef = useRef<Booking[] | undefined>(undefined);

  return {
    skippedPickupBookingIdsRef,
    stepsRef,
    currentStepIndexRef,
    waypointsRef,
    currentWaypointIndexRef,
    waypointModalVisibleRef,
    routeCoordinatesRef,
    bookingsRef,
    evaluatePickupBypassRef,
    presentedPickupBypassBookingIdsRef,
    pickupClosestDistanceMetersRef,
    routeFetchedRef,
    routeSignatureRef,
    offRouteSampleCountRef,
    lastOffRouteRerouteAtRef,
    isReroutingRef,
    hasFetchedInitialDriverRouteRef,
    autoCompletingTripRef,
    previousTripStatusRef,
    tripDestinationNearSinceMsRef,
    isExitingRef,
    isVoiceGuidanceEnabledRef,
    spokenInstructionKeysRef,
    announcedWaypointIdsRef,
    presentedWaypointIdsRef,
    lastSpeechAtRef,
    presentedPickupNoticeKeysRef,
    highestPickupNoticePriorityRef,
    presentedPassengerBoardedKeysRef,
    presentedPassengerDestinationApproachKeysRef,
    presentedPassengerDestinationKeysRef,
    presentedTripDestinationKeysRef,
    currentLocationRef,
    fetchRouteRef,
    updateCurrentStepRef,
    hasEnabled3DRef,
    lastRouteFetchTimeRef,
  };
}
