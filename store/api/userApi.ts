import type { KycDocument, ProfileStats, ProfileSummary, User, UserRole } from '../../types';
import { baseApi } from './baseApi';

type ServerUser = Record<string, any>;

const buildFullName = (user: ServerUser) => {
  const combined = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return combined || user.name || 'Utilisateur';
};

const mapServerUser = (user: ServerUser): User => ({
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
  vehicle: user.vehicles?.[0],
  isDriver: user.isDriver ?? false,
  createdAt: user.createdAt ?? new Date().toISOString(),
});

const mapProfileSummary = (payload: { user: ServerUser; stats: ProfileStats }): ProfileSummary => ({
  user: mapServerUser(payload.user),
  stats: payload.stats,
});

/**
 * API utilisateurs
 * Gère les opérations CRUD sur les utilisateurs
 */
export const userApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
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
    updateUser: builder.mutation<User, Partial<User>>({
      query: (updates) => ({
        url: '/users/me',
        method: 'PUT',
        body: updates,
      }),
      transformResponse: (response: ServerUser) => mapServerUser(response),
      invalidatesTags: ['User'],
    }),

    // Récupérer un utilisateur par son ID
    getUserById: builder.query<User, string>({
      query: (id) => `/users/${id}`,
      providesTags: (result, error, id) => [{ type: 'User', id }],
      transformResponse: (response: ServerUser) => mapServerUser(response),
    }),

    uploadKyc: builder.mutation<KycDocument, { cniFrontUrl: string; cniBackUrl: string; selfieUrl: string }>({
      query: (body) => ({
        url: '/users/kyc',
        method: 'POST',
        body,
      }),
    }),

    getKycStatus: builder.query<KycDocument | null, void>({
      query: () => '/users/kyc/status',
    }),

    updateFcmToken: builder.mutation<{ message: string }, { fcmToken: string }>({
      query: ({ fcmToken }) => ({
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
