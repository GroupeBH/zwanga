import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isDriverAccount as hasDriverRole } from '@/utils/accountRole';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDialog } from '@/components/ui/DialogProvider';
import type { SearchMode, SearchSortMode as SortMode } from '@/components/search/SearchResultsToolbar';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { screenReadOptions } from '@/features/performance/screenReadPolicy';
import { useAppSelector } from '@/store/hooks';
import { selectTrips, selectUser, selectUserCoordinates } from '@/store/selectors';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useGetRequestDiscoveryQuery } from '@/store/api/tripRequestApi';
import {
  useGetTripDiscoveryInfiniteQuery,
  type TripSearchParams,
  type TripSearchByPointsPayload,
} from '@/store/api/tripApi';
import { trackEvent } from '@/services/analytics';
import { getTripRequestCreateHref } from '@/utils/requestNavigation';
import {
  MIN_SEARCH_SEATS,
  EMPTY_SEARCH_REQUESTS,
  EMPTY_SEARCH_TRIPS,
  clampSearchSeats,
  parseNumberParam,
  type SearchResultListItem,
} from '@/features/search/searchModel';
import { useSearchNavigation } from './useSearchNavigation';
import { useSearchResults } from './useSearchResults';
import { useSearchSortOrigin } from './useSearchSortOrigin';

