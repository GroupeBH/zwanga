import type { User } from '../../types';
import { baseApi } from './baseApi';

/**
 * API utilisateurs
 * Gère les opérations CRUD sur les utilisateurs
 */
export const userApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Récupérer l'utilisateur actuellement connecté
    getCurrentUser: builder.query<User, void>({
      query: () => '/user/me',
      providesTags: ['User'],
    }),

    // Mettre à jour le profil de l'utilisateur connecté
    updateUser: builder.mutation<User, Partial<User>>({
      query: (updates) => ({
        url: '/user/me',
        method: 'PATCH',
        body: updates,
      }),
      invalidatesTags: ['User'],
    }),

    // Récupérer un utilisateur par son ID
    getUserById: builder.query<User, string>({
      query: (id) => `/users/${id}`,
      providesTags: (result, error, id) => [{ type: 'User', id }],
    }),
  }),
});

export const {
  useGetCurrentUserQuery,
  useUpdateUserMutation,
  useGetUserByIdQuery,
} = userApi;


