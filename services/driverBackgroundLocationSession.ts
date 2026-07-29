import AsyncStorage from '@react-native-async-storage/async-storage';

export const ACTIVE_DRIVER_TRIP_ID_KEY = 'zwanga.activeDriverBackgroundTripId';

export type DriverBackgroundLocationCoordinate = {
  latitude: number;
  longitude: number;
};

export type ActiveDriverBackgroundTripSession = {
  tripId: string;
  arrivalCoordinate?: DriverBackgroundLocationCoordinate | null;
  nearDestinationSinceMs?: number | null;
  autoCompleteDistanceMeters?: number | null;
  autoCompleteDwellMs?: number | null;
};

type SetActiveDriverBackgroundTripOptions = Omit<ActiveDriverBackgroundTripSession, 'tripId'>;

const normalizeCoordinate = (
  coordinate?: DriverBackgroundLocationCoordinate | null,
): DriverBackgroundLocationCoordinate | null => {
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return { latitude, longitude };
};

const normalizeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeSession = (
  value: unknown,
): ActiveDriverBackgroundTripSession | null => {
  if (typeof value === 'string') {
    const tripId = value.trim();
    return tripId ? { tripId } : null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ActiveDriverBackgroundTripSession>;
  const tripId = typeof candidate.tripId === 'string' ? candidate.tripId.trim() : '';
  if (!tripId) {
    return null;
  }

  return {
    tripId,
    arrivalCoordinate: normalizeCoordinate(candidate.arrivalCoordinate),
    nearDestinationSinceMs: normalizeNumber(candidate.nearDestinationSinceMs),
    autoCompleteDistanceMeters: normalizeNumber(candidate.autoCompleteDistanceMeters),
    autoCompleteDwellMs: normalizeNumber(candidate.autoCompleteDwellMs),
  };
};

export async function getActiveDriverBackgroundTripId() {
  const session = await getActiveDriverBackgroundTripSession();
  return session?.tripId ?? null;
}

export async function getActiveDriverBackgroundTripSession() {
  try {
    const rawValue = await AsyncStorage.getItem(ACTIVE_DRIVER_TRIP_ID_KEY);
    if (!rawValue) {
      return null;
    }

    try {
      return normalizeSession(JSON.parse(rawValue));
    } catch {
      return normalizeSession(rawValue);
    }
  } catch (error) {
    console.warn('[DriverBackgroundLocationSession] Lecture impossible:', error);
    return null;
  }
}

export async function setActiveDriverBackgroundTripId(
  tripId: string,
  options: SetActiveDriverBackgroundTripOptions = {},
) {
  try {
    const session = normalizeSession({
      ...options,
      tripId,
    });

    if (!session) {
      return false;
    }

    await AsyncStorage.setItem(ACTIVE_DRIVER_TRIP_ID_KEY, JSON.stringify(session));
    return true;
  } catch (error) {
    console.warn('[DriverBackgroundLocationSession] Ecriture impossible:', error);
    return false;
  }
}

export async function updateActiveDriverBackgroundTripSession(
  updater: (
    session: ActiveDriverBackgroundTripSession,
  ) => ActiveDriverBackgroundTripSession | null,
) {
  try {
    const currentSession = await getActiveDriverBackgroundTripSession();
    if (!currentSession) {
      return null;
    }

    const nextSession = normalizeSession(updater(currentSession));
    if (!nextSession) {
      await AsyncStorage.removeItem(ACTIVE_DRIVER_TRIP_ID_KEY);
      return null;
    }

    await AsyncStorage.setItem(ACTIVE_DRIVER_TRIP_ID_KEY, JSON.stringify(nextSession));
    return nextSession;
  } catch (error) {
    console.warn('[DriverBackgroundLocationSession] Mise a jour impossible:', error);
    return null;
  }
}

export async function clearActiveDriverBackgroundTripId(tripId?: string | null) {
  try {
    const activeTripId = await getActiveDriverBackgroundTripId();
    if (!tripId || !activeTripId || activeTripId === tripId) {
      await AsyncStorage.removeItem(ACTIVE_DRIVER_TRIP_ID_KEY);
      return true;
    }

    return false;
  } catch (error) {
    console.warn('[DriverBackgroundLocationSession] Nettoyage impossible:', error);
    return false;
  }
}
