import * as Location from 'expo-location';
import { requestCurrentLocation } from '@/services/currentLocationRequest';
import { waitForLocationPermission as wait } from '@/services/locationPermissionWait';
import { hasActiveRideLocationSession, isNearbyDriverLocationEnabled } from '@/services/nearbyDriverLocation';
import { isUsableNearbyDriverPosition } from '@/services/nearbyDriverLocationPolicy';
import { sendNearbyDriverPosition } from '@/services/nearbyDriverPositionDelivery';

export type DriverPositionRefreshResult = 'sent' | 'permission' | 'disabled' | 'gps' | 'retry' | 'cancelled';

/** One explicit Home action. Never enables discovery or starts a background task. */
export async function refreshDriverPosition(userId: string, signal: AbortSignal,
  isCurrent: () => boolean): Promise<DriverPositionRefreshResult> {
  const current = () => !signal.aborted && isCurrent();
  if (!current()) return 'cancelled';
  try {
    const [enabled, ride, permission, gps] = await wait(Promise.all([
      isNearbyDriverLocationEnabled(userId), hasActiveRideLocationSession(),
      Location.getForegroundPermissionsAsync(), Location.hasServicesEnabledAsync(),
    ]), signal);
    if (!current()) return 'cancelled';
    if (!enabled) return 'disabled';
    if (ride) return 'retry';
    if (!permission.granted) return 'permission';
    if (!gps) return 'gps';
    const position = await requestCurrentLocation(true, signal, {
      maxAge: 15_000, requiredAccuracy: 250, fallback: false,
    });
    if (!current()) return 'cancelled';
    // Even a native cached/watch result must be recent; never relabel an old fix as current.
    if (!position || !isUsableNearbyDriverPosition(position) || Date.now() - position.timestamp > 15_000) return 'gps';
    // Reuses the authenticated transport, shared send lock, backoff and ride/opt-out guards.
    // The endpoint updates the status cache only from the server acknowledgement.
    const result = await sendNearbyDriverPosition(userId, position, current);
    if (!current()) return 'cancelled';
    return result === 'sent' ? 'sent' : 'retry';
  } catch {
    return current() ? 'retry' : 'cancelled';
  }
}
