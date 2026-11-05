import type { User, TripRequestVehicleType } from '@/types';
import type { SelectedRequestDriver } from '@/store/api/requestDriverApi';

export const routeUuid = (value: unknown): string => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : '';

export function profileRequestDriver(driver: User | undefined, userId: string | undefined, preferredType?: unknown): SelectedRequestDriver | null {
  if (!driver || !userId || driver.id === userId || !routeUuid(driver.id) ||
    !(driver.isDriver || driver.role === 'driver')) return null;
  const vehicles = driver.vehicles?.filter(v => v.isActive &&
    ['car', 'motorcycle_2_wheels', 'motorcycle_3_wheels'].includes(v.type)) ?? [];
  const vehicle = vehicles.find(v => v.type === preferredType) ?? vehicles[0];
  if (!vehicle) return null;
  return { id: driver.id, name: [driver.firstName, driver.lastName].filter(Boolean).join(' ').trim() || driver.name || 'Conducteur',
    vehicle: [vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(' '),
    vehicleType: vehicle.type as TripRequestVehicleType, distanceKm: null };
}

export function driverProfileContext(id: unknown, requestId: unknown) {
  const fromMap = requestId !== undefined;
  const markerId = typeof id === 'string' && /^[a-f0-9]{64}$/.test(id) ? id : '';
  return { fromMap, requestId: routeUuid(requestId), markerId,
    driverId: fromMap ? '' : routeUuid(id), valid: fromMap ? !!routeUuid(requestId) && !!markerId : !!routeUuid(id) };
}
