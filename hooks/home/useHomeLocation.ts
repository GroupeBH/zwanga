import type { MapCoordinate } from '@/features/home/homeTypes';
import { useUserLocation } from '@/hooks/useUserLocation';
import {
  normalizeTripMapCoordinate
} from '@/utils/tripCoordinates';
import { useMemo } from 'react';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeDriverActivity } from '@/hooks/home/useHomeDriverActivity';
type Props =
  Pick<ReturnType<typeof useHomeContext>,
    'isFocused'
    | 'trackedTripInfo'
  >
  & Pick<ReturnType<typeof useHomeDriverActivity>,
    'ongoingDriverTrip'
  >;
export function useHomeLocation({ isFocused, trackedTripInfo, ongoingDriverTrip }: Props) {
  const { getCurrentLocation, lastKnownLocation } = useUserLocation({
    autoRequest: isFocused,
    rideLocationKey: ongoingDriverTrip ? `driver:${ongoingDriverTrip.id}`
      : trackedTripInfo?.bookingId ? `passenger:${trackedTripInfo.bookingId}` : null,
    trackingProfile:
      trackedTripInfo || ongoingDriverTrip
        ? 'navigation'
        : 'nearby',
  });

  const liveUserCoordinate = useMemo<MapCoordinate | null>(() => {
    return normalizeTripMapCoordinate(
      lastKnownLocation?.coords?.latitude,
      lastKnownLocation?.coords?.longitude,
    );
  }, [lastKnownLocation?.coords?.latitude, lastKnownLocation?.coords?.longitude]);
  return { lastKnownLocation, liveUserCoordinate, getCurrentLocation };
}
