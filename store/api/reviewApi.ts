import type { Review } from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

const buildFullName = (user?: { firstName?: string | null; lastName?: string | null; phone?: string }) => {
  if (!user) {
    return 'Utilisateur';
  }
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return fullName || user.phone || 'Utilisateur';
};

const mapServerRating = (rating: any): Review => ({
  id: rating.id,
  ratedUserId: rating.ratedUserId,
  raterId: rating.raterId,
  rating: rating.rating,
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
      invalidatesTags: ['User', 'Trip'],
    }),

    getReviews: builder.query<Review[], string>({
      query: (userId: string) => `/ratings/user/${userId}`,
      transformResponse: (response: any[]) => response.map(mapServerRating),
      providesTags: (_result, _error, userId) => [{ type: 'User', id: userId }],
    }),

    getAverageRating: builder.query<{ userId: string; averageRating: number }, string>({
      query: (userId: string) => `/ratings/user/${userId}/average`,
    }),
  }),
});

export const {
  useCreateReviewMutation,
  useGetReviewsQuery,
  useGetAverageRatingQuery,
} = reviewApi;
