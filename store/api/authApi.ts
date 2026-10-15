import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { getTokens } from '../../services/tokenStorage';
import { refreshAccessToken } from '../../services/tokenRefresh';
import { getTokenSessionVersion } from '../../services/tokenSession';
import type { TripRequestVehicleType, User, UserGender } from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

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
    // Authentication mutations only return the server response. The active form
    // owns saveTokensAndUpdateState and awaits durable storage before navigation.
    // An onQueryStarted save races that owner and invalidates its session guard.
    // Le login accepte uniquement le PIN actuel.
    login: builder.mutation<AuthResponse, { phone: string; pin: string }>({
      query: ({ phone, pin }) => ({
        url: '/auth/login',
        method: 'POST',
        body: { phone, pin },
      }),
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
      queryFn: async (data: { refreshToken: string }) => {
        const version = getTokenSessionVersion();
        const accessToken = await refreshAccessToken(data.refreshToken);
        const tokens = await getTokens();
        if (!accessToken || version !== getTokenSessionVersion() || !tokens.refreshToken) {
          const error: FetchBaseQueryError = {
            status: 'CUSTOM_ERROR',
            error: 'Impossible de renouveler la session pour le moment. Veuillez réessayer.',
          };
          return { error };
        }
        return { data: { accessToken, refreshToken: tokens.refreshToken } };
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
