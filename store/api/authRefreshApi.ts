import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL } from '../../config/env';
import { DEFAULT_API_TIMEOUT_MS } from '../../constants/network';

export type RefreshSessionPayload = { refreshToken: string };
export type RefreshSessionResponse = { accessToken: string; refreshToken: string };

/**
 * Unauthenticated RTK Query service dedicated to session renewal.
 *
 * It must not use the authenticated base API: doing so would make a rejected
 * refresh request recursively trigger another refresh.
 */
export const authRefreshApi = createApi({
  reducerPath: 'authRefreshApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL,
    timeout: DEFAULT_API_TIMEOUT_MS,
  }),
  endpoints: (builder) => ({
    refreshSession: builder.mutation<RefreshSessionResponse, RefreshSessionPayload>({
      query: (body) => ({
        url: '/auth/refresh',
        method: 'POST',
        body,
      }),
    }),
  }),
});
