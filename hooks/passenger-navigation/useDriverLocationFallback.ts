import { useEffect, useState } from 'react';
import { trackingSocket } from '@/services/trackingSocket';
import { useGetDriverLocationQuery } from '@/store/api/tripApi';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

const SOCKET_POSITION_STALE_MS = 15_000;

/** REST is a rescue transport, not a second live position feed. */
export function useDriverLocationFallback(tripId: string, enabled: boolean) {
  const [healthyTripId, setHealthyTripId] = useState<string | null>(null);
  useEffect(() => {
    setHealthyTripId(null);
    if (!enabled || !tripId) return;
    let connected = false;
    let lastPositionAt = -Infinity;
    let healthy = false;
    const check = () => {
      const next = connected && Date.now() - lastPositionAt < SOCKET_POSITION_STALE_MS;
      if (next === healthy) return;
      healthy = next;
      setHealthyTripId(next ? tripId : null);
    };
    const unsubscribeConnection = trackingSocket.subscribeToConnectionState((value) => {
      connected = value;
      if (!connected) lastPositionAt = -Infinity;
      check();
    });
    const unsubscribeLocation = trackingSocket.subscribeToDriverLocation((payload) => {
      if (payload.tripId !== tripId || !payload.coordinates) return;
      if (!normalizeTripMapCoordinate(payload.coordinates[1], payload.coordinates[0])) return;
      const timestamp = payload.updatedAt ? Date.parse(payload.updatedAt) : NaN;
      if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5000) return;
      lastPositionAt = Math.max(lastPositionAt, timestamp);
      check();
    });
    const timer = setInterval(check, 5000);
    return () => {
      clearInterval(timer);
      unsubscribeConnection();
      unsubscribeLocation();
    };
  }, [enabled, tripId]);

  const needsFallback = enabled && Boolean(tripId) && healthyTripId !== tripId;
  const { currentData } = useGetDriverLocationQuery(tripId, {
    skip: !needsFallback,
    pollingInterval: needsFallback ? 10_000 : 0,
    skipPollingIfUnfocused: true,
    refetchOnMountOrArgChange: true,
  });
  return currentData;
}
