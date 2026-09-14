import { Platform } from 'react-native';
import { PROVIDER_GOOGLE, type Region } from 'react-native-maps';

export const MAX_LIVE_PASSENGER_MARKERS = Platform.OS === 'ios' ? 10 : 16;

export const HOME_MAP_ANIMATION_MIN_INTERVAL_MS = Platform.OS === 'ios' ? 1200 : 700;

export const IS_ANDROID = Platform.OS === 'android';

export const HOME_MAP_PROVIDER = IS_ANDROID ? PROVIDER_GOOGLE : undefined;

export const TRIP_MARKER_ANCHOR = { x: 0.5, y: 0.5 };

export const TRIP_REQUEST_MARKER_ANCHOR = { x: 0.5, y: 0.92 };

export const USER_LOCATION_MARKER_ANCHOR = { x: 0.5, y: 0.5 };

export const KINSHASA_REGION: Region = {
  latitude: -4.325,
  longitude: 15.3222,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};
