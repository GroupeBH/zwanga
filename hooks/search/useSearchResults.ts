import { useMemo } from 'react';
import type { SearchMode, SearchSortMode as SortMode } from '@/components/search/SearchResultsToolbar';
import type { Trip, TripRequest, User } from '@/types';
import type { selectUserCoordinates } from '@/store/selectors';
import { rankRequestsByProximity } from '@/features/trip-request/requestPriority';
import {
  EMPTY_SEARCH_TRIPS,
  EMPTY_SEARCH_REQUESTS,
  getSafeTripId,
  getSafeTripRequestId,
  matchesSearch,
} from '@/features/search/searchModel';

interface Params {
  advancedTrips: Trip[] | null;
  remoteTrips: Trip[] | undefined;
  storedTrips: Trip[];
  searchMode: SearchMode;
  departure: string;
  arrival: string;
  desiredSeats: number;
  sortMode: SortMode;
  driverCoordinate: ReturnType<typeof selectUserCoordinates>;
  availableTripRequests: TripRequest[];
  isDriverAccount: boolean;
  currentUser: User | undefined;
}

export function useSearchResults({ advancedTrips, remoteTrips, storedTrips, searchMode,
  departure, arrival, desiredSeats, sortMode, driverCoordinate, availableTripRequests,
  isDriverAccount, currentUser }: Params) {
  const baseTrips = useMemo(() => {
    if (advancedTrips) {
      return advancedTrips;
    }

    if (remoteTrips) {
      return remoteTrips;
    }

    return storedTrips;
  }, [advancedTrips, remoteTrips, storedTrips]);

  const filteredTrips = useMemo(() => {
    if (searchMode !== 'trips') return EMPTY_SEARCH_TRIPS;

    const routeQuery = [departure, arrival].filter(Boolean).join(' ');
    const visibleTrips = baseTrips.filter((trip) => {
      if (!getSafeTripId(trip)) {
        return false;
      }

      const departureText = `${trip.departure?.name ?? ''} ${trip.departure?.address ?? ''}`;
      const arrivalText = `${trip.arrival?.name ?? ''} ${trip.arrival?.address ?? ''}`;
      const routeText = `${departureText} ${arrivalText}`;

      return trip.availableSeats >= desiredSeats && matchesSearch(routeText, routeQuery);
    });

    return visibleTrips.sort((a, b) => {
      if (sortMode === 'cheap') {
        const priceA = Number(a.price ?? 0);
        const priceB = Number(b.price ?? 0);

        if (priceA !== priceB) {
          return priceA - priceB;
        }
      }

      const departureA = new Date(a.departureTime).getTime();
      const departureB = new Date(b.departureTime).getTime();
      const safeDepartureA = Number.isFinite(departureA) ? departureA : Number.MAX_SAFE_INTEGER;
      const safeDepartureB = Number.isFinite(departureB) ? departureB : Number.MAX_SAFE_INTEGER;

      return safeDepartureA - safeDepartureB;
    });
  }, [arrival, baseTrips, departure, desiredSeats, searchMode, sortMode]);

  const filteredTripRequests = useMemo(() => {
    if (searchMode !== 'requests' || !isDriverAccount) {
      return EMPTY_SEARCH_REQUESTS;
    }

    const routeQuery = [departure, arrival].filter(Boolean).join(' ');
    const visibleRequests = availableTripRequests.filter((request) => {
      if (!getSafeTripRequestId(request)) {
        return false;
      }

      if (request.passengerId === currentUser?.id) {
        return false;
      }

      if (request.status !== 'pending' && request.status !== 'offers_received') {
        return false;
      }

      const departureText = `${request.departure?.name ?? ''} ${request.departure?.address ?? ''} ${request.departure?.reference ?? ''}`;
      const arrivalText = `${request.arrival?.name ?? ''} ${request.arrival?.address ?? ''} ${request.arrival?.reference ?? ''}`;
      const routeText = `${departureText} ${arrivalText}`;

      return request.numberOfSeats >= desiredSeats && matchesSearch(routeText, routeQuery);
    });

    if (sortMode === 'nearby') return rankRequestsByProximity(visibleRequests, driverCoordinate);

    return visibleRequests.sort((a, b) => {
      if (sortMode === 'cheap') {
        const priceA = Number(a.maxPricePerSeat ?? Number.NEGATIVE_INFINITY);
        const priceB = Number(b.maxPricePerSeat ?? Number.NEGATIVE_INFINITY);

        if (priceA !== priceB) {
          return priceB - priceA;
        }
      }

      const departureA = new Date(a.departureDateMin).getTime();
      const departureB = new Date(b.departureDateMin).getTime();
      const safeDepartureA = Number.isFinite(departureA) ? departureA : Number.MAX_SAFE_INTEGER;
      const safeDepartureB = Number.isFinite(departureB) ? departureB : Number.MAX_SAFE_INTEGER;

      return safeDepartureA - safeDepartureB;
    });
  }, [
    arrival,
    availableTripRequests,
    driverCoordinate,
    currentUser?.id,
    departure,
    desiredSeats,
    isDriverAccount,
    searchMode,
    sortMode,
  ]);

  return { baseTrips, filteredTrips, filteredTripRequests };
}
