import type { MapCoordinate } from '@/utils/tripCoordinates';
import type { RequestVehicleMarker } from './requestSearchModel';

export type SearchMapRegion = MapCoordinate & { latitudeDelta: number; longitudeDelta: number };
export const MAX_INDIVIDUAL_SEARCH_MARKERS = 80;
type VehiclePin = { kind: 'vehicle'; vehicle: RequestVehicleMarker };
type VehicleGroup = { kind: 'group'; id: string; count: number; coordinate: MapCoordinate;
  bounds: [MapCoordinate, MapCoordinate] };
export type SearchVehiclePin = VehiclePin | VehicleGroup;

/** View-only grouping. Never truncate candidates, round stored GPS or change dispatch. */
export function clusterSearchVehicles(vehicles: RequestVehicleMarker[], region: SearchMapRegion): SearchVehiclePin[] {
  if (![region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta].every(Number.isFinite)
    || region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return [];
  const south = region.latitude - region.latitudeDelta * 0.6;
  const west = region.longitude - region.longitudeDelta * 0.6;
  const height = region.latitudeDelta * 1.2, width = region.longitudeDelta * 1.2;
  const visible = vehicles.filter(v => v.latitude >= south && v.latitude <= south + height
    && v.longitude >= west && v.longitude <= west + width);
  if (visible.length <= MAX_INDIVIDUAL_SEARCH_MARKERS) return visible.map(vehicle => ({ kind: 'vehicle', vehicle }));
  // At most 8 × 8 native markers, even with hundreds of coincident coordinates.
  const cells = new Map<string, RequestVehicleMarker[]>();
  for (const vehicle of visible) {
    const row = Math.min(7, Math.floor((vehicle.latitude - south) / height * 8));
    const col = Math.min(7, Math.floor((vehicle.longitude - west) / width * 8));
    const key = `${row}:${col}`;
    const cell = cells.get(key) ?? [];
    cell.push(vehicle); cells.set(key, cell);
  }
  return [...cells.entries()].map(([id, cell]): SearchVehiclePin => {
    if (cell.length === 1) return { kind: 'vehicle', vehicle: cell[0] };
    const latitudes = cell.map(v => v.latitude), longitudes = cell.map(v => v.longitude);
    return { kind: 'group', id, count: cell.length,
      coordinate: { latitude: latitudes.reduce((sum, n) => sum + n, 0) / cell.length,
        longitude: longitudes.reduce((sum, n) => sum + n, 0) / cell.length },
      bounds: [
        { latitude: Math.min(...latitudes) - 0.0001, longitude: Math.min(...longitudes) - 0.0001 },
        { latitude: Math.max(...latitudes) + 0.0001, longitude: Math.max(...longitudes) + 0.0001 },
      ] };
  });
}
