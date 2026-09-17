export const VEHICLE_PLATE_EXAMPLE = '1234AB56';
export const VEHICLE_PLATE_FORMAT_MESSAGE =
  'La plaque doit contenir 4 chiffres, 2 lettres puis 2 chiffres, par exemple 1234AB56.';

export function normalizeVehiclePlate(value?: string | null): string {
  // Accept ordinary separators, but never truncate or remove an invalid letter/digit.
  // Only ASCII letters are uppercased: e.g. ß must not silently become SS.
  return (value ?? '').replace(/[\s-]/g, '').replace(/[a-z]/g, letter => letter.toUpperCase());
}

export function isValidVehiclePlate(value?: string | null): boolean {
  return /^[0-9]{4}[A-Z]{2}[0-9]{2}$/.test(normalizeVehiclePlate(value));
}
