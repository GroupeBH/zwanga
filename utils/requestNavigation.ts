import type { Href } from 'expo-router';
import { getPickerCoordinate, type MapLocationSelection } from '@/features/location-picker/locationPickerModel';

type TripRequestCreateParams = {
  entry?: 'home';
  arrival?: string;
  departure?: string;
  seats?: number;
  departureLocation?: MapLocationSelection;
  arrivalLocation?: MapLocationSelection;
};

export function getTripRequestCreateHref(params?: TripRequestCreateParams): Href {
  const selection = params?.departureLocation;
  const point = selection && getPickerCoordinate(selection.latitude, selection.longitude);
  const destination = params?.arrivalLocation;
  const destinationPoint = destination && getPickerCoordinate(destination.latitude, destination.longitude);
  const cleanParams = {
    ...(params?.entry === 'home' ? { entry: 'home' } : {}),
    ...(params?.departure?.trim() ? { departure: params.departure.trim() } : {}),
    ...(selection && point ? {
      departure: selection.title.trim() || selection.address.trim() || 'Point de départ',
      departureAddress: selection.address,
      departureLat: String(point.latitude), departureLng: String(point.longitude),
    } : {}),
    ...(params?.arrival?.trim() ? { arrival: params.arrival.trim() } : {}),
    ...(destination && destinationPoint ? {
      arrival: destination.title.trim() || destination.address.trim() || 'Destination',
      arrivalAddress: destination.address,
      arrivalLat: String(destinationPoint.latitude), arrivalLng: String(destinationPoint.longitude),
    } : {}),
    ...(params?.seats ? { seats: String(params.seats) } : {}),
  };

  return {
    pathname: '/request-create',
    ...(Object.keys(cleanParams).length > 0 ? { params: cleanParams } : {}),
  };
}

export type RequestDepartureParams = {
  departure?: string; departureAddress?: string; departureLat?: string; departureLng?: string;
};

export type RequestArrivalParams = {
  arrival?: string; arrivalAddress?: string; arrivalLat?: string; arrivalLng?: string;
};

export function getRequestArrivalSelection(params: RequestArrivalParams): MapLocationSelection | null {
  if (typeof params.arrivalLat !== 'string' || !params.arrivalLat.trim() ||
      typeof params.arrivalLng !== 'string' || !params.arrivalLng.trim()) return null;
  const point = getPickerCoordinate(Number(params.arrivalLat), Number(params.arrivalLng));
  if (!point) return null;
  const title = typeof params.arrival === 'string' ? params.arrival.trim() : '';
  const address = typeof params.arrivalAddress === 'string' ? params.arrivalAddress.trim() : '';
  return { ...point, title: title || address || 'Destination', address: address || title || 'Destination' };
}

/** Coordinates confirmed on the map must not be replaced by a new text geocode or GPS fix. */
export function getRequestDepartureSelection(params: RequestDepartureParams): MapLocationSelection | null {
  if (typeof params.departureLat !== 'string' || !params.departureLat.trim() ||
      typeof params.departureLng !== 'string' || !params.departureLng.trim()) return null;
  const point = getPickerCoordinate(Number(params.departureLat), Number(params.departureLng));
  if (!point) return null;
  const title = typeof params.departure === 'string' ? params.departure.trim() : '';
  const address = typeof params.departureAddress === 'string' ? params.departureAddress.trim() : '';
  return { ...point, title: title || address || 'Point de départ', address: address || title || 'Point de départ' };
}

export function getTripRequestDetailHref(
  requestId: string | number,
  options?: { editSchedule?: boolean },
): Href {
  return {
    pathname: '/request-details/[id]',
    params: {
      id: String(requestId),
      ...(options?.editSchedule ? { editSchedule: '1' } : {}),
    },
  };
}
