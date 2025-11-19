/**
 * API principale ZWANGA
 * 
 * Ce fichier combine tous les modules API pour créer une API unifiée.
 * Tous les endpoints sont injectés dans baseApi via injectEndpoints.
 * 
 * Structure modulaire :
 * - baseApi.ts : Configuration de base (baseQuery, tagTypes)
 * - authApi.ts : Authentification (login, register, verifyPhone, verifyKYC)
 * - userApi.ts : Utilisateurs (getCurrentUser, updateUser, getUserById)
 * - tripApi.ts : Trajets (getTrips, createTrip, updateTrip, bookTrip, etc.)
 * - messageApi.ts : Messages (getConversations, getMessages, sendMessage)
 * - reviewApi.ts : Avis et signalements (createReview, reportUser, getReviews)
 * - notificationApi.ts : Notifications (getNotifications, markAsRead)
 */

// Import de la base API
export { baseApi as zwangaApi } from './baseApi';

// Injection de tous les modules API
import './authApi';
import './messageApi';
import './notificationApi';
import './reviewApi';
import './tripApi';
import './userApi';
import './bookingApi';

// Ré-exporter tous les hooks pour faciliter l'utilisation
export {
  // Auth
  useLoginMutation,
  useRegisterMutation, useVerifyKYCMutation, useVerifyPhoneMutation
} from './authApi';

export {
  // User
  useGetProfileSummaryQuery,
  useGetCurrentUserQuery,
  useGetUserByIdQuery,
  useUpdateUserMutation,
  useUploadKycMutation,
  useGetKycStatusQuery
} from './userApi';

export {
  useBookTripMutation,
  useCreateTripMutation,
  useDeleteTripMutation,
  useGetTripByIdQuery,
  // Trips
  useGetTripsQuery,
  useGetMyTripsQuery,
  useUpdateTripMutation,
} from './tripApi';

export {
  // Bookings
  useCreateBookingMutation,
  useGetMyBookingsQuery,
  useGetTripBookingsQuery,
  useGetBookingByIdQuery,
  useUpdateBookingStatusMutation,
  useCancelBookingMutation,
  useAcceptBookingMutation,
  useRejectBookingMutation,
} from './bookingApi';

export {
  // Conversations & messages
  useListConversationsQuery,
  useLazyListConversationsQuery,
  useGetConversationQuery,
  useGetConversationMessagesQuery,
  useSendConversationMessageMutation,
  useCreateConversationMutation,
  useMarkConversationAsReadMutation,
  useAddParticipantsMutation,
  useRemoveParticipantMutation,
  useGetBookingMessagesQuery,
  useMarkMessageAsReadMutation,
} from './messageApi';

export {
  // Reviews
  useCreateReviewMutation, useGetReviewsQuery, useReportUserMutation
} from './reviewApi';

export {
  // Notifications
  useGetNotificationsQuery,
  useMarkNotificationAsReadMutation
} from './notificationApi';

