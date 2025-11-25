import { storeTokens } from '../../services/tokenStorage';
import type { User } from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

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
  endpoints: (builder: BaseEndpointBuilder) => ({
    // Connexion avec téléphone et mot de passe
    login: builder.mutation<AuthResponse, { phone: string }>({
      query: (credentials: { phone: string }) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      async onQueryStarted(
        _arg: { phone: string },
        { queryFulfilled }: { queryFulfilled: Promise<{ data: AuthResponse }> },
      ) {
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
      query: (formData: FormData) => ({
        url: '/auth/register',
        method: 'POST',
        body: formData,
      }),
      async onQueryStarted(
        _arg: FormData,
        { queryFulfilled }: { queryFulfilled: Promise<{ data: AuthResponse }> },
      ) {
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
      query: (data: { phone: string; code: string }) => ({
        url: '/auth/verify-phone',
        method: 'POST',
        body: data,
      }),
    }),

    // Vérification KYC (Know Your Customer)
    verifyKYC: builder.mutation<{ verified: boolean }, { idNumber: string; fullName: string }>({
      query: (data: { idNumber: string; fullName: string }) => ({
        url: '/auth/verify-kyc',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['User'],
    }),

    // Rafraîchir l'access token avec le refresh token
    refreshToken: builder.mutation<{ accessToken: string; refreshToken: string }, { refreshToken: string }>({
      query: (data: { refreshToken: string }) => ({
        url: '/auth/refresh',
        method: 'POST',
        body: data,
      }),
      async onQueryStarted(
        _arg: { refreshToken: string },
        { queryFulfilled }: { queryFulfilled: Promise<{ data: { accessToken: string; refreshToken: string } }> },
      ) {
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


