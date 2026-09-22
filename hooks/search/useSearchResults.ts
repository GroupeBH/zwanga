import { useEffect, useMemo, useRef } from 'react';
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
  isScreenActive?: boolean;
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
  isDriverAccount, currentUser, isScreenActive = true }: Params) {
  const previous = useRef({ userId: currentUser?.id, baseTrips: EMPTY_SEARCH_TRIPS,
    filteredTrips: EMPTY_SEARCH_TRIPS, filteredTripRequests: EMPTY_SEARCH_REQUESTS });
  const baseTrips = useMemo(() => {
    if (!isScreenActive) return previous.current.userId === currentUser?.id
      ? previous.current.baseTrips : EMPTY_SEARCH_TRIPS;
    if (advancedTrips) {
      return advancedTrips;
    }

    if (remoteTrips) {
      return remoteTrips;
    }

    return storedTrips;
  }, [advancedTrips, remoteTrips, storedTrips, isScreenActive, currentUser?.id]);

  const filteredTrips = useMemo(() => {
    if (!isScreenActive) return previous.current.userId === currentUser?.id
      ? previous.current.filteredTrips : EMPTY_SEARCH_TRIPS;
    if (searchMode !== 'trips') return EMPTY_SEARCH_TRIPS;

    const routeQuery = [departure, arrival].filter(Boolean).join(' ');
    const visibleTrips = baseTrips.filter((trip) => {
      if (!getSafeTripId(trip)) {
        return false;
      }

      // Applied to every source (remote, map search and cached trips), before counts/sorting.
      if (currentUser?.id && (trip.driverId === currentUser.id || trip.driver?.id === currentUser.id)) {
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
  }, [arrival, baseTrips, currentUser?.id, departure, desiredSeats, searchMode, sortMode, isScreenActive]);

  const filteredTripRequests = useMemo(() => {
    if (!isScreenActive) return previous.current.userId === currentUser?.id
      ? previous.current.filteredTripRequests : EMPTY_SEARCH_REQUESTS;
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
    isScreenActive,
  ]);

  // Keep the existing list/scroll state, without sorting GPS or cache updates in
  // a hidden tab. Never reuse another account's snapshot.
  useEffect(() => {
    previous.current = { userId: currentUser?.id, baseTrips, filteredTrips, filteredTripRequests };
  }, [currentUser?.id, baseTrips, filteredTrips, filteredTripRequests]);

  return { baseTrips, filteredTrips, filteredTripRequests };
}
