import type { Review } from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

export interface ReviewPage { data: Review[]; total: number; nextCursor: string | null }
export interface RatedTrips { userId: string; ratedTripIds: string[] }

const buildFullName = (user?: { firstName?: string | null; lastName?: string | null; phone?: string }) => {
  if (!user) {
    return 'Utilisateur';
  }
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return fullName || user.phone || 'Utilisateur';
};

const toFiniteRating = (value: unknown) => {
  const rating = Number(value);
  return Number.isFinite(rating) ? rating : 0;
};

const mapServerRating = (rating: any): Review => ({
  id: rating.id,
  ratedUserId: rating.ratedUserId,
  raterId: rating.raterId,
  rating: toFiniteRating(rating.rating),
  comment: rating.comment ?? undefined,
  tripId: rating.tripId ?? null,
  createdAt: rating.createdAt ?? new Date().toISOString(),
  fromUserName: buildFullName(rating.rater),
  fromUserAvatar: rating.rater?.profilePicture ?? undefined,
});

export const reviewApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    createReview: builder.mutation<
      Review,
      {
        tripId?: string;
        ratedUserId: string;
        rating: number;
        comment?: string;
      }
    >({
      query: (payload) => ({
        url: '/ratings',
        method: 'POST',
        body: payload,
      }),
      transformResponse: (response: any) => mapServerRating(response),
      invalidatesTags: (result, error) => result && !error ? ['User', 'Trip', 'Review'] : [],
    }),

    getMyRatedTrips: builder.query<RatedTrips, { userId: string; tripIds: string[] }>({
      // Account ID partitions the cache only; the server always uses JWT identity.
      async queryFn({ userId, tripIds }, _api, _extra, baseQuery) {
        const response = await baseQuery({ url: '/ratings/mine/trips', params: { tripIds: tripIds.join(',') } });
        if (response.error) return { error: response.error };
        const data = response.data as RatedTrips | undefined;
        if (!data || data.userId !== userId || !Array.isArray(data.ratedTripIds)
          || data.ratedTripIds.length > 100 || data.ratedTripIds.some(id => typeof id !== 'string' || !tripIds.includes(id)))
          return { error: { status: 'CUSTOM_ERROR', error: 'Vérification des évaluations indisponible.' } };
        return { data };
      },
      providesTags: ['Review'],
      keepUnusedDataFor: 60,
    }),

    getReviews: builder.query<Review[], string>({
      query: (userId: string) => `/ratings/user/${userId}`,
      transformResponse: (response: any[]) => response.map(mapServerRating),
      providesTags: (_result, _error, userId) => [{ type: 'User', id: userId }],
    }),

    getReviewPage: builder.query<ReviewPage, { userId: string; before?: string; limit?: number }>({
      query: ({ userId, before, limit = 20 }) => ({ url: `/ratings/user/${userId}/page`, params: { before, limit } }),
      transformResponse: (response: { data: unknown[]; total: number; nextCursor: string | null }) => ({
        data: response.data.map(mapServerRating), total: response.total, nextCursor: response.nextCursor,
      }),
      keepUnusedDataFor: 30,
      providesTags: (_result, _error, { userId }) => [{ type: 'User', id: userId }],
    }),

    getAverageRating: builder.query<{ userId: string; averageRating: number }, string>({
      query: (userId: string) => `/ratings/user/${userId}/average`,
      transformResponse: (response: any, _meta, userId: string) => ({
        userId: String(response?.userId ?? userId),
        averageRating: toFiniteRating(response?.averageRating),
      }),
      providesTags: (_result, _error, userId) => [{ type: 'User', id: userId }],
    }),
  }),
});

export const {
  useCreateReviewMutation,
  useGetMyRatedTripsQuery,
  useGetReviewsQuery,
  useGetReviewPageQuery,
  useGetAverageRatingQuery,
} = reviewApi;
