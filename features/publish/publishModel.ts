import { MapLocationSelection } from '@/components/LocationPickerModal';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { boundedRoutePoints, routeBounds } from '@/utils/routes/safePolyline';
import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import { Platform } from 'react-native';
import { PROVIDER_GOOGLE, type Region } from 'react-native-maps';

export type PublishStep = 'route' | 'datetime' | 'vehicle' | 'pricing' | 'confirm';
export type PublicationSuccess = { recurring: boolean } | null;
export type LatLng = { latitude: number; longitude: number };
export type RoutePointStatus = 'confirmed' | 'suggested' | null;
export type IOSDateTimePickerProps = React.ComponentProps<typeof DateTimePicker> & {
  accentColor?: string;
  display?: 'default' | 'compact' | 'inline' | 'spinner';
  locale?: string;
  minuteInterval?: number;
  textColor?: string;
  themeVariant?: 'dark' | 'light';
};
export const PUBLISH_STEP_ORDER: PublishStep[] = ['route', 'datetime', 'vehicle', 'pricing', 'confirm'];
export const IOSDateTimePicker = DateTimePicker as React.ComponentType<IOSDateTimePickerProps>;
export const DEFAULT_PUBLISH_REGION: Region = {
  latitude: -4.441931,
  longitude: 15.266293,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};
export const PUBLISH_MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

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

export function getMapCoordinate(selection: MapLocationSelection | null): LatLng | null {
  const coordinate = selection
    ? normalizeTripMapCoordinate(selection.latitude, selection.longitude)
    : null;
  if (!coordinate) {
    return null;
  }

  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
}

export function areSameCoordinate(left: LatLng, right: LatLng) {
  return (
    Math.abs(left.latitude - right.latitude) < 0.00001 &&
    Math.abs(left.longitude - right.longitude) < 0.00001
  );
}

export function getRenderableRouteCoordinates(
  coordinates: LatLng[],
  origin: LatLng,
  destination: LatLng,
) {
  const safeCoordinates = boundedRoutePoints(coordinates);
  if (safeCoordinates.length < 2) {
    return [];
  }

  const isStraightFallback =
    safeCoordinates.length === 2 &&
    areSameCoordinate(safeCoordinates[0], origin) &&
    areSameCoordinate(safeCoordinates[1], destination);

  return isStraightFallback ? [] : safeCoordinates;
}

export function buildRoutePreviewRegion(points: LatLng[]): Region {
  const bounds = routeBounds(points);
  if (!bounds) {
    return DEFAULT_PUBLISH_REGION;
  }

  if (points.length === 1) {
    return {
      latitude: points[0].latitude,
      longitude: points[0].longitude,
      latitudeDelta: 0.035,
      longitudeDelta: 0.035,
    };
  }

  const { minLatitude, maxLatitude, minLongitude, maxLongitude } = bounds;

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.35, 0.035),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.35, 0.035),
  };
}

export { isDriverAccount as isUserDriver } from '@/utils/accountRole';
