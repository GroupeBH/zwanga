import { storeTokens } from '../../services/tokenStorage';
import type { User } from '../../types';
import { baseApi } from './baseApi';

/**
 * Interface de réponse d'authentification avec tokens JWT
 */
export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/**
 * API d'authentification
 * Gère la connexion, l'inscription, la vérification téléphone et KYC
 */
export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Connexion avec téléphone et mot de passe
    login: builder.mutation<AuthResponse, { phone: string }>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          // Stocker les tokens dans SecureStore
          await storeTokens(data.accessToken, data.refreshToken);
        } catch (error) {
          console.error('Erreur lors du stockage des tokens après login:', error);
        }
      },
      invalidatesTags: ['User'],
    }),

    // Inscription d'un nouvel utilisateur
    register: builder.mutation<AuthResponse, FormData>({
      query: (formData) => ({
        url: '/auth/register',
        method: 'POST',
        body: formData,
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          // Stocker les tokens dans SecureStore
          await storeTokens(data.accessToken, data.refreshToken);
        } catch (error) {
          console.error('Erreur lors du stockage des tokens après inscription:', error);
        }
      },
    }),

    // Vérification du numéro de téléphone avec code SMS
    verifyPhone: builder.mutation<{ verified: boolean }, { phone: string; code: string }>({
      query: (data) => ({
        url: '/auth/verify-phone',
        method: 'POST',
        body: data,
      }),
    }),

    // Vérification KYC (Know Your Customer)
    verifyKYC: builder.mutation<{ verified: boolean }, { idNumber: string; fullName: string }>({
      query: (data) => ({
        url: '/auth/verify-kyc',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['User'],
    }),

    // Rafraîchir l'access token avec le refresh token
    refreshToken: builder.mutation<{ accessToken: string; refreshToken: string }, { refreshToken: string }>({
      query: (data) => ({
        url: '/auth/refresh',
        method: 'POST',
        body: data,
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          // Stocker les nouveaux tokens dans SecureStore
          await storeTokens(data.accessToken, data.refreshToken);
        } catch (error) {
          console.error('Erreur lors du stockage des tokens après refresh:', error);
        }
      },
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useVerifyPhoneMutation,
  useVerifyKYCMutation,
  useRefreshTokenMutation,
} = authApi;


