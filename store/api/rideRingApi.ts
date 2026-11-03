import { baseApi, publicBaseQuery } from './baseApi';

/** Public, invitation-scoped capability: no account token refresh before ringing. */
export const rideRingApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    validateRideRing: builder.mutation<{ allowed: boolean }, string>({
      queryFn: async (token, api, extra) => {
        const result = await publicBaseQuery({ url: '/notifications/ride-alerts/validate',
          method: 'POST', body: { token }, timeout: 3000, redirect: 'error' }, api, extra);
        return result.error ? { error: result.error } : { data: result.data as { allowed: boolean } };
      },
    }),
  }),
});
