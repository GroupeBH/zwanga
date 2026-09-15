import type {
  FavoriteLocation,
  ProfileStats,
  ProfileSummary,
  TripRequestVehicleType,
  User,
  UserRole,
  Vehicle,
} from '../../../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ServerUser = Record<string, any>;
export const FAVORITE_LOCATION_NOTES_KEY = 'favorite_location_local_notes';

export const buildFullName = (user: ServerUser) => {
  const combined = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return combined || user.name || 'Utilisateur';
};

export const mapServerVehicle = (vehicle: any): Vehicle => ({
  id: vehicle.id,
  ownerId: vehicle.ownerId,
  type: (vehicle.type ?? 'car') as TripRequestVehicleType,
  brand: vehicle.brand ?? '',
  model: vehicle.model ?? '',
  color: vehicle.color ?? '',
  licensePlate: vehicle.licensePlate ?? '',
  photoUrl: vehicle.photoUrl ?? null,
  isActive: vehicle.isActive ?? true,
  createdAt: vehicle.createdAt ?? new Date().toISOString(),
  updatedAt: vehicle.updatedAt ?? new Date().toISOString(),
});

export const mapServerUser = (user: ServerUser): User => {
  const vehicleEntry = user.vehicles?.[0];
  return {
    id: user.id,
    name: buildFullName(user),
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? '',
    email: user.email ?? undefined,
    gender: user.gender ?? null,
    role: (user.role ?? 'passenger') as UserRole,
    avatar: user.profilePicture ?? user.avatar ?? undefined,
    profilePicture: user.profilePicture ?? null,
    rating: user.rating ?? 0,
    totalTrips: user.totalTrips ?? 0,
    verified: Boolean(user.isEmailVerified || user.isPhoneVerified || user.isDriver),
    identityVerified: Boolean(user.kycDocuments?.some?.((doc: any) => doc.status === 'approved')),
    vehicle: vehicleEntry ? mapServerVehicle(vehicleEntry) : undefined,
    isDriver: user.isDriver ?? false,
    isPremium: Boolean(user.isPremium),
    premiumBadge: Boolean(user.premiumBadge),
    premiumBadgeEnabled: Boolean(user.premiumBadgeEnabled ?? user.premiumBadge),
    createdAt: user.createdAt ?? new Date().toISOString(),
  };
};

export const mapProfileSummary = (payload: { user: ServerUser; stats: ProfileStats }): ProfileSummary => ({
  user: mapServerUser(payload.user),
  stats: payload.stats,
});

export const loadFavoriteLocationNotes = async (): Promise<Record<string, string>> => {
  try {
    const storedNotes = await AsyncStorage.getItem(FAVORITE_LOCATION_NOTES_KEY);
    return storedNotes ? (JSON.parse(storedNotes) as Record<string, string>) : {};
  } catch (error) {
    console.warn('[userApi] Impossible de charger les notes locales des lieux favoris:', error);
    return {};
  }
};

export const saveFavoriteLocationNotes = async (notesById: Record<string, string>) => {
  try {
    await AsyncStorage.setItem(FAVORITE_LOCATION_NOTES_KEY, JSON.stringify(notesById));
  } catch (error) {
    console.warn('[userApi] Impossible de sauvegarder les notes locales des lieux favoris:', error);
  }
};

export const mergeFavoriteLocationNotes = async (
  favoriteLocations: FavoriteLocation[],
): Promise<FavoriteLocation[]> => {
  const notesById = await loadFavoriteLocationNotes();

  return favoriteLocations.map((location) => ({
    ...location,
    notes: notesById[location.id] ?? location.notes ?? null,
  }));
};

export const mergeFavoriteLocationNote = async (
  favoriteLocation: FavoriteLocation | null,
): Promise<FavoriteLocation | null> => {
  if (!favoriteLocation) {
    return null;
  }

  const [locationWithNotes] = await mergeFavoriteLocationNotes([favoriteLocation]);
  return locationWithNotes;
};

export const persistFavoriteLocationNote = async (
  favoriteLocation: FavoriteLocation,
  note?: string,
): Promise<FavoriteLocation> => {
  const normalizedNote = note?.trim();
  const notesById = await loadFavoriteLocationNotes();

  if (normalizedNote) {
    notesById[favoriteLocation.id] = normalizedNote;
  } else {
    delete notesById[favoriteLocation.id];
  }

  await saveFavoriteLocationNotes(notesById);

  return {
    ...favoriteLocation,
    notes: notesById[favoriteLocation.id] ?? favoriteLocation.notes ?? null,
  };
};

export const removeFavoriteLocationNote = async (favoriteLocationId: string) => {
  const notesById = await loadFavoriteLocationNotes();

  if (!(favoriteLocationId in notesById)) {
    return;
  }

  delete notesById[favoriteLocationId];
  await saveFavoriteLocationNotes(notesById);
};
