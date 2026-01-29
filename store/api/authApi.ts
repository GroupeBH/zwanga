import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { API_BASE_URL } from '../../config/env';
import { storeTokens } from '../../services/tokenStorage';
import { saveTokensAndUpdateState, setUser } from '../../store/slices/authSlice';
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
          
          console.log('[authApi] Login success - Saving tokens in SecureStore then updating state...');
          
          // 1. Sauvegarder dans SecureStore puis mettre à jour le state Redux (séquentiellement)
          await dispatch(saveTokensAndUpdateState({ 
            accessToken: data.accessToken, 
            refreshToken: data.refreshToken 
          })).unwrap();
          
          console.log('[authApi] Tokens saved and state updated successfully');
          
          // 2. Récupérer l'utilisateur complet (si nécessaire) APRÈS la sauvegarde des tokens
          if (!data.user) {
            const userResult = await dispatch(userApi.endpoints.getCurrentUser.initiate(undefined, { forceRefetch: true }));
            if (userResult.data) {
              dispatch(setUser(userResult.data));
            }
          } else {
            // Si data.user existe, on le met à jour
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
          
          console.log('[authApi] Registration success - Saving tokens in SecureStore then updating state...');
          
          // 1. Sauvegarder dans SecureStore puis mettre à jour le state Redux (séquentiellement)
          await dispatch(saveTokensAndUpdateState({ 
            accessToken: data.accessToken, 
            refreshToken: data.refreshToken 
          })).unwrap();
          
          console.log('[authApi] Tokens saved and state updated successfully');
          
          // 2. Récupérer l'utilisateur complet (si nécessaire) APRÈS la sauvegarde des tokens
          if (!data.user) {
            const userResult = await dispatch(userApi.endpoints.getCurrentUser.initiate(undefined, { forceRefetch: true }));
            if (userResult.data) {
              dispatch(setUser(userResult.data));
            }
          } else {
            // Si data.user existe, on le met à jour
            dispatch(setUser(data.user));
          }
        } catch (error) {
          console.error('[authApi] Erreur lors du stockage des tokens après inscription:', error);
        }
      },
    }),

    // Google mobile (login ou signup)
    googleMobile: builder.mutation<AuthResponse, { idToken: string; phone?: string }>({
      query: (body) => ({
        url: '/auth/google/mobile',
        method: 'POST',
        body,
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          
          console.log('[authApi] Google mobile success - Saving tokens in SecureStore then updating state...');
          
          // 1. Sauvegarder dans SecureStore puis mettre à jour le state Redux (séquentiellement)
          await dispatch(saveTokensAndUpdateState({ 
            accessToken: data.accessToken, 
            refreshToken: data.refreshToken 
          })).unwrap();
          
          console.log('[authApi] Tokens saved and state updated successfully');

          // 2. Récupérer l'utilisateur complet (si nécessaire) APRÈS la sauvegarde des tokens
          if (!data.user) {
            const userResult = await dispatch(
              userApi.endpoints.getCurrentUser.initiate(undefined, { forceRefetch: true }),
            );
            if (userResult.data) {
              dispatch(setUser(userResult.data));
            }
          } else {
            dispatch(setUser(data.user));
          }
        } catch (error) {
          console.error('[authApi] Erreur lors du login Google mobile:', error);
        }
      },
      invalidatesTags: ['User'],
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

    // Déconnexion - invalide le refresh token côté serveur
    logout: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
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
  useGoogleMobileMutation,
  useLogoutMutation,
} = authApi;


