import { useEffect, useState } from 'react';
import type { Trip } from '@/types';
import { getRouteInfo } from '@/utils/routeApi';
import { getTripLocationCoordinate } from '@/utils/tripCoordinates';

/**
 * Hook pour calculer l'heure d'arrivée d'un trajet basée sur l'heure de départ + durée du trajet
 * obtenue via le service d'itinéraire.
 */
export function useTripArrivalTime(trip: Trip | null | undefined): Date | null {
  const [calculatedArrivalTime, setCalculatedArrivalTime] = useState<Date | null>(null);
  const tripId = trip?.id;
  const departureTime = trip?.departureTime;
  const departureLatitude = trip?.departure?.lat;
  const departureLongitude = trip?.departure?.lng;
  const arrivalLatitude = trip?.arrival?.lat;
  const arrivalLongitude = trip?.arrival?.lng;
  const departureHasCoordinates = trip?.departure?.hasCoordinates;
  const arrivalHasCoordinates = trip?.arrival?.hasCoordinates;

  useEffect(() => {
    if (!tripId || !departureTime) {
      setCalculatedArrivalTime(null);
      return;
    }

    const departureCoordinate = getTripLocationCoordinate({
      lat: departureLatitude,
      lng: departureLongitude,
      hasCoordinates: departureHasCoordinates,
    });
    const arrivalCoordinate = getTripLocationCoordinate({
      lat: arrivalLatitude,
      lng: arrivalLongitude,
      hasCoordinates: arrivalHasCoordinates,
    });

    if (!departureCoordinate || !arrivalCoordinate) {
      setCalculatedArrivalTime(null);
      return;
    }

    let isMounted = true;

    getRouteInfo(departureCoordinate, arrivalCoordinate)
      .then((info) => {
        if (!isMounted) return;
        
        if (info.duration > 0) {
          const departureDate = new Date(departureTime);
          const arrivalDate = new Date(departureDate.getTime() + info.duration * 1000);
          setCalculatedArrivalTime(arrivalDate);
        } else {
          setCalculatedArrivalTime(null);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setCalculatedArrivalTime(null);
      });

    return () => {
      isMounted = false;
    };
  }, [
    tripId,
    departureTime,
    departureLatitude,
    departureLongitude,
    departureHasCoordinates,
    arrivalLatitude,
    arrivalLongitude,
    arrivalHasCoordinates,
  ]);

  return calculatedArrivalTime;
}

