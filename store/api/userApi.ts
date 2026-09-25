import { buildGetProfileSummaryEndpoints } from './user/getProfileSummary.endpoints';
import { buildDeleteFavoriteLocationEndpoints } from './user/deleteFavoriteLocation.endpoints';
import {
  currentUserTag,
  kycStatusTag,
  DiditKycSyncPayload,
  RawDiditKycSyncResponse,
  mapDiditKycSyncResponse,
} from './user/identityContracts';

export type { DiditKycSession } from './user/identityContracts';

import { refreshAccessToken } from '../../services/tokenRefresh';
import { getRefreshToken } from '../../services/tokenStorage';
import type { KycDocument } from '../../types';

import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

const refreshAuthAfterKycUpdate = async (dispatch: any) => {
  dispatch(userApi.util.invalidateTags([currentUserTag, kycStatusTag]));

  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    dispatch(userApi.endpoints.getKycStatus.initiate(undefined, { forceRefetch: true }));
    dispatch(userApi.endpoints.getCurrentUser.initiate(undefined, { forceRefetch: true }));
    return;
  }

  const refreshedAccessToken = await refreshAccessToken(refreshToken);
  if (!refreshedAccessToken) {
    console.warn('Token refresh failed after KYC update');
  }

  dispatch(userApi.endpoints.getKycStatus.initiate(undefined, { forceRefetch: true }));
  dispatch(userApi.endpoints.getCurrentUser.initiate(undefined, { forceRefetch: true }));
};

/**
 * API utilisateurs
 * Gère les opérations CRUD sur les utilisateurs
 */
export const userApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    ...buildGetProfileSummaryEndpoints(builder),
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
          dispatch(userApi.util.invalidateTags([kycStatusTag]));

          // Get current refresh token from secure storage
          const refreshToken = await getRefreshToken();

          if (refreshToken) {
            // Trigger token refresh to get new JWT with updated KYC status
            // This ensures the access token immediately reflects the new KYC status
            const refreshedAccessToken = await refreshAccessToken(refreshToken);

            if (refreshedAccessToken) {
              console.log('Tokens refreshed successfully after KYC upload');
            } else {
              console.warn('Token refresh failed after KYC upload');
            }

            // Invalider les tags User et KycStatus pour forcer un refetch immédiat
            // Cela garantit que tous les composants utilisant ces données se mettent à jour
            dispatch(userApi.util.invalidateTags([currentUserTag, kycStatusTag]));

            // Forcer un refetch immédiat du statut KYC et du profil utilisateur
            dispatch(userApi.endpoints.getKycStatus.initiate(undefined, { forceRefetch: true }));
            dispatch(userApi.endpoints.getCurrentUser.initiate(undefined, { forceRefetch: true }));
          } else {
            console.warn('No refresh token available after KYC upload');
            // Même sans refresh token, forcer un refetch du statut KYC
            dispatch(userApi.util.invalidateTags([kycStatusTag]));
            dispatch(userApi.endpoints.getKycStatus.initiate(undefined, { forceRefetch: true }));
          }
        } catch (error) {
          // Don't throw - KYC upload was successful, token refresh is optional
          // The user can still continue using the app with the old token
          console.error('Error refreshing tokens after KYC upload:', error);
          // Même en cas d'erreur, invalider les tags et forcer un refetch du statut KYC
          dispatch(userApi.util.invalidateTags([kycStatusTag]));
          dispatch(userApi.endpoints.getKycStatus.initiate(undefined, { forceRefetch: true }));
        }
      },
      invalidatesTags: [currentUserTag, kycStatusTag],
    }),
    syncDiditKycSession: builder.mutation<KycDocument | null, DiditKycSyncPayload | void>({
      query: (body) => ({
        url: '/users/kyc/didit/sync',
        method: 'POST',
        body: body ?? {},
      }),
      transformResponse: (response: RawDiditKycSyncResponse) => mapDiditKycSyncResponse(response),
      async onQueryStarted(_arg, { queryFulfilled, dispatch }) {
        try {
          await queryFulfilled;
          await refreshAuthAfterKycUpdate(dispatch);
        } catch (error) {
          console.warn('Error refreshing auth after Didit KYC sync:', error);
          dispatch(userApi.util.invalidateTags([currentUserTag, kycStatusTag]));
        }
      },
      invalidatesTags: [currentUserTag, kycStatusTag],
    }),
    ...buildDeleteFavoriteLocationEndpoints(builder),
  }),
});

export const {
  useGetProfileSummaryQuery,
  useGetCurrentUserQuery,
  useLazyGetCurrentUserQuery,
  useUpdateUserMutation,
  useRequestDriverOnboardingMutation,
  useActivateDriverMutation,
  useDeleteAccountMutation,
  useGetUserByIdQuery,
  useGetPublicUserInfoQuery,
  useUploadKycMutation,
  useGetKycStatusQuery,
  useCreateDiditKycSessionMutation,
  useSyncDiditKycSessionMutation,
  useUpdateFcmTokenMutation,
  useSendPhoneVerificationOtpMutation,
  useVerifyPhoneOtpMutation,
  useUpdatePinMutation,
  // Favorite Locations
  useGetFavoriteLocationsQuery,
  useGetDefaultFavoriteLocationQuery,
  useGetFavoriteLocationByIdQuery,
  useCreateFavoriteLocationMutation,
  useUpdateFavoriteLocationMutation,
  useDeleteFavoriteLocationMutation,
} = userApi;
