import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import { isFreshLocationObject } from '../../features/driver-navigation/navigationBooking';
import { warnThrottled } from '@/utils/throttledWarning';
import { trackingSocket } from '@/services/trackingSocket';
import { updateDriverBackgroundLocationCheckpoint } from '@/services/driverBackgroundLocationTask';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import * as Location from 'expo-location';
import { useCallback } from 'react';

interface Params {
  data: ReturnType<typeof useDriverNavigationData>;
  mapState: ReturnType<typeof useDriverNavigationMapState>;
  refs: ReturnType<typeof useDriverNavigationRefs>;
}

export function useDriverLocationEmission({
  data,
  mapState,
  refs,
}: Params) {
  const sendDriverLocationToTracking = useCallback(
    (location: Location.LocationObject) => {
      if (!data.tripId || (!data.isTripOngoing && !mapState.isTripOngoingRef.current)) {
        return;
      }

      const coordinate = normalizeTripMapCoordinate(
        location.coords.latitude,
        location.coords.longitude,
      );
      if (!coordinate) {
        console.warn('[Navigation] Position conducteur non envoyée car invalide:', {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        return;
      }

      const coordinates: [number, number] = [
        coordinate.longitude,
        coordinate.latitude,
      ];
      const metadata = {
        ...(typeof location.coords.accuracy === 'number' && location.coords.accuracy >= 0
          ? { accuracy: location.coords.accuracy }
          : {}),
        ...(typeof location.coords.speed === 'number' && location.coords.speed >= 0
          ? { speed: location.coords.speed }
          : {}),
        ...(typeof location.coords.heading === 'number' && location.coords.heading >= 0
          ? { heading: location.coords.heading }
          : {}),
        ...(Number.isFinite(location.timestamp)
          ? { recordedAt: new Date(location.timestamp).toISOString() }
          : {}),
      };

      if (!isFreshLocationObject(location)) {
        return;
      }

      const now = Date.now();
      if (now - mapState.lastBackgroundCheckpointAtRef.current > 10_000) {
        mapState.lastBackgroundCheckpointAtRef.current = now;
        void updateDriverBackgroundLocationCheckpoint(data.tripId, coordinate);
      }

      const requestGuard = data.beginLocationRequest(data.tripId);
      if (!requestGuard) return;
      void (async () => {
        try {
          await trackingSocket.updateDriverLocation(data.tripId, coordinates, metadata);
        } catch (error) {
          if (!requestGuard.isCurrent() || refs.isExitingRef.current) return;
          warnThrottled('[Navigation] Position conducteur socket non envoyée:', error);
          try {
            const request = data.updateDriverLocation({ tripId: data.tripId, coordinates, ...metadata });
            requestGuard.attach(request);
            await request.unwrap();
          } catch (fallbackError) {
            if (requestGuard.isCurrent()) {
              warnThrottled('[Navigation] Position conducteur REST non envoyée:', fallbackError);
            }
          }
        } finally {
          requestGuard.finish();
        }
      })();
    },
    [data.beginLocationRequest, data.isTripOngoing, data.tripId, data.updateDriverLocation],
  );

  return {
    sendDriverLocationToTracking,
  };
}
