import * as Location from 'expo-location';
import { AppState, Linking, Platform } from 'react-native';
import { requestLocationPermission, waitForLocationPermission as wait } from './locationPermissionWait';

export type LocationAccessIssue = 'permission' | 'settings' | 'services';

/** Read real OS state, not a cached Redux permission. Prompts are user initiated. */
export async function checkForegroundLocationAccess(signal: AbortSignal, current: () => boolean,
  prompt = false): Promise<LocationAccessIssue | null> {
  let permission = await wait(Location.getForegroundPermissionsAsync(), signal);
  if (prompt && !permission.granted && permission.canAskAgain !== false) {
    permission = await wait(requestLocationPermission(() => Location.requestForegroundPermissionsAsync(),
      () => !signal.aborted && current()), signal, null);
  }
  if (!permission.granted) return permission.canAskAgain === false ? 'settings' : 'permission';
  return await wait(Location.hasServicesEnabledAsync(), signal) ? null : 'services';
}

/** Public settings APIs only: iOS has no supported deep link to the global GPS switch. */
export async function openLocationAccessSettings(issue: LocationAccessIssue, signal: AbortSignal, current: () => boolean) {
  if (signal.aborted || !current() || AppState.currentState !== 'active') return false;
  if (issue === 'services' && Platform.OS === 'android') {
    try { await wait(Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS'), signal); return true; }
    catch {
      if (signal.aborted || !current() || AppState.currentState !== 'active') return false;
    }
  }
  await wait(Linking.openSettings(), signal);
  return true;
}

