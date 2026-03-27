import { API_BASE_URL } from '../../config/env';
import { getRefreshToken, storeTokens } from '../../services/tokenStorage';
import type { FavoriteLocation, KycDocument, ProfileStats, ProfileSummary, User, UserRole, Vehicle } from '../../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

type ServerUser = Record<string, any>;
const FAVORITE_LOCATION_NOTES_KEY = 'favorite_location_local_notes';

const buildFullName = (user: ServerUser) => {
  const combined = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return combined || user.name || 'Utilisateur';
};

const mapServerVehicle = (vehicle: any): Vehicle => ({
  id: vehicle.id,
  ownerId: vehicle.ownerId,
  brand: vehicle.brand ?? '',
  model: vehicle.model ?? '',
  color: vehicle.color ?? '',
  licensePlate: vehicle.licensePlate ?? '',
  photoUrl: vehicle.photoUrl ?? null,
  isActive: vehicle.isActive ?? true,
  createdAt: vehicle.createdAt ?? new Date().toISOString(),
  updatedAt: vehicle.updatedAt ?? new Date().toISOString(),
});

const mapServerUser = (user: ServerUser): User => {
  const vehicleEntry = user.vehicles?.[0];
  return {
    id: user.id,
    name: buildFullName(user),
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? '',
    email: user.email ?? undefined,
    role: (user.role ?? 'passenger') as UserRole,
    avatar: user.profilePicture ?? user.avatar ?? undefined,
    profilePicture: user.profilePicture ?? null,
    rating: user.rating ?? 0,
    totalTrips: user.totalTrips ?? 0,
    verified: Boolean(user.isEmailVerified || user.isPhoneVerified || user.isDriver),
    identityVerified: Boolean(user.kycDocuments?.some?.((doc: any) => doc.status === 'approved')),
    vehicle: vehicleEntry ? mapServerVehicle(vehicleEntry) : undefined,
    isDriver: user.isDriver ?? false,
    createdAt: user.createdAt ?? new Date().toISOString(),
  };
};

const mapProfileSummary = (payload: { user: ServerUser; stats: ProfileStats }): ProfileSummary => ({
  user: mapServerUser(payload.user),
  stats: payload.stats,
});

const loadFavoriteLocationNotes = async (): Promise<Record<string, string>> => {
  try {
    const storedNotes = await AsyncStorage.getItem(FAVORITE_LOCATION_NOTES_KEY);
    return storedNotes ? (JSON.parse(storedNotes) as Record<string, string>) : {};
  } catch (error) {
    console.warn('[userApi] Impossible de charger les notes locales des lieux favoris:', error);
    return {};
  }
};

const saveFavoriteLocationNotes = async (notesById: Record<string, string>) => {
  try {
    await AsyncStorage.setItem(FAVORITE_LOCATION_NOTES_KEY, JSON.stringify(notesById));
  } catch (error) {
    console.warn('[userApi] Impossible de sauvegarder les notes locales des lieux favoris:', error);
  }
};

const mergeFavoriteLocationNotes = async (
  favoriteLocations: FavoriteLocation[],
): Promise<FavoriteLocation[]> => {
  const notesById = await loadFavoriteLocationNotes();

  return favoriteLocations.map((location) => ({
    ...location,
    notes: notesById[location.id] ?? location.notes ?? null,
  }));
};

const mergeFavoriteLocationNote = async (
  favoriteLocation: FavoriteLocation | null,
): Promise<FavoriteLocation | null> => {
  if (!favoriteLocation) {
    return null;
  }

  const [locationWithNotes] = await mergeFavoriteLocationNotes([favoriteLocation]);
  return locationWithNotes;
};

