import { getRefreshToken } from '../../services/tokenStorage';
import type { KycDocument, ProfileStats, ProfileSummary, User, UserRole, Vehicle } from '../../types';
import { authApi } from './authApi';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

type ServerUser = Record<string, any>;

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

    // Récupérer un utilisateur par son ID
    getUserById: builder.query<User, string>({
      query: (id: string) => `/users/${id}`,
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
            await dispatch(
              authApi.endpoints.refreshToken.initiate({ refreshToken })
            ).unwrap();

            console.log('Tokens refreshed successfully after KYC upload');
            
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
  }),
});

export const {
  useGetProfileSummaryQuery,
  useGetCurrentUserQuery,
  useUpdateUserMutation,
  useGetUserByIdQuery,
  useUploadKycMutation,
  useGetKycStatusQuery,
  useUpdateFcmTokenMutation,
} = userApi;
