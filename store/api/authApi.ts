import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { storeTokens } from '../../services/tokenStorage';
import { saveTokensAndUpdateState, setUser } from '../../store/slices/authSlice';
import type { TripRequestVehicleType, User, UserGender } from '../../types';
import { authRefreshApi } from './authRefreshApi';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';
import { userApi } from './userApi';

const currentUserTag = { type: 'User' as const, id: 'CURRENT' };

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

export interface ReferralRegistrationAttributionPayload {
  referralCode?: string;
  referralToken?: string;
  referralProvider?: 'chottulink' | 'branch';
  referralReferringLink?: string;
  referralCapturedAt?: string;
}

/**
 * API d'authentification
 * Gère la connexion, l'inscription, la vérification téléphone et KYC
 */
export const authApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    // Le login accepte uniquement le PIN actuel.
    login: builder.mutation<AuthResponse, { phone: string; pin: string }>({
      query: ({ phone, pin }) => ({
        url: '/auth/login',
        method: 'POST',
        body: { phone, pin },
      }),
      async onQueryStarted(
        _arg: { phone: string; pin: string },
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
          console.error('[authApi] Échec de la connexion ou de l’initialisation de session:', error);
        }
      },
      invalidatesTags: [currentUserTag],
    }),

    requestPinResetOtp: builder.mutation<{ message: string }, { phone: string }>({
      query: ({ phone }) => ({
        url: '/auth/pin/reset/request-otp',
        method: 'POST',
        body: { phone },
      }),
    }),
    verifyPinResetOtp: builder.mutation<
      { resetToken: string; expiresInSeconds: number },
      { phone: string; otp: string }
    >({
      query: ({ phone, otp }) => ({
        url: '/auth/pin/reset/verify-otp',
        method: 'POST',
        body: { phone, otp },
      }),
    }),
    resetPin: builder.mutation<{ message: string }, { resetToken: string; newPin: string }>({
      query: ({ resetToken, newPin }) => ({
        url: '/auth/pin/reset',
        method: 'POST',
        body: { resetToken, newPin },
      }),
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
          console.error('[authApi] Échec de l’inscription ou de l’initialisation de session:', error);
        }
      },
    }),

    // Google mobile (login ou signup)
    googleMobile: builder.mutation<AuthResponse, ReferralRegistrationAttributionPayload & {
      idToken: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      gender?: UserGender;
      role?: 'driver' | 'passenger';
      isDriver?: boolean;
      vehicle?: {
        type: TripRequestVehicleType;
        brand: string;
        model: string;
        color: string;
        licensePlate: string;
      };
    }>({
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
      invalidatesTags: [currentUserTag],
    }),

    // Apple mobile (login ou signup)
    appleMobile: builder.mutation<AuthResponse, ReferralRegistrationAttributionPayload & {
      idToken: string;
      phone?: string;
      nonce?: string;
      firstName?: string;
      lastName?: string;
      gender?: UserGender;
      role?: 'driver' | 'passenger';
      isDriver?: boolean;
      vehicle?: {
        type: TripRequestVehicleType;
        brand: string;
        model: string;
        color: string;
        licensePlate: string;
      };
    }>({
      query: ({
        idToken,
        phone,
        nonce,
        firstName,
        lastName,
        gender,
        role,
        isDriver,
        vehicle,
        referralCode,
        referralToken,
        referralProvider,
        referralReferringLink,
        referralCapturedAt,
      }) => ({
        url: '/auth/apple/mobile',
        method: 'POST',
        body: {
          idToken,
          ...(phone ? { phone } : {}),
          ...(nonce ? { nonce } : {}),
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
          ...(gender ? { gender } : {}),
          ...(role ? { role } : {}),
          ...(typeof isDriver === 'boolean' ? { isDriver } : {}),
          ...(vehicle ? { vehicle } : {}),
          ...(referralCode ? { referralCode } : {}),
          ...(referralToken ? { referralToken } : {}),
          ...(referralProvider ? { referralProvider } : {}),
          ...(referralReferringLink ? { referralReferringLink } : {}),
          ...(referralCapturedAt ? { referralCapturedAt } : {}),
        },
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;

          console.log('[authApi] Apple mobile success - Saving tokens in SecureStore then updating state...');

          await dispatch(saveTokensAndUpdateState({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken
          })).unwrap();

          console.log('[authApi] Tokens saved and state updated successfully');

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
          console.error('[authApi] Erreur lors du login Apple mobile:', error);
        }
      },
      invalidatesTags: [currentUserTag],
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
      invalidatesTags: [currentUserTag],
    }),

    // Déconnexion - invalide le refresh token côté serveur
    logout: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
    }),

    // Rafraîchir l'access token avec le refresh token
    // Délègue à l'API RTK Query non authentifiée pour éviter une boucle de refresh.
    refreshToken: builder.mutation<{ accessToken: string; refreshToken: string }, { refreshToken: string }>({
      queryFn: async (data: { refreshToken: string }, api) => {
        const request = api.dispatch(authRefreshApi.endpoints.refreshSession.initiate(data));
        try {
          const responseData = await request.unwrap();

          if (!responseData.accessToken || !responseData.refreshToken) {
            const error: FetchBaseQueryError = {
              status: 'CUSTOM_ERROR',
              data: 'Tokens manquants dans la réponse',
              error: 'Tokens manquants dans la réponse',
            };
            return { error };
          }

          const refreshedTokens = {
            accessToken: responseData.accessToken,
            refreshToken: responseData.refreshToken,
          };

          // Stocker les nouveaux tokens dans SecureStore
          try {
            await storeTokens(refreshedTokens.accessToken, refreshedTokens.refreshToken);
          } catch (error) {
            console.error('Erreur lors du stockage des tokens après refresh:', error);
          }

          return { data: refreshedTokens };
        } catch (error: any) {
          if (error && typeof error === 'object' && 'status' in error) {
            return { error: error as FetchBaseQueryError };
          }
          const fetchError: FetchBaseQueryError = {
            status: 'CUSTOM_ERROR',
            data: error?.message || 'Erreur lors du rafraîchissement du token',
            error: error?.message || 'Erreur lors du rafraîchissement du token',
          };
          return { error: fetchError };
        } finally {
          request.reset();
        }
      },
    }),
  }),
});

export const {
  useLoginMutation,
  useRequestPinResetOtpMutation,
  useVerifyPinResetOtpMutation,
  useResetPinMutation,
  useRegisterMutation,
  useVerifyPhoneMutation,
  useVerifyKYCMutation,
  useRefreshTokenMutation,
  useGoogleMobileMutation,
  useAppleMobileMutation,
  useLogoutMutation,
} = authApi;