const persistFavoriteLocationNote = async (
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

const removeFavoriteLocationNote = async (favoriteLocationId: string) => {
  const notesById = await loadFavoriteLocationNotes();

  if (!(favoriteLocationId in notesById)) {
    return;
  }

  delete notesById[favoriteLocationId];
  await saveFavoriteLocationNotes(notesById);
};

/**
 * API utilisateurs
 * Gère les opérations CRUD sur les utilisateurs
 */
export const userApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    getProfileSummary: builder.query<ProfileSummary, void>({
      query: () => '/users/me',
      providesTags: ['User'],
      transformResponse: (response: { user: ServerUser; stats: ProfileStats }) =>
        mapProfileSummary(response),
    }),

    // Récupérer l'utilisateur actuellement connecté
    getCurrentUser: builder.query<User, void>({
      query: () => '/users/me',
      providesTags: ['User'],
      transformResponse: (response: { user: ServerUser; stats: ProfileStats }) =>
        mapServerUser(response.user),
    }),

    // Mettre à jour le profil de l'utilisateur connecté
    updateUser: builder.mutation<User, FormData>({
      query: (formData: FormData) => ({
        url: '/users/me',
        method: 'PUT',
        body: formData,
      }),
      transformResponse: (response: ServerUser) => mapServerUser(response),
      invalidatesTags: ['User'],
    }),

    getUserById: builder.query<User, string>({
      query: (id: string) => `/users/${id}`,
      providesTags: (_result: User | undefined, _error: unknown, id: string) => [{ type: 'User', id }],
      transformResponse: (response: ServerUser) => mapServerUser(response),
    }),

    // Récupérer le profil public d'un utilisateur
    getPublicUserInfo: builder.query<User, string>({
      query: (id: string) => `/users/${id}/public`,
      providesTags: (_result: User | undefined, _error: unknown, id: string) => [{ type: 'User', id }],
      transformResponse: (response: ServerUser) => mapServerUser(response),
    }),

    uploadKyc: builder.mutation<KycDocument, FormData>({
      query: (formData: FormData) => ({
        url: '/users/kyc',
        method: 'POST',
        body: formData,
      }),
      async onQueryStarted(
        _arg: FormData,
        { queryFulfilled, dispatch },
      ) {
        try {
          // Wait for KYC upload to complete successfully
          await queryFulfilled;

          // Invalider immédiatement le cache KYC pour forcer un refetch
          dispatch(userApi.util.invalidateTags(['KycStatus']));

          // Get current refresh token from secure storage
          const refreshToken = await getRefreshToken();

          if (refreshToken) {
            // Trigger token refresh to get new JWT with updated KYC status
            // This ensures the access token immediately reflects the new KYC status
            const normalizedBaseUrl = API_BASE_URL.endsWith('/')
              ? API_BASE_URL.slice(0, -1)
              : API_BASE_URL;

            const refreshResponse = await fetch(`${normalizedBaseUrl}/auth/refresh`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ refreshToken }),
            });

            if (refreshResponse.ok) {
              const refreshedTokens = (await refreshResponse.json()) as {
                accessToken?: string;
                refreshToken?: string;
              };

              if (refreshedTokens.accessToken && refreshedTokens.refreshToken) {
                await storeTokens(refreshedTokens.accessToken, refreshedTokens.refreshToken);
                dispatch({
                  type: 'auth/setTokens',
                  payload: {
                    accessToken: refreshedTokens.accessToken,
                    refreshToken: refreshedTokens.refreshToken,
                  },
                });
                console.log('Tokens refreshed successfully after KYC upload');
              } else {
                console.warn('Refresh response missing tokens after KYC upload');
              }
            } else {
              console.warn('Token refresh failed after KYC upload:', refreshResponse.status);
            }

            // Invalider les tags User et KycStatus pour forcer un refetch immédiat
            // Cela garantit que tous les composants utilisant ces données se mettent à jour
            dispatch(userApi.util.invalidateTags(['User', 'KycStatus']));

            // Forcer un refetch immédiat du statut KYC et du profil utilisateur
            dispatch(userApi.endpoints.getKycStatus.initiate(undefined, { forceRefetch: true }));
            dispatch(userApi.endpoints.getCurrentUser.initiate(undefined, { forceRefetch: true }));
          } else {
            console.warn('No refresh token available after KYC upload');
            // Même sans refresh token, forcer un refetch du statut KYC
            dispatch(userApi.util.invalidateTags(['KycStatus']));
            dispatch(userApi.endpoints.getKycStatus.initiate(undefined, { forceRefetch: true }));
          }
        } catch (error) {
          // Don't throw - KYC upload was successful, token refresh is optional
          // The user can still continue using the app with the old token
          console.error('Error refreshing tokens after KYC upload:', error);
          // Même en cas d'erreur, invalider les tags et forcer un refetch du statut KYC
          dispatch(userApi.util.invalidateTags(['KycStatus']));
          dispatch(userApi.endpoints.getKycStatus.initiate(undefined, { forceRefetch: true }));
        }
      },
      invalidatesTags: ['User', 'KycStatus'],
    }),

    getKycStatus: builder.query<KycDocument | null, void>({
      query: () => '/users/kyc/status',
      providesTags: ['KycStatus'],
    }),

    updateFcmToken: builder.mutation<{ message: string }, { fcmToken: string }>({
      query: ({ fcmToken }: { fcmToken: string }) => ({
        url: '/users/fcm-token',
        method: 'POST',
        body: { fcmToken },
      }),
      invalidatesTags: ['User'],
    }),

    // Envoyer un code OTP pour la vérification du numéro de téléphone
    sendPhoneVerificationOtp: builder.mutation<{ message: string }, { phone: string; context: 'registration' | 'login' | 'update' }>({
      queryFn: async (data: { phone: string; context: 'registration' | 'login' | 'update' }, _api, _extraOptions, baseQuery) => {
        console.log('sendPhoneVerificationOtp queryFn called with:', data);

        // S'assurer que le contexte est bien défini
        if (!data.context || (data.context !== 'login' && data.context !== 'registration' && data.context !== 'update')) {
          return {
            error: {
              status: 'CUSTOM_ERROR',
              data: `Invalid context: ${data.context}`,
              error: `Invalid context: ${data.context}`,
            },
          } as any;
        }

        const result = await baseQuery({
          url: '/users/phone/send-otp',
          method: 'POST',
          body: {
            phone: data.phone,
            context: data.context,
          },
        });

        // Typage explicite pour correspondre au type attendu
        if (result.error) {
          return { error: result.error } as any;
        }
        return { data: result.data as { message: string } } as any;
      },
    }),

    // Vérifier le code OTP pour la vérification du numéro de téléphone
    verifyPhoneOtp: builder.mutation<{ message: string; valid: boolean }, { phone: string; otp: string }>({
      query: ({ phone, otp }: { phone: string; otp: string }) => ({
        url: '/users/phone/verify',
        method: 'POST',
        body: { phone, otp },
      }),
    }),

    // Modifier le PIN (nécessite l'ancien PIN pour validation)
    updatePin: builder.mutation<{ message: string }, { newPin: string }>({
      query: ({ newPin }: { newPin: string }) => ({
        url: '/users/pin/change',
        method: 'PUT',
        body: { newPin },
      }),
      invalidatesTags: ['User'],
    }),

    // Modifier le PIN avec OTP (quand l'utilisateur a oublié son PIN)
    updatePinWithOtp: builder.mutation<{ message: string }, { newPin: string }>({
      query: ({ newPin }: { newPin: string }) => ({
        url: '/users/pin/change',
        method: 'PUT',
        body: { newPin },
      }),
      invalidatesTags: ['User'],
    }),

    // ==================== Favorite Locations Endpoints ====================

    // Récupérer tous les lieux favoris de l'utilisateur
    getFavoriteLocations: builder.query<FavoriteLocation[], void>({
      queryFn: async (_arg, _api, _extraOptions, baseQuery) => {
        const result = await baseQuery('/favorite-places');

        if (result.error) {
          return { error: result.error } as any;
        }

        return {
          data: await mergeFavoriteLocationNotes(result.data as FavoriteLocation[]),
        } as any;
      },
      providesTags: ['FavoriteLocations'],
    }),

    // Récupérer le lieu favori par défaut (optionnellement filtré par type)
    getDefaultFavoriteLocation: builder.query<FavoriteLocation | null, { type?: 'home' | 'work' | 'other' } | void>({
      queryFn: async (params, _api, _extraOptions, baseQuery) => {
        const queryParams = params && params.type ? `?type=${params.type}` : '';
        const result = await baseQuery(`/favorite-places/default${queryParams}`);

        if (result.error) {
          return { error: result.error } as any;
        }

        return {
          data: await mergeFavoriteLocationNote((result.data as FavoriteLocation | null) ?? null),
        } as any;
      },
      providesTags: ['FavoriteLocations'],
    }),

    // Récupérer un lieu favori par ID
    getFavoriteLocationById: builder.query<FavoriteLocation, string>({
      queryFn: async (id: string, _api, _extraOptions, baseQuery) => {
        const result = await baseQuery(`/favorite-places/${id}`);

        if (result.error) {
          return { error: result.error } as any;
        }

        return {
          data: await mergeFavoriteLocationNote(result.data as FavoriteLocation),
        } as any;
      },
      providesTags: (_result, _error, id) => [{ type: 'FavoriteLocations', id }],
    }),

    // Créer un lieu favori
    createFavoriteLocation: builder.mutation<FavoriteLocation, {
      name: string;
      address: string;
      coordinates: { latitude: number; longitude: number };
      type?: 'home' | 'work' | 'other';
      isDefault?: boolean;
      notes?: string;
    }>({
      queryFn: async ({ notes, ...data }, _api, _extraOptions, baseQuery) => {
        const result = await baseQuery({
          url: '/favorite-places',
          method: 'POST',
          body: data,
        });

        if (result.error) {
          return { error: result.error } as any;
        }

        return {
          data: await persistFavoriteLocationNote(result.data as FavoriteLocation, notes),
        } as any;
      },
      invalidatesTags: ['FavoriteLocations'],
    }),

    // Mettre à jour un lieu favori
    updateFavoriteLocation: builder.mutation<FavoriteLocation, {
      id: string;
      name?: string;
      address?: string;
      coordinates?: { latitude: number; longitude: number };
      type?: 'home' | 'work' | 'other';
      isDefault?: boolean;
      notes?: string;
    }>({
      queryFn: async ({ id, notes, ...data }, _api, _extraOptions, baseQuery) => {
        const result = await baseQuery({
          url: `/favorite-places/${id}`,
          method: 'PUT',
          body: data,
        });

        if (result.error) {
          return { error: result.error } as any;
        }

        return {
          data: await persistFavoriteLocationNote(result.data as FavoriteLocation, notes),
        } as any;
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'FavoriteLocations', id }, 'FavoriteLocations'],
    }),

    // Supprimer un lieu favori
    deleteFavoriteLocation: builder.mutation<{ message: string }, string>({
      queryFn: async (id: string, _api, _extraOptions, baseQuery) => {
        const result = await baseQuery({
          url: `/favorite-places/${id}`,
          method: 'DELETE',
        });

        if (result.error) {
          return { error: result.error } as any;
        }

        await removeFavoriteLocationNote(id);

        return { data: result.data as { message: string } } as any;
      },
      invalidatesTags: (_result, _error, id) => [{ type: 'FavoriteLocations', id }, 'FavoriteLocations'],
    }),
  }),
});

export const {
  useGetProfileSummaryQuery,
  useGetCurrentUserQuery,
  useUpdateUserMutation,
  useGetUserByIdQuery,
  useGetPublicUserInfoQuery,
  useUploadKycMutation,
  useGetKycStatusQuery,
  useUpdateFcmTokenMutation,
  useSendPhoneVerificationOtpMutation,
  useVerifyPhoneOtpMutation,
  useUpdatePinMutation,
  useUpdatePinWithOtpMutation,
  // Favorite Locations
  useGetFavoriteLocationsQuery,
  useGetDefaultFavoriteLocationQuery,
  useGetFavoriteLocationByIdQuery,
  useCreateFavoriteLocationMutation,
  useUpdateFavoriteLocationMutation,
  useDeleteFavoriteLocationMutation,
} = userApi;
