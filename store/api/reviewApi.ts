import { baseApi } from './baseApi';
import type { Review } from '../../types';

/**
 * API avis et signalements
 * Gère les avis utilisateurs et les signalements
 */
export const reviewApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Créer un avis après un trajet
    createReview: builder.mutation<Review, {
      tripId: string;
      toUserId: string;
      rating: number;
      comment: string;
      tags: string[];
    }>({
      query: (review) => ({
        url: '/reviews',
        method: 'POST',
        body: review,
      }),
      invalidatesTags: ['User', 'Trip'],
    }),

    // Signaler un utilisateur
    reportUser: builder.mutation<void, {
      userId: string;
      tripId: string;
      reason: string;
      details: string;
    }>({
      query: (report) => ({
        url: '/reports',
        method: 'POST',
        body: report,
      }),
    }),

    // Récupérer les avis d'un utilisateur
    getReviews: builder.query<Review[], string>({
      query: (userId) => `/users/${userId}/reviews`,
    }),
  }),
});

export const {
  useCreateReviewMutation,
  useReportUserMutation,
  useGetReviewsQuery,
} = reviewApi;


