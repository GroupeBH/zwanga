import { BookingAutoProgressEvent } from '../../features/passenger-navigation/navigationModel';
import { DRIVER_NEAR_PICKUP_DISTANCE_KM, PASSENGER_READY_DISTANCE_KM } from '@/constants/rideProgress';
import { calculateDistance, getRouteAlignedPosition } from '@/utils/routeHelpers';
import { useEffect, useMemo } from 'react';
import type { Booking } from '@/types';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  isScreenActive: boolean;
  driverLocation: { latitude: number; longitude: number; } | null;
  routeCoordinates: { latitude: number; longitude: number; }[];
  booking: Booking | undefined;
  tripId: string;
  isTripOngoing: boolean;
  passengerLocation: { latitude: number; longitude: number; } | null;
  pickupCoordinate: MapCoordinate | null;
  presentPickupNotice: (event: BookingAutoProgressEvent) => void;
}

export function usePassengerDriverCameraTracking({
  isScreenActive,
  driverLocation,
  routeCoordinates,
  booking,
  tripId,
  isTripOngoing,
  passengerLocation,
  pickupCoordinate,
  presentPickupNotice,
}: Params) {
  const routeAlignedDriver = useMemo(
    () =>
      driverLocation
        ? getRouteAlignedPosition(driverLocation, routeCoordinates, 0.1)
        : null,
    [driverLocation, routeCoordinates],
  );
  const displayedDriverLocation = driverLocation;
  const displayedDriverHeading = routeAlignedDriver?.heading ?? 0;

  useEffect(() => {
    if (
      !booking?.id ||
      !isScreenActive ||
      !['accepted', 'no_show'].includes(booking.status) ||
      !tripId ||
      !isTripOngoing ||
      booking.pickedUp ||
      booking.pickedUpConfirmedByPassenger ||
      booking.droppedOff ||
      booking.droppedOffConfirmedByPassenger ||
      !displayedDriverLocation
    ) {
      return;
    }

    const passengerReference = passengerLocation ?? pickupCoordinate;
    if (!passengerReference) {
      return;
    }

    const distanceToDriverKm = calculateDistance(displayedDriverLocation, passengerReference);
    const detectedAt = new Date().toISOString();

    if (distanceToDriverKm <= DRIVER_NEAR_PICKUP_DISTANCE_KM) {
      presentPickupNotice({
        type: 'driver_near_pickup',
        bookingId: booking.id,
        tripId,
        passengerId: booking.passengerId,
        distanceMeters: Math.round(distanceToDriverKm * 1000),
        detectedAt,
      });
    }

    if (distanceToDriverKm <= PASSENGER_READY_DISTANCE_KM) {
      presentPickupNotice({
        type: 'parties_nearby',
        bookingId: booking.id,
        tripId,
        passengerId: booking.passengerId,
        distanceMeters: Math.round(distanceToDriverKm * 1000),
        detectedAt,
      });
    }

    // La confirmation pickup est decidee par le backend a partir de l'historique Redis.
  }, [
    booking?.droppedOff,
    booking?.droppedOffConfirmedByPassenger,
    booking?.id,
    booking?.passengerId,
    booking?.pickedUp,
    booking?.pickedUpConfirmedByPassenger,
    booking?.status,
    displayedDriverLocation,
    isTripOngoing,
    isScreenActive,
    passengerLocation,
    pickupCoordinate,
    presentPickupNotice,
    tripId,
  ]);

  return {
    displayedDriverLocation,
    displayedDriverHeading,
  };
}
