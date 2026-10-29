import type { MapCoordinate } from '@/utils/tripCoordinates';
import type { RequestVehicleMarker } from './requestSearchModel';

/** Fit actual nearby positions, not an arbitrary city-wide square. Never move a marker. */
export function requestSearchBounds(departure: MapCoordinate, vehicles: RequestVehicleMarker[]): [MapCoordinate, MapCoordinate] {
  const coordinates = [departure, ...vehicles.filter(vehicle => Number.isFinite(vehicle.latitude) &&
    Number.isFinite(vehicle.longitude) && Math.abs(vehicle.latitude) <= 90 && Math.abs(vehicle.longitude) <= 180)];
  const latitudes = coordinates.map(point => point.latitude), longitudes = coordinates.map(point => point.longitude);
  const south = Math.min(...latitudes), north = Math.max(...latitudes);
  const west = Math.min(...longitudes), east = Math.max(...longitudes);
  const latitude = (south + north) / 2, longitude = (west + east) / 2;
  // Street-level context for a nearby fleet; a wider neighbourhood while no positions are known.
  const minimumHalfSpan = coordinates.length > 1 ? 0.004 : 0.014;
  const halfLatitude = Math.max(minimumHalfSpan, (north - south) / 2);
  const halfLongitude = Math.max(minimumHalfSpan, (east - west) / 2);
  return [
    { latitude: Math.max(-90, latitude - halfLatitude), longitude: Math.max(-180, longitude - halfLongitude) },
    { latitude: Math.min(90, latitude + halfLatitude), longitude: Math.min(180, longitude + halfLongitude) },
  ];
}
