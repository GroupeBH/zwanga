

export type LatLng = { latitude: number; longitude: number };

export interface RouteInfo {
  coordinates: LatLng[];
  duration: number; // Duration in seconds
  distance: number; // Distance in meters
}