export function useSearchController() {
  const isScreenActive = useScreenIsActive();
  const router = useRouter();
  const { showDialog } = useDialog();
  const searchParams = useLocalSearchParams<{
    arrival?: string;
    arrivalLat?: string;
    arrivalLng?: string;
    arrivalRadiusKm?: string;
    departure?: string;
    departureLat?: string;
    departureLng?: string;
    departureRadiusKm?: string;
    minSeats?: string;
    mode?: string;
    seats?: string;
  }>();
  const storedTrips = useAppSelector(state => isScreenActive ? selectTrips(state) : EMPTY_SEARCH_TRIPS);
  const storedUser = useAppSelector(selectUser);
  const reads = screenReadOptions(isScreenActive);
  const { data: profile } = useGetCurrentUserQuery(undefined, reads);
  // Keep ownership filtering while the profile refresh is slow or unavailable.
  const currentUser = profile ?? storedUser ?? undefined;
  // A stored identity can filter own trips, but cannot grant driver discovery.
  const isDriverAccount = hasDriverRole(profile);
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [draftDeparture, setDraftDeparture] = useState('');
  const [draftArrival, setDraftArrival] = useState('');
  const [desiredSeats, setDesiredSeats] = useState(MIN_SEARCH_SEATS);
  const [querySeats, setQuerySeats] = useState(MIN_SEARCH_SEATS);
  const [requestedSearchMode, setRequestedSearchMode] = useState<SearchMode>('trips');
  // Role changes must hide cached driver results in the same render, even off-screen.
  const searchMode: SearchMode = isDriverAccount ? requestedSearchMode : 'trips';
  const setSearchMode = useCallback((mode: SearchMode) => {
    setRequestedSearchMode(isDriverAccount ? mode : 'trips');
  }, [isDriverAccount]);
  const [queryParams, setQueryParams] = useState<TripSearchParams>({});
  const [lastAdvancedPayload, setLastAdvancedPayload] = useState<TripSearchByPointsPayload | null>(null);
  const clearAdvancedSearch = useCallback(() => setLastAdvancedPayload(null), []);
  const runAdvancedSearch = useCallback((payload: TripSearchByPointsPayload) => setLastAdvancedPayload(payload), []);
  const [tripSortMode, setTripSortMode] = useState<SortMode>('early');
  const [requestSortMode, setRequestSortMode] = useState<SortMode>('nearby');
  const sortMode = searchMode === 'requests' ? requestSortMode : tripSortMode;
  const setSortMode = searchMode === 'requests' ? setRequestSortMode : setTripSortMode;
  const tripCoordinate = useSearchSortOrigin(currentUser?.id, isScreenActive && searchMode === 'trips' && tripSortMode === 'early');
  // GPS updates need not redraw the trips tab or a budget/time-sorted request list.
  const driverCoordinate = useAppSelector(state =>
    isScreenActive && searchMode === 'requests' && sortMode === 'nearby' ? selectUserCoordinates(state) : null,
  );
  const { openingTripId, openingRequestId, handleOpenTrip, handleOpenTripRequest } = useSearchNavigation({ router, showDialog });
  const firstName = currentUser?.firstName || currentUser?.name?.split(' ')[0] || 'Kinshasa';
  const avatarUri = currentUser?.profilePicture || currentUser?.avatar;

  const discoveryParams = useMemo<TripSearchParams>(() => ({
    ...(lastAdvancedPayload ? Object.fromEntries(Object.entries(lastAdvancedPayload).filter(([, value]) => value != null)) : queryParams),
    minSeats: querySeats,
    sort: tripSortMode === 'cheap' ? 'price' : 'soonest',
    ...(tripSortMode === 'early' && tripCoordinate
      ? { sortOriginCoordinates: [tripCoordinate.longitude, tripCoordinate.latitude] as [number, number] } : {}),
  }), [lastAdvancedPayload, queryParams, querySeats, tripSortMode, tripCoordinate]);
  useEffect(() => {
    if (!isScreenActive) return;
    const timer = setTimeout(() => setQuerySeats(desiredSeats), 350);
    return () => clearTimeout(timer);
  }, [desiredSeats, isScreenActive, searchMode]);
  const {
    currentData: tripPages,
    isLoading: queryLoading,
    isFetching: queryFetching,
    isError: queryError,
    hasNextPage, hasPreviousPage, fetchNextPage, fetchPreviousPage,
    refetch,
  } = useGetTripDiscoveryInfiniteQuery(discoveryParams, {
    ...reads,
    skip: reads.skip || searchMode !== 'trips',
  });
  const remoteTrips = useMemo(() => tripPages
    ? [...new Map(tripPages.pages.flatMap(page => page.data).map(trip => [trip.id, trip])).values()] : undefined, [tripPages]);
  const advancedTrips = null;
  const isAdvancedSearching = Boolean(lastAdvancedPayload && queryFetching);
  const advancedError = queryError && !remoteTrips?.length
    ? 'Impossible de charger les trajets. Réessayez dans un instant.' : null;
  const loadNextTrips = () => { if (isScreenActive && !queryFetching && hasNextPage) void fetchNextPage(); };
  const loadPreviousTrips = () => { if (isScreenActive && !queryFetching && hasPreviousPage) void fetchPreviousPage(); };

  const requestKey = `${currentUser?.id}:${departure}:${arrival}:${querySeats}:${requestSortMode}`;
  const [requestPaging, setRequestPaging] = useState({ key: requestKey, page: 1 });
  const requestPage = requestPaging.key === requestKey ? requestPaging.page : 1;
  const {
    currentData: fetchedRequestResults,
    isLoading: requestsLoading,
    isFetching: requestsFetching,
    isError: requestsError,
    refetch: refetchAvailableTripRequests,
  } = useGetRequestDiscoveryQuery({ page: requestPage, search: [departure, arrival].filter(Boolean).join(' ') || undefined, minSeats: querySeats, sort: requestSortMode === 'early' ? 'soon' : requestSortMode }, {
    ...reads,
    skip: reads.skip || !isDriverAccount || searchMode !== 'requests',
  });
  const retainedRequestPage = useRef<{ key: string; data: typeof fetchedRequestResults } | null>(null);
  const visibleRequestKey = `${requestKey}:${requestPage}`;
  if (isScreenActive && searchMode === 'requests') {
    retainedRequestPage.current = { key: visibleRequestKey, data: fetchedRequestResults };
  }
  // Keep totals with the retained list while subscriptions are paused. Never
  // reuse another user's/filter's page, or retain driver results after demotion.
  const requestResults = isScreenActive ? fetchedRequestResults
    : isDriverAccount && retainedRequestPage.current?.key === visibleRequestKey
      ? retainedRequestPage.current.data : undefined;
  const availableTripRequests = requestResults?.data ?? EMPTY_SEARCH_REQUESTS;

  useEffect(() => {
    const departureParam = typeof searchParams.departure === 'string' ? searchParams.departure : '';
    const arrivalParam = typeof searchParams.arrival === 'string' ? searchParams.arrival : '';
    const seatsParam = clampSearchSeats(
      parseNumberParam(searchParams.minSeats) ?? parseNumberParam(searchParams.seats),
    );

    setDeparture(departureParam);
    setArrival(arrivalParam);
    setDraftDeparture(departureParam);
    setDraftArrival(arrivalParam);
    setDesiredSeats(seatsParam);
    setQuerySeats(seatsParam);
    setQueryParams({
      departureLocation: departureParam || undefined,
      arrivalLocation: arrivalParam || undefined,
      minSeats: seatsParam,
    });
  }, [searchParams.departure, searchParams.arrival, searchParams.minSeats, searchParams.seats]);

  useEffect(() => {
    if (!isScreenActive) return;
    if (searchMode !== 'trips') {
      clearAdvancedSearch();
      setLastAdvancedPayload(null);
      return;
    }

    const mode = String(searchParams.mode || '');
    const depLat = parseNumberParam(searchParams.departureLat);
    const depLng = parseNumberParam(searchParams.departureLng);
    const arrLat = parseNumberParam(searchParams.arrivalLat);
    const arrLng = parseNumberParam(searchParams.arrivalLng);
    const depRadius = parseNumberParam(searchParams.departureRadiusKm);
    const arrRadius = parseNumberParam(searchParams.arrivalRadiusKm);
    const hasDepartureCoordinates = depLat !== undefined && depLng !== undefined;
    const hasArrivalCoordinates = arrLat !== undefined && arrLng !== undefined;

    if (mode === 'map' && (hasDepartureCoordinates || hasArrivalCoordinates)) {
      const payload = {
        minSeats: querySeats,
        ...(hasDepartureCoordinates
          ? {
              departureCoordinates: [depLng, depLat] as [number, number],
              departureRadiusKm: depRadius ?? 50,
            }
          : {}),
        ...(hasArrivalCoordinates
          ? {
              arrivalCoordinates: [arrLng, arrLat] as [number, number],
              arrivalRadiusKm: arrRadius ?? 50,
            }
          : {}),
      };

      setLastAdvancedPayload(payload);
      runAdvancedSearch(payload);
    } else {
      clearAdvancedSearch();
      setLastAdvancedPayload(null);
    }
  }, [
    isScreenActive,
    runAdvancedSearch,
    clearAdvancedSearch,
    searchMode,
    searchParams.mode,
    searchParams.departureLat,
    searchParams.departureLng,
    searchParams.arrivalLat,
    searchParams.arrivalLng,
    searchParams.departureRadiusKm,
    searchParams.arrivalRadiusKm,
    querySeats,
  ]);

  const { baseTrips, filteredTrips, filteredTripRequests } = useSearchResults({
    advancedTrips, remoteTrips, storedTrips, searchMode, departure, arrival, desiredSeats,
    sortMode, driverCoordinate, availableTripRequests, isDriverAccount, currentUser,
    isScreenActive, serverOrderedRequests: true, serverOrderedTrips: true,
    tripCoordinate: lastAdvancedPayload?.departureCoordinates
      ? { longitude: lastAdvancedPayload.departureCoordinates[0], latitude: lastAdvancedPayload.departureCoordinates[1] } : tripCoordinate,
  });

  const requestSearchError =
    requestsError && searchMode === 'requests'
      ? 'Impossible de charger les commandes disponibles pour le moment. Réessayez dans un instant.'
      : null;
  const currentError = searchMode === 'trips' ? advancedError : requestSearchError;
  const isLoadingResults =
    searchMode === 'trips'
      ? (queryLoading || isAdvancedSearching) && baseTrips.length === 0
      : isDriverAccount && requestsLoading && availableTripRequests.length === 0;
  const isRefreshingResults =
    searchMode === 'trips'
      ? queryFetching || isAdvancedSearching
      : isDriverAccount && requestsFetching;
  useEffect(() => {
    if (!isScreenActive) return;
    const timeout = setTimeout(() => {
      const nextDeparture = draftDeparture.trim();
      const nextArrival = draftArrival.trim();

      if (nextDeparture === departure && nextArrival === arrival) {
        return;
      }

      setDeparture(nextDeparture);
      setArrival(nextArrival);
      clearAdvancedSearch();
      setLastAdvancedPayload(null);
      setQueryParams({
        departureLocation: nextDeparture || undefined,
        arrivalLocation: nextArrival || undefined,
        minSeats: desiredSeats,
      });
    }, 450);

    return () => clearTimeout(timeout);
  }, [
    isScreenActive,
    clearAdvancedSearch,
    arrival,
    departure,
    desiredSeats,
    draftArrival,
    draftDeparture,
  ]);

  const handleApplySearch = () => {
    if (!isScreenActive) return;
    const nextDeparture = draftDeparture.trim();
    const nextArrival = draftArrival.trim();
    setDeparture(nextDeparture);
    setArrival(nextArrival);
    clearAdvancedSearch();
    setLastAdvancedPayload(null);
    setQueryParams({
      departureLocation: nextDeparture || undefined,
      arrivalLocation: nextArrival || undefined,
      minSeats: desiredSeats,
    });
    void trackEvent('search_submitted', {
      search_mode: 'text',
      has_departure: Boolean(nextDeparture),
      has_arrival: Boolean(nextArrival),
      seats: desiredSeats,
    });
  };

  const updateDesiredSeats = (nextSeats: number) => {
    setDesiredSeats(clampSearchSeats(nextSeats));
  };

  const handleRetry = () => {
    if (!isScreenActive) return;
    if (searchMode === 'requests') {
      if (isDriverAccount) {
        refetchAvailableTripRequests();
      }
      return;
    }

    refetch();
  };

  const handleCreateTripRequest = () => {
    router.push(
      getTripRequestCreateHref({
        departure: draftDeparture || departure,
        arrival: draftArrival || arrival,
        seats: desiredSeats,
      }),
    );
  };

  const searchResultData = useMemo<SearchResultListItem[]>(() => {
    if (isLoadingResults || currentError) {
      return [];
    }

    if (searchMode === 'requests') {
      return filteredTripRequests.map((request) => ({ kind: 'request' as const, request }));
    }

    return filteredTrips.map((trip) => ({ kind: 'trip' as const, trip }));
  }, [currentError, filteredTripRequests, filteredTrips, isLoadingResults, searchMode]);

  const resultsCount = searchMode === 'requests' ? requestResults?.total ?? 0 : filteredTrips.length;
  const resultsCountLabel =
    searchMode === 'requests'
      ? `${resultsCount} commande${resultsCount > 1 ? 's' : ''}`
      : `${resultsCount} trajet${resultsCount > 1 ? 's' : ''}`;

  return {
    router, firstName, avatarUri, openingTripId,
    openingRequestId, handleOpenTrip, handleOpenTripRequest, searchResultData,
    draftDeparture, draftArrival, setDraftDeparture, setDraftArrival,
    desiredSeats, updateDesiredSeats, searchMode, setSearchMode,
    sortMode, setSortMode, resultsCountLabel, isRefreshingResults,
    isLoadingResults, currentError, handleRetry, handleApplySearch,
    filteredTrips, filteredTripRequests, handleCreateTripRequest, isDriverAccount,
    hasNextPage: searchMode === 'requests' ? Boolean(requestResults?.hasMore) : hasNextPage,
    hasPreviousPage: searchMode === 'requests' ? requestPage > 1 : hasPreviousPage,
    loadNextTrips: searchMode === 'requests' ? () => { if (isScreenActive && !requestsFetching && requestResults?.hasMore) setRequestPaging({ key: requestKey, page: requestPage + 1 }); } : loadNextTrips,
    loadPreviousTrips: searchMode === 'requests' ? () => { if (isScreenActive && !requestsFetching && requestPage > 1) setRequestPaging({ key: requestKey, page: requestPage - 1 }); } : loadPreviousTrips,
  };
}
