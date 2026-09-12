import {
  type PassengerTrackingMarkerStatus
} from '@/components/TrackingMapMarkers';
import { MAX_LIVE_PASSENGER_MARKERS } from '@/features/home/homeMapPolicy';
import { getLocationCoordinate, hasFreshBookingPassengerLocation, isCoordinateAllowedForHomeTrip, isFreshLivePassengerLocation, isKinshasaHomeTrip } from '@/features/home/homeModel';
import type { DriverPassengerMarker, MapCoordinate } from '@/features/home/homeTypes';
import type { Booking } from '@/types';
import {
  normalizeTripMapCoordinate
} from '@/utils/tripCoordinates';
import { useMemo } from 'react';

import type { useHomeDriverActivity } from '@/hooks/home/useHomeDriverActivity';
import type { useHomeTracking } from '@/hooks/home/useHomeTracking';
type Props =
  Pick<ReturnType<typeof useHomeDriverActivity>,
    'ongoingDriverTrip'
    | 'ongoingDriverBookings'
  >
  & Pick<ReturnType<typeof useHomeTracking>,
    'liveDriverPassengerLocations'
  >;
export function useHomePassengerMarkers({ ongoingDriverTrip, ongoingDriverBookings, liveDriverPassengerLocations }: Props) {
  const driverPassengerMarkers = useMemo<DriverPassengerMarker[]>(() => {
    if (!ongoingDriverTrip) return [];

    const isKinshasaDriverTrip = isKinshasaHomeTrip(ongoingDriverTrip);
    const fallbackPickup = getLocationCoordinate(ongoingDriverTrip.departure);
    const fallbackDropoff = getLocationCoordinate(ongoingDriverTrip.arrival);
    const markers: DriverPassengerMarker[] = [];
    const resolvePassengerCoordinate = (
      coordinate: MapCoordinate | null | undefined,
      booking: Booking,
      label: string,
    ) => {
      if (isCoordinateAllowedForHomeTrip(coordinate, ongoingDriverTrip)) {
        return coordinate;
      }

      if (isKinshasaDriverTrip && coordinate) {
        console.warn(`[Home] ${label} hors Kinshasa ignoree:`, {
          bookingId: booking.id,
          coordinate,
          tripId: ongoingDriverTrip.id,
        });
      }

      return null;
    };

    ongoingDriverBookings
      .filter((booking) => booking.status === 'accepted' || booking.status === 'completed')
      .forEach((booking) => {
        const isPassengerDroppedOff = Boolean(
          booking.status === 'completed' || booking.droppedOff || booking.droppedOffConfirmedByPassenger,
        );
        const isPassengerOnboard = Boolean(booking.pickedUp && !isPassengerDroppedOff);

        const liveLocation = liveDriverPassengerLocations[booking.id];
        const rawApiLocationCoordinate = normalizeTripMapCoordinate(
          booking.passengerLocationCoordinates?.latitude,
          booking.passengerLocationCoordinates?.longitude,
        );
        const liveCoordinate = resolvePassengerCoordinate(
          isFreshLivePassengerLocation(liveLocation) ? liveLocation?.coordinate : null,
          booking,
          'Position live passager',
        );
        if (liveLocation && !isFreshLivePassengerLocation(liveLocation)) {
          console.warn('[Home] Position live passager trop ancienne ignoree:', {
            bookingId: booking.id,
            updatedAt: liveLocation.updatedAt,
          });
        }
        if (rawApiLocationCoordinate && !hasFreshBookingPassengerLocation(booking)) {
          console.warn('[Home] Position API passager trop ancienne ignoree:', {
            bookingId: booking.id,
            updatedAt: booking.passengerLocationUpdatedAt,
          });
        }
        const apiLocation = resolvePassengerCoordinate(
          hasFreshBookingPassengerLocation(booking) ? rawApiLocationCoordinate : null,
          booking,
          'Position API passager',
        );
        const pickupLocation = resolvePassengerCoordinate(
          normalizeTripMapCoordinate(
            booking.passengerOriginCoordinates?.latitude,
            booking.passengerOriginCoordinates?.longitude,
          ),
          booking,
          'Pickup passager',
        ) ?? fallbackPickup;
        const dropoffLocation = resolvePassengerCoordinate(
          normalizeTripMapCoordinate(
            booking.passengerDestinationCoordinates?.latitude,
            booking.passengerDestinationCoordinates?.longitude,
          ),
          booking,
          'Dropoff passager',
        ) ?? fallbackDropoff;
        const status: PassengerTrackingMarkerStatus =
          isPassengerDroppedOff
            ? 'arrived'
            : isPassengerOnboard
              ? 'live'
              : 'pickup';
        const coordinate =
          status === 'arrived'
            ? dropoffLocation ?? liveCoordinate ?? apiLocation ?? pickupLocation
            : liveCoordinate ?? apiLocation ?? pickupLocation;

        if (!coordinate) return;

        markers.push({
          bookingId: booking.id,
          coordinate,
          isLive: Boolean(liveCoordinate || apiLocation),
          isVisible: !isPassengerOnboard,
          passengerId: booking.passengerId,
          passengerName: booking.passengerName || 'Passager',
          status,
        });
      });

    return markers;
  }, [liveDriverPassengerLocations, ongoingDriverBookings, ongoingDriverTrip]);

  const visibleDriverPassengerMarkers = useMemo(
    () => driverPassengerMarkers.filter((passenger) => passenger.isVisible).slice(0, MAX_LIVE_PASSENGER_MARKERS),
    [driverPassengerMarkers],
  );
  return { visibleDriverPassengerMarkers };
}
