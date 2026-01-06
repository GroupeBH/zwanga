import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { API_BASE_URL } from '../../config/env';
import { storeTokens } from '../../services/tokenStorage';
import { setTokens, setUser } from '../../store/slices/authSlice';
import type { User } from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';
import { userApi } from './userApi';

/**
 * Interface de réponse d'authentification avec tokens JWT
 * Note: Le backend ne retourne plus l'utilisateur dans la réponse (commenté)
 * L'utilisateur doit être récupéré séparément avec getCurrentUser après l'authentification
 */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user?: User; // Optionnel car le backend peut ne pas le retourner
}

/**
 * API d'authentification
 * Gère la connexion, l'inscription, la vérification téléphone et KYC
 */
export const authApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    // Connexion avec téléphone et PIN (ou newPin pour réinitialisation)
    login: builder.mutation<AuthResponse, { phone: string; pin?: string; newPin?: string }>({
      query: (credentials: { phone: string; pin?: string; newPin?: string }) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      async onQueryStarted(
        _arg: { phone: string; pin?: string; newPin?: string },
        { dispatch, queryFulfilled }: { dispatch: any; queryFulfilled: Promise<{ data: AuthResponse }> },
      ) {
        try {
          const { data } = await queryFulfilled;
          
          console.log('[authApi] Login success - Storing tokens in SecureStore...');
          
          // 1. Stocker les tokens dans SecureStore (PRIORITÉ)
          await storeTokens(data.accessToken, data.refreshToken);
          
          console.log('[authApi] Tokens stored in SecureStore successfully');
          
          // 2. Dispatcher setTokens dans Redux EN PREMIER (CRITIQUE pour l'ordre)
          // setTokens définit aussi isAuthenticated=true et met à jour l'utilisateur depuis le token
          dispatch(setTokens({ 
            accessToken: data.accessToken, 
            refreshToken: data.refreshToken 
          }));
          
          console.log('[authApi] Tokens dispatched to Redux');
          
          // 3. Récupérer l'utilisateur complet (si nécessaire) APRÈS setTokens
          // setTokens a déjà mis à jour l'utilisateur depuis le token JWT, mais on peut
          // récupérer les infos complètes depuis l'API si nécessaire
          if (!data.user) {
            const userResult = await dispatch(userApi.endpoints.getCurrentUser.initiate(undefined, { forceRefetch: true }));
            if (userResult.data) {
              dispatch(setUser(userResult.data));
            }
          } else {
            // Si data.user existe, on le met à jour APRÈS setTokens
            // pour avoir les infos complètes (setTokens a déjà mis les infos basiques du token)
            dispatch(setUser(data.user));
          }
        } catch (error) {
          console.error('[authApi] Erreur lors du stockage des tokens après login:', error);
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
        { dispatch, queryFulfilled }: { dispatch: any; queryFulfilled: Promise<{ data: AuthResponse }> },
      ) {
        try {
          const { data } = await queryFulfilled;
          
          console.log('[authApi] Registration success - Storing tokens in SecureStore...');
          
          // 1. Stocker les tokens dans SecureStore (PRIORITÉ)
          await storeTokens(data.accessToken, data.refreshToken);
          
          console.log('[authApi] Tokens stored in SecureStore successfully');
          
          // 2. Dispatcher setTokens dans Redux EN PREMIER (CRITIQUE pour l'ordre)
          // setTokens définit aussi isAuthenticated=true et met à jour l'utilisateur depuis le token
          dispatch(setTokens({ 
            accessToken: data.accessToken, 
            refreshToken: data.refreshToken 
          }));
          
          console.log('[authApi] Tokens dispatched to Redux');
          
          // 3. Récupérer l'utilisateur complet (si nécessaire) APRÈS setTokens
          // setTokens a déjà mis à jour l'utilisateur depuis le token JWT, mais on peut
          // récupérer les infos complètes depuis l'API si nécessaire
          if (!data.user) {
            const userResult = await dispatch(userApi.endpoints.getCurrentUser.initiate(undefined, { forceRefetch: true }));
            if (userResult.data) {
              dispatch(setUser(userResult.data));
            }
          } else {
            // Si data.user existe, on le met à jour APRÈS setTokens
            // pour avoir les infos complètes (setTokens a déjà mis les infos basiques du token)
            dispatch(setUser(data.user));
          }
        } catch (error) {
          console.error('[authApi] Erreur lors du stockage des tokens après inscription:', error);
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


