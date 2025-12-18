import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { API_BASE_URL } from '../../config/env';
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
    // IMPORTANT: Utilise queryFn avec fetch direct pour éviter la dépendance circulaire
    // et éviter que baseQueryWithReauth n'ajoute un header Authorization (qui causerait une boucle)
    refreshToken: builder.mutation<{ accessToken: string; refreshToken: string }, { refreshToken: string }>({
      queryFn: async (data: { refreshToken: string }) => {
        try {
          // Normaliser l'URL pour éviter les doubles slashes
          const normalizedBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
          const refreshUrl = `${normalizedBaseUrl}/auth/refresh`;
          
          // Utiliser fetch direct pour éviter de passer par baseQueryWithReauth
          // L'endpoint refresh ne nécessite pas d'authentification (pas de header Authorization)
          const response = await fetch(refreshUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
          });

          if (!response.ok) {
            const errorText = await response.text();
            const error: FetchBaseQueryError = {
              status: response.status,
              data: errorText || response.statusText,
            };
            return { error };
          }

          const responseData = await response.json() as { accessToken: string; refreshToken: string };

          if (!responseData.accessToken || !responseData.refreshToken) {
            const error: FetchBaseQueryError = {
              status: 'CUSTOM_ERROR',
              data: 'Tokens manquants dans la réponse',
              error: 'Tokens manquants dans la réponse',
            };
            return { error };
          }

          // Stocker les nouveaux tokens dans SecureStore
          try {
            await storeTokens(responseData.accessToken, responseData.refreshToken);
          } catch (error) {
            console.error('Erreur lors du stockage des tokens après refresh:', error);
          }

          return { data: responseData };
        } catch (error: any) {
          const fetchError: FetchBaseQueryError = {
            status: 'FETCH_ERROR',
            data: error?.message || 'Erreur lors du rafraîchissement du token',
            error: error?.message || 'Erreur lors du rafraîchissement du token',
          };
          return { error: fetchError };
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


