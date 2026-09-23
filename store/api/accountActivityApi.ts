import { baseApi } from './baseApi';

export type ActivityCategory = 'trips' | 'bookings' | 'requests';
export interface ActivityRevision { revision: string; count: number }
export interface AccountActivity {
  schemaVersion: 1;
  userId: string;
  trips: ActivityRevision;
  bookings: ActivityRevision;
  requests: ActivityRevision;
  hasLiveActivity: boolean;
  passengerTrackingBookingId: string | null;
}

export function isAccountActivity(value: unknown, userId: string): value is AccountActivity {
  if (!value || typeof value !== 'object') return false;
  const state = value as AccountActivity;
  return state.schemaVersion === 1 && state.userId === userId && typeof state.hasLiveActivity === 'boolean'
    && (state.passengerTrackingBookingId === null || typeof state.passengerTrackingBookingId === 'string')
    && (['trips', 'bookings', 'requests'] as const).every(key => {
      const section = state[key];
      return section && /^[a-f0-9]{64}$/.test(section.revision) && Number.isSafeInteger(section.count) && section.count >= 0;
    });
}

export const accountActivityApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    getAccountActivity: builder.query<AccountActivity, string>({
      // User ID isolates the cache; the server takes identity ONLY from the access token.
      async queryFn(userId, _api, _extra, baseQuery) {
        const response = await baseQuery('/me/activity');
        if (response.error) return { error: response.error };
        if (!isAccountActivity(response.data, userId)) return { error: {
          status: 'CUSTOM_ERROR', error: 'Impossible de vérifier votre activité pour le moment.',
        } };
        return { data: response.data };
      },
      providesTags: ['AccountActivity', { type: 'MyTrips', id: 'LIST' },
        { type: 'Booking', id: 'LIST' }, { type: 'MyTripRequests', id: 'LIST' }],
    }),
  }),
});
export const { useGetAccountActivityQuery } = accountActivityApi;
