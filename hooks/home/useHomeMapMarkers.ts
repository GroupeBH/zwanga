import { useCallback, useMemo } from 'react';
import type { Trip, TripRequest } from '@/types';
import { buildHomeMapMarkers, homeMapMarkerSummary, type HomeMapMarker } from '@/features/home/homeMapMarkers';

const NO_MARKERS: HomeMapMarker[] = [];

/** Map pins reuse lists Home already loaded: no extra query, socket or location read.
 * Hidden during an ongoing trip so the map keeps its single purpose. */
export function useHomeMapMarkers({ enabled = true, isDriver, latestTrips, availableDriverRequests, hiddenHomePriorities,
  openTripDetail, openTripRequestDetail }: {
  enabled?: boolean;
  isDriver: boolean;
  latestTrips?: Trip[];
  availableDriverRequests?: TripRequest[];
  hiddenHomePriorities?: Record<string, boolean>;
  openTripDetail?: (tripId: string) => void;
  openTripRequestDetail?: (requestId: string) => void;
}) {
  const homeMapMarkers = useMemo(() => enabled ? buildHomeMapMarkers({
    isDriver, latestTrips: latestTrips ?? [], availableDriverRequests: availableDriverRequests ?? [], hiddenHomePriorities,
  }) : NO_MARKERS, [availableDriverRequests, enabled, hiddenHomePriorities, isDriver, latestTrips]);
  const openHomeMapMarker = useCallback((marker: HomeMapMarker) => {
    if (marker.kind === 'trip') openTripDetail?.(marker.id); else openTripRequestDetail?.(marker.id);
  }, [openTripDetail, openTripRequestDetail]);
  return { homeMapMarkers, homeMapMarkerSummary: homeMapMarkerSummary(isDriver, homeMapMarkers.length), openHomeMapMarker };
}
