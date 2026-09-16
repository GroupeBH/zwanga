import {
  RouteSegmentFocus,
  PassengerRouteInfo,
  PassengerPickupNotice,
  formatDistanceMeters,
  formatDurationSeconds,
} from '../../features/passenger-navigation/navigationModel';
import { Colors } from '@/constants/styles';
import { calculateDistance } from '@/utils/routeHelpers';
import { trimPolylineFromCurrentPosition } from '@/utils/navigation/routeProgress';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo } from 'react';
import type { Trip, Booking } from '@/types';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  booking: Booking | undefined;
  trip: Trip | undefined;
  pickupNotice: PassengerPickupNotice | null;
  displayedDriverLocation: { latitude: number; longitude: number; } | null;
  routeCoordinates: { latitude: number; longitude: number; }[];
  passengerLocation: { latitude: number; longitude: number; } | null;
  pickupCoordinate: MapCoordinate | null;
  isPassengerOnboard: boolean;
  routeOriginCoordinate: { latitude: number; longitude: number; } | null;
  activePassengerDestination: MapCoordinate | null;
  routeInfo: PassengerRouteInfo | null;
  activeRouteSegment: RouteSegmentFocus;
  setActiveRouteSegment: React.Dispatch<React.SetStateAction<RouteSegmentFocus>>;
}

