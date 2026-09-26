import {
  currentUserTag,
  kycStatusTag,
  vehicleListTag,
  favoriteLocationsListTag,
  DiditKycSession,
  RawDiditKycSession,
  mapDiditKycSession,
} from './identityContracts';
import {
  ServerUser,
  FAVORITE_LOCATION_NOTES_KEY,
  mapServerUser,
  mapProfileSummary,
  mergeFavoriteLocationNotes,
  mergeFavoriteLocationNote,
  persistFavoriteLocationNote,
} from './profileMapper';
import type { FavoriteLocation, KycDocument, ProfileStats, ProfileSummary, User } from '../../../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BaseEndpointBuilder } from '../types';
import { syncAccountRole } from './syncAccountRole';

export function buildGetProfileSummaryEndpoints(builder: BaseEndpointBuilder) {
  return {
getProfileSummary: builder.query<ProfileSummary, void>({
      onQueryStarted: syncAccountRole,
      query: () => '/users/me',
      providesTags: [currentUserTag],
      transformResponse: (response: { user: ServerUser; stats: ProfileStats }) =>
        mapProfileSummary(response),
    }),
// Récupérer l'utilisateur actuellement connecté
    getCurrentUser: builder.query<User, void>({
      onQueryStarted: syncAccountRole,
      query: () => '/users/me',
      providesTags: [currentUserTag],
      transformResponse: (response: { user: ServerUser; stats: ProfileStats }) =>
        mapServerUser(response.user),
    }),
// Mettre à jour le profil de l'utilisateur connecté
    updateUser: builder.mutation<User, FormData>({
      onQueryStarted: syncAccountRole,
      query: (formData: FormData) => ({
        url: '/users/me',
        method: 'PUT',
        body: formData,
      }),
      transformResponse: (response: ServerUser) => mapServerUser(response),
      invalidatesTags: (result) =>
        result ? [currentUserTag, { type: 'User' as const, id: result.id }] : [currentUserTag],
    }),
    requestDriverOnboarding: builder.mutation<User, void>({
      query: () => ({ url: '/users/driver-onboarding', method: 'POST' }),
      transformResponse: (response: ServerUser) => mapServerUser(response),
      onQueryStarted: syncAccountRole,
      invalidatesTags: [currentUserTag],
    }),
    activateDriver: builder.mutation<User, void>({
      query: () => ({ url: '/users/driver-activation', method: 'POST' }),
      transformResponse: (response: ServerUser) => mapServerUser(response),
      onQueryStarted: syncAccountRole,
      invalidatesTags: [currentUserTag],
    }),
deleteAccount: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: '/users/me',
        method: 'DELETE',
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        await queryFulfilled;
        await AsyncStorage.removeItem(FAVORITE_LOCATION_NOTES_KEY);
      },
      invalidatesTags: [currentUserTag, kycStatusTag, vehicleListTag, favoriteLocationsListTag],
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
getKycStatus: builder.query<KycDocument | null, void>({
      query: () => '/users/kyc/status',
      providesTags: [kycStatusTag],
    }),
createDiditKycSession: builder.mutation<
      DiditKycSession,
      { callbackUrl?: string; language?: string; source?: string } | void
    >({
      query: (body) => ({
        url: '/users/kyc/didit/session',
        method: 'POST',
        body: body ?? {},
      }),
      transformResponse: (response: RawDiditKycSession) => mapDiditKycSession(response),
    }),
updateFcmToken: builder.mutation<{ message: string }, { fcmToken: string }>({
      query: ({ fcmToken }: { fcmToken: string }) => ({
        url: '/users/fcm-token',
        method: 'POST',
        body: { fcmToken },
      }),
      invalidatesTags: [],
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
    updatePin: builder.mutation<{ message: string }, { oldPin: string; newPin: string }>({
      query: ({ oldPin, newPin }) => ({
        url: '/users/pin/change',
        method: 'POST',
        body: { oldPin, newPin },
      }),
      // Le parcours déconnecte la session après le changement du PIN.
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
      providesTags: [favoriteLocationsListTag],
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
      providesTags: [favoriteLocationsListTag],
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
      invalidatesTags: [favoriteLocationsListTag],
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
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'FavoriteLocations', id },
        favoriteLocationsListTag,
      ],
    })
  };
}
