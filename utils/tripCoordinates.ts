import type { GeoPoint } from '@/types';

export type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type CoordinateBounds = {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
};

const RDC_BOUNDS: CoordinateBounds = {
  minLatitude: -13.5,
  maxLatitude: 5.5,
  minLongitude: 12,
  maxLongitude: 31.5,
};

export const KINSHASA_BOUNDS: CoordinateBounds = {
  minLatitude: -4.7,
  maxLatitude: -4.1,
  minLongitude: 14.95,
  maxLongitude: 15.65,
};

function isFiniteCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function isInBounds(latitude: number, longitude: number, bounds: CoordinateBounds) {
  return (
    latitude >= bounds.minLatitude &&
    latitude <= bounds.maxLatitude &&
    longitude >= bounds.minLongitude &&
    longitude <= bounds.maxLongitude
  );
}

function isInRdcBounds(latitude: number, longitude: number) {
  return isInBounds(latitude, longitude, RDC_BOUNDS);
}

export function normalizeTripMapCoordinate(
  latitudeValue: unknown,
  longitudeValue: unknown,
): MapCoordinate | null {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  if (!isFiniteCoordinate(latitude, longitude)) {
    return null;
  }

  if (isInRdcBounds(latitude, longitude)) {
    return { latitude, longitude };
  }

  if (isInRdcBounds(longitude, latitude)) {
    return { latitude: longitude, longitude: latitude };
  }

  return null;
}

export function isCoordinateInKinshasaBounds(coordinate?: MapCoordinate | null) {
  const normalizedCoordinate = coordinate
    ? normalizeTripMapCoordinate(coordinate.latitude, coordinate.longitude)
    : null;

  return Boolean(
    normalizedCoordinate &&
      isInBounds(
        normalizedCoordinate.latitude,
        normalizedCoordinate.longitude,
        KINSHASA_BOUNDS,
      ),
  );
}

export function isValidTripMapCoordinate(coordinate?: MapCoordinate | null) {
  return Boolean(coordinate && normalizeTripMapCoordinate(coordinate.latitude, coordinate.longitude));
}

export function areTripMapCoordinatesSame(
  left?: MapCoordinate | null,
  right?: MapCoordinate | null,
  tolerance = 0.00001,
) {
  return Boolean(
    left &&
      right &&
      Math.abs(left.latitude - right.latitude) < tolerance &&
      Math.abs(left.longitude - right.longitude) < tolerance,
  );
}

export function getTripLocationCoordinate(
  location?: { lat?: unknown; lng?: unknown; hasCoordinates?: boolean | null } | null,
): MapCoordinate | null {
  if (!location || location.hasCoordinates === false) {
    return null;
  }

  return normalizeTripMapCoordinate(location.lat, location.lng);
}

export function getGeoPointCoordinate(point?: GeoPoint | null): MapCoordinate | null {
  if (!point?.coordinates || point.coordinates.length < 2) {
    return null;
  }

  const [longitude, latitude] = point.coordinates;
  return normalizeTripMapCoordinate(latitude, longitude);
}
