import type { MapLocationSelection } from '@/components/LocationPickerModal';
import { getRouteLocationCoordinates, type RouteLocationSource, type RouteStopLabel } from '@/utils/routeLocationLabels';

export type BookingPointLabel = { text: string; hint?: string };
export type BookingLocationLabels = { origin: BookingPointLabel; destination: BookingPointLabel };

/** A passenger-selected point must never borrow the driver's endpoint address. */
export function bookingLocationSource(selection: MapLocationSelection | null, manualAddress: string,
  tripEndpoint: RouteLocationSource | undefined): RouteLocationSource | undefined {
  if (manualAddress.trim()) return { address: manualAddress.trim() };
  if (selection) return { name: selection.title, address: selection.address,
    lat: selection.latitude, lng: selection.longitude };
  return tripEndpoint;
}

export function bookingPointLabel(source: RouteLocationSource | undefined, label: RouteStopLabel): BookingPointLabel {
  if (label.isResolved) return { text: label.address };
  if (getRouteLocationCoordinates(source)) return label.isResolving
    ? { text: 'Recherche de l’adresse…' }
    : { text: 'Position choisie sur la carte', hint: 'Touchez pour voir ou préciser le lieu.' };
  return { text: 'Choisir un lieu', hint: 'Sur la carte ou en saisissant une adresse.' };
}
