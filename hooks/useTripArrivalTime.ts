import { useEffect, useState } from 'react';
import type { Trip } from '@/types';
import { getRouteInfo } from '@/utils/routeHelpers';

/**
 * Hook pour calculer l'heure d'arrivée d'un trajet basée sur l'heure de départ + durée du trajet
 * obtenue via Mapbox Directions API
 */
export function useTripArrivalTime(trip: Trip | null | undefined): Date | null {
  const [calculatedArrivalTime, setCalculatedArrivalTime] = useState<Date | null>(null);

  useEffect(() => {
    if (!trip || !trip.departureTime) {
      setCalculatedArrivalTime(null);
      return;
    }

    // Vérifier si les coordonnées sont valides
    if (
      !trip.departure?.lat ||
      !trip.departure?.lng ||
      !trip.arrival?.lat ||
      !trip.arrival?.lng
    ) {
      setCalculatedArrivalTime(null);
      return;
    }

    const departureCoordinate = {
      latitude: trip.departure.lat,
      longitude: trip.departure.lng,
    };

    const arrivalCoordinate = {
      latitude: trip.arrival.lat,
      longitude: trip.arrival.lng,
    };

    let isMounted = true;

    getRouteInfo(departureCoordinate, arrivalCoordinate)
      .then((info) => {
        if (!isMounted) return;
        
        if (info.duration > 0 && trip.departureTime) {
          const departureDate = new Date(trip.departureTime);
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
  }, [trip?.id, trip?.departureTime, trip?.departure?.lat, trip?.departure?.lng, trip?.arrival?.lat, trip?.arrival?.lng]);

  return calculatedArrivalTime;
}

