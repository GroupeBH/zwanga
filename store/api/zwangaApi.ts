import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { User, Trip, Conversation, Message, Review } from '../../types';
import type { RootState } from '../index';

// Base URL de l'API - À configurer selon votre backend
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.zwanga.cd/v1';

export const zwangaApi = createApi({
  reducerPath: 'zwangaApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: (headers, { getState }) => {
      // Ajouter le token d'authentification
      const token = (getState() as RootState).auth.token;
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['User', 'Trip', 'Message', 'Conversation', 'Review'],
  endpoints: (builder) => ({
    // === AUTHENTICATION ===
    login: builder.mutation<{ user: User; token: string }, { phone: string; password: string }>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      invalidatesTags: ['User'],
    }),
    
    register: builder.mutation<{ user: User; token: string }, {
      phone: string;
      name: string;
      email?: string;
      role: 'driver' | 'passenger' | 'both';
    }>({
      query: (userData) => ({
        url: '/auth/register',
        method: 'POST',
        body: userData,
      }),
    }),
    
    verifyPhone: builder.mutation<{ verified: boolean }, { phone: string; code: string }>({
      query: (data) => ({
        url: '/auth/verify-phone',
        method: 'POST',
        body: data,
      }),
    }),
    
    verifyKYC: builder.mutation<{ verified: boolean }, { idNumber: string; fullName: string }>({
      query: (data) => ({
        url: '/auth/verify-kyc',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['User'],
    }),
    
    // === USER ===
    getCurrentUser: builder.query<User, void>({
      query: () => '/user/me',
      providesTags: ['User'],
    }),
    
    updateUser: builder.mutation<User, Partial<User>>({
      query: (updates) => ({
        url: '/user/me',
        method: 'PATCH',
        body: updates,
      }),
      invalidatesTags: ['User'],
    }),
    
    getUserById: builder.query<User, string>({
      query: (id) => `/users/${id}`,
      providesTags: (result, error, id) => [{ type: 'User', id }],
    }),
    
    // === TRIPS ===
    getTrips: builder.query<Trip[], {
      departure?: string;
      arrival?: string;
      vehicleType?: string;
      date?: string;
    }>({
      query: (params) => ({
        url: '/trips',
        params,
      }),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Trip' as const, id })), 'Trip']
          : ['Trip'],
    }),
    
    getTripById: builder.query<Trip, string>({
      query: (id) => `/trips/${id}`,
      providesTags: (result, error, id) => [{ type: 'Trip', id }],
    }),
    
    createTrip: builder.mutation<Trip, Omit<Trip, 'id' | 'driverId' | 'driverName' | 'driverRating'>>({
      query: (trip) => ({
        url: '/trips',
        method: 'POST',
        body: trip,
      }),
      invalidatesTags: ['Trip'],
    }),
    
    updateTrip: builder.mutation<Trip, { id: string; updates: Partial<Trip> }>({
      query: ({ id, updates }) => ({
        url: `/trips/${id}`,
        method: 'PATCH',
        body: updates,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Trip', id }, 'Trip'],
    }),
    
    cancelTrip: builder.mutation<void, string>({
      query: (id) => ({
        url: `/trips/${id}/cancel`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, id) => [{ type: 'Trip', id }, 'Trip'],
    }),
    
    bookTrip: builder.mutation<void, { tripId: string; seats: number }>({
      query: ({ tripId, seats }) => ({
        url: `/trips/${tripId}/book`,
        method: 'POST',
        body: { seats },
      }),
      invalidatesTags: (result, error, { tripId }) => [{ type: 'Trip', id: tripId }, 'Trip'],
    }),
    
    // === MESSAGES ===
    getConversations: builder.query<Conversation[], void>({
      query: () => '/messages/conversations',
      providesTags: ['Conversation'],
    }),
    
    getMessages: builder.query<Message[], string>({
      query: (conversationId) => `/messages/conversations/${conversationId}`,
      providesTags: (result, error, conversationId) => [{ type: 'Message', id: conversationId }],
    }),
    
    sendMessage: builder.mutation<Message, { conversationId: string; text: string }>({
      query: ({ conversationId, text }) => ({
        url: `/messages/conversations/${conversationId}`,
        method: 'POST',
        body: { text },
      }),
      invalidatesTags: (result, error, { conversationId }) => [
        { type: 'Message', id: conversationId },
        'Conversation',
      ],
    }),
    
    markMessagesAsRead: builder.mutation<void, string>({
      query: (conversationId) => ({
        url: `/messages/conversations/${conversationId}/read`,
        method: 'POST',
      }),
      invalidatesTags: ['Conversation'],
    }),
    
    // === REVIEWS ===
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
    
    getReviews: builder.query<Review[], string>({
      query: (userId) => `/users/${userId}/reviews`,
    }),
    
    // === NOTIFICATIONS ===
    getNotifications: builder.query<any[], void>({
      query: () => '/notifications',
    }),
    
    markNotificationAsRead: builder.mutation<void, string>({
      query: (id) => ({
        url: `/notifications/${id}/read`,
        method: 'POST',
      }),
    }),
  }),
});

// Export hooks for usage in components
export const {
  // Auth
  useLoginMutation,
  useRegisterMutation,
  useVerifyPhoneMutation,
  useVerifyKYCMutation,
  
  // User
  useGetCurrentUserQuery,
  useUpdateUserMutation,
  useGetUserByIdQuery,
  
  // Trips
  useGetTripsQuery,
  useGetTripByIdQuery,
  useCreateTripMutation,
  useUpdateTripMutation,
  useCancelTripMutation,
  useBookTripMutation,
  
  // Messages
  useGetConversationsQuery,
  useGetMessagesQuery,
  useSendMessageMutation,
  useMarkMessagesAsReadMutation,
  
  // Reviews
  useCreateReviewMutation,
  useReportUserMutation,
  useGetReviewsQuery,
  
  // Notifications
  useGetNotificationsQuery,
  useMarkNotificationAsReadMutation,
} = zwangaApi;

