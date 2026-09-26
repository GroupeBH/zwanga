import type { Trip } from '@/types';

export const isPickupAwarenessEvent = (type: string) =>
  ['driver_near_pickup', 'driver_arrived_pickup', 'parties_nearby'].includes(type);

/** Fill missing details from the same ride, preserving its current driver/vehicle assignment. */
export function resolvePickupVehicleTrip(tripId: string, preferred?: Trip | null, fallback?: Trip | null): Trip | undefined {
  const current = preferred?.id === tripId ? preferred : undefined;
  const previous = fallback?.id === tripId ? fallback : undefined;
  if (!current) return previous;
  const previousDriverId = previous?.driverId || previous?.driver?.id;
  const sameDriver = Boolean(current.driverId && current.driverId === previousDriverId);
  const conflictingDriver = Boolean(current.driverId && previousDriverId && !sameDriver);
  const vehicle = current.vehicle || current.vehicleId === null || conflictingDriver
    ? current.vehicle
    : previous?.vehicle && (!current.vehicleId || previous.vehicle.id === current.vehicleId)
      ? previous.vehicle : current.vehicle;
  const driver = current.driver ?? (sameDriver ? previous?.driver : undefined);
  if (vehicle === current.vehicle && (!driver || driver === current.driver)) return current;
  return { ...current, ...(vehicle ? { vehicle } : {}), ...(driver ? { driver } : {}) };
}

export function pickupVehicleDetails(trip?: Trip | null) {
  const vehicle = trip?.vehicle;
  // vehicleInfo is a trip description in the mapper, not a reliable vehicle name.
  return {
    name: [vehicle?.brand?.trim(), vehicle?.model?.trim()].filter(Boolean).join(' '),
    color: vehicle?.color?.trim() || '',
    plate: vehicle?.licensePlate?.trim() || '',
  };
}

export function pickupDistanceText(distanceMeters?: number): string {
  return typeof distanceMeters === 'number' && Number.isFinite(distanceMeters) && distanceMeters >= 0
    ? `À environ ${Math.max(1, Math.round(distanceMeters))} m.` : '';
}

/** Use the vehicle attached to this trip, never the driver's default vehicle. */
export function pickupVehicleReminder(trip?: Trip | null): string {
  const { name, color, plate } = pickupVehicleDetails(trip);
  return [
    `Véhicule : ${name || 'à vérifier avec le conducteur'}.`,
    `Couleur : ${color || 'non renseignée'}.`,
    `Plaque : ${plate || 'non renseignée'}.`,
    'Vérifiez ces informations avant de monter.',
  ].join(' ');
}

export function passengerPickupInstruction(type: string, distanceMeters?: number): string {
  return type === 'driver_near_pickup'
    ? `Le conducteur approche. ${pickupDistanceText(distanceMeters)} Préparez-vous à le rejoindre.`
    : type === 'parties_nearby'
      ? 'Signalez-vous au conducteur si vous êtes prêt.'
      : 'Rejoignez le conducteur au point de prise en charge.';
}

export function passengerPickupMessage(type: string, distanceMeters?: number, vehicleReminder = pickupVehicleReminder()): string {
  return `${passengerPickupInstruction(type, distanceMeters)} ${vehicleReminder}`;
}
