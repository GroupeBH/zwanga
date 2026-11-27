import { baseApi } from './baseApi';

export interface PublicMemberProfile {
  id: string; firstName: string; lastName: string; profilePicture: string | null;
  role: string; isPhoneVerified: boolean; createdAt: string | null;
  averageRating: number | null; totalRatings: number; passengerBookings: number;
}
export const publicMemberApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    getPublicMember: builder.query<PublicMemberProfile, { id: string; viewerId: string; session: number }>({
      query: ({ id }) => ({ url: `/users/${encodeURIComponent(id)}/public`, cache: 'no-store' }),
      keepUnusedDataFor: 0,
      transformResponse: (raw: PublicMemberProfile & { stats?: { bookingsAsPassenger?: number } }) => ({
        id: raw.id, firstName: raw.firstName, lastName: raw.lastName, profilePicture: raw.profilePicture ?? null,
        role: raw.role, isPhoneVerified: raw.isPhoneVerified === true, createdAt: raw.createdAt ?? null,
        averageRating: raw.averageRating, totalRatings: raw.totalRatings,
        passengerBookings: raw.stats?.bookingsAsPassenger ?? 0,
      }),
      providesTags: (_data, _error, { id }) => [{ type: 'User', id }],
    }),
  }),
});
export const { useGetPublicMemberQuery } = publicMemberApi;
