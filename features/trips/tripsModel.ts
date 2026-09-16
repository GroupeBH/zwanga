import { type MapLocationSelection } from '@/components/LocationPickerModal';
import type { Booking, Trip } from '@/types';

export type MainTab = 'published' | 'bookings';
export type SubTab = 'upcoming' | 'completed';
export type EditTripStep = 1 | 2;
export type TripListItem =
  | { kind: 'published'; trip: Trip }
  | { booking: Booking; kind: 'booking' };

export const normalizeSearchText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const getLocationText = (selection: MapLocationSelection | null, manualAddress: string) =>
  (manualAddress.trim() || selection?.title || selection?.address || '').trim();

export const getLocationCoordinatesTuple = (
  selection: MapLocationSelection | null,
): [number, number] | undefined => {
  if (!selection || !Number.isFinite(selection.latitude) || !Number.isFinite(selection.longitude)) {
    return undefined;
  }
  return [selection.longitude, selection.latitude];
};

export const getDefaultFutureDate = () => {
  const base = new Date();
  base.setMinutes(0, 0, 0);
  base.setHours(base.getHours() + 1);
  return base;
};
