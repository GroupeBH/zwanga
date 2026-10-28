import type { Booking, Trip, TripRequest, TripRequestVehicleType } from '@/types';
import type { TrackedLocation } from '@/store/slices/locationSlice';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { isRequestUnassigned, isTripRequestWithinAcceptanceWindow } from '@/features/trip-request/requestExpiration';

export type RequestSearchVehicle = { id: string; latitude: number; longitude: number;
  vehicleType: TripRequestVehicleType; positionUpdatedAt: string };
export type RequestVehicleMarker = RequestSearchVehicle & { ageMs: number };
export type RequestSearchSnapshot = { requestId: string; searching: boolean; generatedAt: string; radiusKm: number;
  total: number; vehicles?: RequestSearchVehicle[]; truncated?: boolean };

export function showRequestSearchMap(request: TripRequest | undefined, userId: string | undefined, now = Date.now()) {
  return !!request && !!userId && request.passengerId === userId && isRequestUnassigned(request) &&
    isTripRequestWithinAcceptanceWindow(request, now);
}

/** Dispatch stops at the latest departure, before the request's editable grace period ends. */
export function requestSearchPhase(request: Pick<TripRequest, 'id' | 'departureDateMax'>,
  snapshot: RequestSearchSnapshot | undefined, now: number, receivedAt?: number) {
  const generatedAt = Date.parse(snapshot?.generatedAt ?? '');
  const current = snapshot?.requestId === request.id && Number.isFinite(generatedAt) &&
    receivedAt !== undefined && Number.isFinite(receivedAt) && now >= receivedAt && now - receivedAt <= 90_000;
  const serverNow = current ? generatedAt + now - receivedAt! : now;
  const deadline = Date.parse(request.departureDateMax);
  if (Number.isFinite(deadline) && deadline <= serverNow) return 'past-departure';
  return current && !snapshot.searching ? 'inactive' : 'searching';
}

/** Invalid/stale/account-mismatched data must never become a native map coordinate. */
export function searchVehicles(snapshot: RequestSearchSnapshot | undefined, requestId: string, now = Date.now(),
  receivedAt = Date.parse(snapshot?.generatedAt ?? '')) {
  if (snapshot?.requestId !== requestId || !snapshot.searching || !Number.isFinite(Date.parse(snapshot.generatedAt)) ||
    !Number.isFinite(receivedAt) || now - receivedAt > 90_000 || receivedAt - now > 60_000) return [];
  const seen = new Set<string>();
  const vehicles: RequestVehicleMarker[] = [];
  for (const vehicle of Array.isArray(snapshot.vehicles) ? snapshot.vehicles : []) {
    if (!vehicle || typeof vehicle.id !== 'string' || !vehicle.id || seen.has(vehicle.id) ||
      !['car', 'motorcycle_2_wheels', 'motorcycle_3_wheels'].includes(vehicle.vehicleType) ||
      typeof vehicle.positionUpdatedAt !== 'string') continue;
    const coordinate = normalizeTripMapCoordinate(vehicle.latitude, vehicle.longitude);
    const recordedAt = Date.parse(vehicle.positionUpdatedAt);
    const serverAge = Date.parse(snapshot.generatedAt) - recordedAt;
    if (!coordinate || !Number.isFinite(recordedAt) || recordedAt <= 0 || serverAge < -60_000) continue;
    seen.add(vehicle.id);
    vehicles.push({ id: vehicle.id, ...coordinate, vehicleType: vehicle.vehicleType,
      positionUpdatedAt: vehicle.positionUpdatedAt, ageMs: Math.max(0, serverAge) + Math.max(0, now - receivedAt) });
    if (vehicles.length === 500) break;
  }
  return vehicles;
}

export function searchVehicleAppearance(vehicle: RequestVehicleMarker) {
  const minutes = Math.floor(vehicle.ageMs / 60_000);
  const age = minutes < 1 ? 'moins d’une minute' : minutes < 60 ? `${minutes} min` : minutes < 1440
    ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 1440)} j`;
  const old = vehicle.ageMs >= 10 * 60_000;
  return {
    imageType: vehicle.vehicleType === 'motorcycle_2_wheels' ? 'moto' as const :
      vehicle.vehicleType === 'motorcycle_3_wheels' ? 'tricycle' as const : 'car' as const,
    title: vehicle.vehicleType === 'motorcycle_2_wheels' ? 'Moto' : vehicle.vehicleType === 'motorcycle_3_wheels' ? 'Tricycle' : 'Voiture',
    description: `Dernière position connue : il y a ${age}${old ? ' · position ancienne' : ''}`,
    opacity: old ? 0.55 : 1,
  };
}

export function searchPassengerPosition(location: TrackedLocation | null, now = Date.now()) {
  if (!location || !Number.isFinite(location.timestamp) || now - location.timestamp > 120_000 ||
    location.timestamp > now + 60_000) return null;
  return normalizeTripMapCoordinate(location.coords.latitude, location.coords.longitude);
}

export function assignedPassengerNavigation(request: TripRequest | undefined, trip: Trip | undefined,
  bookings: Booking[] | undefined, userId: string | undefined) {
  if (!userId || request?.passengerId !== userId || !request.tripId || request.tripId !== trip?.id ||
    request.status === 'cancelled' || (trip.status === 'upcoming' && request.status !== 'driver_selected') ||
    !['upcoming', 'ongoing'].includes(trip.status) || trip.driverId === userId) return null;
  const booking = bookings?.find(item => item.tripId === trip.id && item.passengerId === userId &&
    item.status === 'accepted' && !item.cancelledAt && !item.droppedOff && !item.droppedOffConfirmedByPassenger);
  return booking ? `/booking/navigate/${booking.id}` as const : null;
}