export function usePassengerNavigationPresentation({
  booking,
  trip,
  pickupNotice,
  displayedDriverLocation,
  routeCoordinates,
  passengerLocation,
  pickupCoordinate,
  isPassengerOnboard,
  routeOriginCoordinate,
  activePassengerDestination,
  routeInfo,
  activeRouteSegment,
  setActiveRouteSegment,
}: Params) {
  const tripStatus = useMemo(() => {
    if (!booking || !trip) return 'loading';
    if (trip.status !== 'ongoing') return 'not_started';
    if (booking.droppedOff) return 'completed';
    if (booking.droppedOffConfirmedByPassenger) return 'awaiting_dropoff_confirmation';
    if (booking.pickedUp && !booking.pickedUpConfirmedByPassenger) return 'pickup_confirmation_needed';
    if (booking.pickedUp) return 'in_transit';
    return 'waiting_pickup';
  }, [booking, trip]);
  const canCancelPassengerTrip = Boolean(
    booking?.id &&
      booking.status === 'accepted' &&
      !booking.droppedOff &&
      !booking.droppedOffConfirmedByPassenger &&
      trip?.status !== 'completed' &&
      trip?.status !== 'cancelled',
  );
  const pickupNoticeDistanceMeters =
    typeof pickupNotice?.distanceMeters === 'number' && Number.isFinite(pickupNotice.distanceMeters)
      ? Math.max(10, Math.round(pickupNotice.distanceMeters / 10) * 10)
      : null;
  const pickupNoticeAccent =
    pickupNotice?.type === 'driver_near_pickup'
      ? Colors.warning
      : pickupNotice?.type === 'parties_nearby'
        ? Colors.primary
        : Colors.secondary;
  const pickupNoticeIcon: keyof typeof Ionicons.glyphMap =
    pickupNotice?.type === 'driver_near_pickup'
      ? 'car-sport'
      : pickupNotice?.type === 'parties_nearby'
        ? 'people'
        : 'car';
  const pickupNoticeTitle =
    pickupNotice?.type === 'driver_near_pickup'
      ? 'Le conducteur sera bient\u00f4t l\u00e0'
      : pickupNotice?.type === 'parties_nearby'
        ? 'Vous \u00eates au point'
        : 'Le conducteur est l\u00e0';
  const pickupNoticeText =
    pickupNotice?.type === 'driver_near_pickup'
      ? `${
          pickupNoticeDistanceMeters ? `Il est \u00e0 environ ${pickupNoticeDistanceMeters} m. ` : ''
        }Pr\u00e9parez-vous \u00e0 rejoindre le point de r\u00e9cup\u00e9ration.`
      : pickupNotice?.type === 'parties_nearby'
        ? 'Vous \u00eates au point de r\u00e9cup\u00e9ration. Signalez-vous au conducteur si vous \u00eates pr\u00eat.'
        : 'Le conducteur est arriv\u00e9 au point de r\u00e9cup\u00e9ration. Vous disposez de 10 minutes pour vous signaler.';

  const hasPickupConnectorSegment = Boolean(
    displayedDriverLocation &&
      !booking?.pickedUp &&
      routeCoordinates.length < 2 &&
      (passengerLocation || pickupCoordinate),
  );
  const canToggleRouteSegments = routeCoordinates.length > 1 && hasPickupConnectorSegment;
  const canCenterOnPassenger = Boolean(passengerLocation && !isPassengerOnboard);
  const currentVehicleRoutePosition = displayedDriverLocation ?? routeOriginCoordinate;
  const remainingPassengerRoute = useMemo(
    () =>
      trimPolylineFromCurrentPosition(
        currentVehicleRoutePosition,
        routeCoordinates,
        activePassengerDestination,
      ),
    [activePassengerDestination, currentVehicleRoutePosition, routeCoordinates],
  );
  const displayedRouteCoordinates =
    remainingPassengerRoute.remainingCoordinates.length > 1
      ? remainingPassengerRoute.remainingCoordinates
      : routeCoordinates;
  const remainingDistanceMeters = useMemo(() => {
    if (!activePassengerDestination) {
      return null;
    }

    if (booking?.droppedOff || booking?.droppedOffConfirmedByPassenger) {
      return 0;
    }

    if (remainingPassengerRoute.remainingCoordinates.length > 1) {
      return remainingPassengerRoute.distanceMeters;
    }

    if (!currentVehicleRoutePosition) {
      return routeInfo?.distanceMeters ?? null;
    }

    return calculateDistance(currentVehicleRoutePosition, activePassengerDestination) * 1000;
  }, [
    activePassengerDestination,
    booking?.droppedOff,
    booking?.droppedOffConfirmedByPassenger,
    currentVehicleRoutePosition,
    remainingPassengerRoute.distanceMeters,
    remainingPassengerRoute.remainingCoordinates.length,
    routeInfo?.distanceMeters,
  ]);
  const remainingDistanceLabel =
    typeof remainingDistanceMeters === 'number'
      ? formatDistanceMeters(remainingDistanceMeters)
      : null;
  const remainingDurationLabel = useMemo(() => {
    if (
      typeof remainingDistanceMeters !== 'number' ||
      !routeInfo?.distanceMeters ||
      !routeInfo.durationSeconds
    ) {
      return routeInfo?.duration ?? null;
    }

    const remainingRatio = Math.min(1, Math.max(0, remainingDistanceMeters / routeInfo.distanceMeters));
    return formatDurationSeconds(routeInfo.durationSeconds * remainingRatio);
  }, [
    remainingDistanceMeters,
    routeInfo?.distanceMeters,
    routeInfo?.duration,
    routeInfo?.durationSeconds,
  ]);
  const displayedRouteDistance = remainingDistanceLabel ?? routeInfo?.distance ?? null;
  const displayedRouteDuration = remainingDurationLabel ?? routeInfo?.duration ?? null;

  useEffect(() => {
    if (!hasPickupConnectorSegment && activeRouteSegment === 'pickup') {
      setActiveRouteSegment('route');
    }
  }, [activeRouteSegment, hasPickupConnectorSegment]);

  return {
    displayedRouteCoordinates,
    canToggleRouteSegments,
    canCenterOnPassenger,
    tripStatus,
    displayedRouteDistance,
    displayedRouteDuration,
    canCancelPassengerTrip,
    pickupNoticeAccent,
    pickupNoticeIcon,
    pickupNoticeTitle,
    pickupNoticeText,
  };
}
