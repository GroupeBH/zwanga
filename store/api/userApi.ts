import { buildGetProfileSummaryEndpoints } from './user/getProfileSummary.endpoints';
import { buildDeleteFavoriteLocationEndpoints } from './user/deleteFavoriteLocation.endpoints';
import {
  currentUserTag,
  kycStatusTag,
  DiditKycSyncPayload,
  RawDiditKycSyncResponse,
  mapDiditKycSyncResponse,
} from './user/identityContracts';

import { refreshAccessToken } from '../../services/tokenRefresh';
import { getRefreshToken } from '../../services/tokenStorage';
import type { KycDocument } from '../../types';

import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

export type { DiditKycSession } from './user/identityContracts';

const refreshAuthAfterKycUpdate = async (dispatch: any) => {
  try {
    const refreshToken = await getRefreshToken();
    if (refreshToken && !(await refreshAccessToken(refreshToken))) {
      console.warn('Token refresh failed after KYC update');
    }
  } catch (error) {
    // Identity was saved: a failed token refresh must not prevent reading its status.
    console.warn('Error refreshing auth after identity update:', error);
  }

  dispatch(userApi.util.invalidateTags([currentUserTag, kycStatusTag]));
  // Refresh even without a mounted consumer, but never retain an imperative subscription.
  // Existing subscribers are refetched by the tags and share these in-flight reads.
  await Promise.all([
    dispatch(userApi.endpoints.getKycStatus.initiate(undefined, { forceRefetch: true, subscribe: false })),
    dispatch(userApi.endpoints.getCurrentUser.initiate(undefined, { forceRefetch: true, subscribe: false })),
  ]);
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
          await queryFulfilled;
          await refreshAuthAfterKycUpdate(dispatch);
        } catch (error) {
          console.error('Error refreshing tokens after KYC upload:', error);
          dispatch(userApi.util.invalidateTags([kycStatusTag]));
        }
      },
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
