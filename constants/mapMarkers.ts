import { Platform } from 'react-native';

const IS_ANDROID = Platform.OS === 'android';

export const MAP_MARKER_ANCHORS = {
  center: { x: 0.5, y: 0.5 },
  pin: { x: 0.5, y: 1 },
  passengerTracking: { x: 0.5, y: 1 },
  vehicleTracking: { x: 0.5, y: 0.5 },
} as const;

export const MAP_MARKER_SIZES = {
  passengerTracking: {
    frameWidth: IS_ANDROID ? 36 : 46,
    frameHeight: IS_ANDROID ? 44 : 54,
    ring: IS_ANDROID ? 36 : 42,
    body: IS_ANDROID ? 28 : 32,
    icon: IS_ANDROID ? 14 : 16,
    tipHalfWidth: IS_ANDROID ? 5 : 7,
    tipHeight: IS_ANDROID ? 8 : 12,
    tipMarginTop: 0,
    elevation: IS_ANDROID ? 3 : 4,
  },
  vehicleTracking: {
    frame: IS_ANDROID ? 58 : 76,
    image: IS_ANDROID ? 42 : 58,
  },
  homeTrip: {
    frame: IS_ANDROID ? 62 : 86,
    shell: IS_ANDROID ? 52 : 70,
    image: IS_ANDROID ? 42 : 58,
    selectedImage: IS_ANDROID ? 48 : 64,
  },
  homeUserLocation: {
    frame: IS_ANDROID ? 46 : 64,
    image: IS_ANDROID ? 42 : 58,
  },
  navigationWaypoint: {
    size: IS_ANDROID ? 40 : 48,
    icon: IS_ANDROID ? 18 : 20,
  },
  navigationDestination: {
    frameWidth: IS_ANDROID ? 56 : 72,
    frameHeight: IS_ANDROID ? 56 : 72,
    body: IS_ANDROID ? 36 : 44,
    icon: IS_ANDROID ? 19 : 22,
    paddingTop: IS_ANDROID ? 4 : 6,
    tipHalfWidth: IS_ANDROID ? 6 : 8,
    tipHeight: IS_ANDROID ? 9 : 12,
  },
  tripDetailMain: {
    size: IS_ANDROID ? 28 : 32,
    icon: IS_ANDROID ? 16 : 18,
    fullscreenIcon: IS_ANDROID ? 18 : 20,
    borderWidth: IS_ANDROID ? 2 : 3,
  },
  tripDetailPassenger: {
    size: IS_ANDROID ? 24 : 28,
    icon: IS_ANDROID ? 13 : 14,
    fullscreenIcon: IS_ANDROID ? 14 : 16,
  },
  requestRoute: {
    size: IS_ANDROID ? 28 : 32,
    icon: IS_ANDROID ? 16 : 18,
    borderWidth: IS_ANDROID ? 2 : 3,
  },
} as const;
