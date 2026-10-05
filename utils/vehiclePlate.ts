export const VEHICLE_PLATE_FORMAT_MESSAGE =
  'Veuillez renseigner la plaque d’immatriculation du véhicule.';

export function normalizeVehiclePlate(value?: string | null): string {
  // Keep the existing server-compatible normalization without imposing a plate format.
  // Never truncate or remove a letter/digit.
  // Only ASCII letters are uppercased: e.g. ß must not silently become SS.
  return (value ?? '').replace(/[\s-]/g, '').replace(/[a-z]/g, letter => letter.toUpperCase());
}

export function isValidVehiclePlate(value?: string | null): boolean {
  return normalizeVehiclePlate(value).length > 0;
}
