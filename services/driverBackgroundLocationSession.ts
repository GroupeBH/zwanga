import AsyncStorage from '@react-native-async-storage/async-storage';

export const ACTIVE_DRIVER_TRIP_ID_KEY = 'zwanga.activeDriverBackgroundTripId';

// All access to this key goes through this module, including native task callbacks.
// Serialize read/modify/write so a late checkpoint cannot resurrect a cleared trip.
let work: Promise<unknown> = Promise.resolve();
let loaded = false;
let cachedSession: ActiveDriverBackgroundTripSession | null = null;
let persistedValue: string | null = null;
const serial = <T>(operation: () => Promise<T>): Promise<T> => {
  const next = work.then(operation);
  work = next.catch(() => undefined);
  return next;
};

export type DriverBackgroundLocationCoordinate = {
  latitude: number;
  longitude: number;
};

export type ActiveDriverBackgroundTripSession = {
  tripId: string;
  arrivalCoordinate?: DriverBackgroundLocationCoordinate | null;
  lastDriverCoordinate?: DriverBackgroundLocationCoordinate | null;
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

const normalizeSession = (value: unknown): ActiveDriverBackgroundTripSession | null => {
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
    lastDriverCoordinate: normalizeCoordinate(candidate.lastDriverCoordinate),
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
  return serial(readSession);
}

async function readSession() {
  if (loaded) return cachedSession;
  try {
    const rawValue = await AsyncStorage.getItem(ACTIVE_DRIVER_TRIP_ID_KEY);
    if (!rawValue) {
      loaded = true;
      return null;
    }

    try {
      cachedSession = normalizeSession(JSON.parse(rawValue));
    } catch {
      cachedSession = normalizeSession(rawValue);
    }
    persistedValue = cachedSession ? JSON.stringify(cachedSession) : null;
    loaded = true;
    return cachedSession;
  } catch (error) {
    console.warn('[DriverBackgroundLocationSession] Lecture impossible:', error);
    return null;
  }
}

async function persistSession(session: ActiveDriverBackgroundTripSession | null) {
  const value = session ? JSON.stringify(session) : null;
  if (!loaded || value !== persistedValue) {
    if (value === null) await AsyncStorage.removeItem(ACTIVE_DRIVER_TRIP_ID_KEY);
    else await AsyncStorage.setItem(ACTIVE_DRIVER_TRIP_ID_KEY, value);
  }
  cachedSession = session;
  persistedValue = value;
  loaded = true;
}

export async function setActiveDriverBackgroundTripId(
  tripId: string,
  options: SetActiveDriverBackgroundTripOptions = {},
) {
  return serial(async () => {
    try {
      const session = normalizeSession({
        ...options,
        tripId,
      });

      if (!session) {
        return false;
      }

      await readSession();
      await persistSession(session);
      return true;
    } catch (error) {
      console.warn('[DriverBackgroundLocationSession] Ecriture impossible:', error);
      return false;
    }
  });
}

export async function updateActiveDriverBackgroundTripSession(
  updater: (session: ActiveDriverBackgroundTripSession) => ActiveDriverBackgroundTripSession | null,
) {
  return serial(async () => {
    try {
      const currentSession = await readSession();
      if (!currentSession) {
        return null;
      }

      const nextSession = normalizeSession(updater(currentSession));
      if (!nextSession) {
        await persistSession(null);
        return null;
      }

      await persistSession(nextSession);
      return nextSession;
    } catch (error) {
      console.warn('[DriverBackgroundLocationSession] Mise à jour impossible:', error);
      return null;
    }
  });
}

export async function clearActiveDriverBackgroundTripId(tripId?: string | null) {
  return serial(async () => {
    try {
      const activeTripId = (await readSession())?.tripId;
      if (!tripId || !activeTripId || activeTripId === tripId) {
        await persistSession(null);
        return true;
      }

      return false;
    } catch (error) {
      console.warn('[DriverBackgroundLocationSession] Nettoyage impossible:', error);
      return false;
    }
  });
}
