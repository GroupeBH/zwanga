import { MapLocationSelection } from '@/components/LocationPickerModal';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

export function getLocationText(selection: MapLocationSelection | null, manualAddress: string) {
  return (manualAddress.trim() || selection?.title || selection?.address || '').trim();
}

export function getLocationCoordinates(selection: MapLocationSelection | null): [number, number] | undefined {
  const coordinate = selection
    ? normalizeTripMapCoordinate(selection.latitude, selection.longitude)
    : null;
  if (!coordinate) {
    return undefined;
  }
  return [coordinate.longitude, coordinate.latitude];
}
