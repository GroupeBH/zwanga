import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

/**
 * API notifications
 * Gère les notifications de l'utilisateur
 */
type NotificationRecord = {
  id: string;
  title: string;
  message: string;
  type?: string;
  createdAt: string;
  read?: boolean;
  readAt?: string | null;
};

export const notificationApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    // Récupérer toutes les notifications
    getNotifications: builder.query<NotificationRecord[], void>({
      query: () => '/notifications',
      providesTags: ['Notification'],
    }),

    // Marquer une notification comme lue
    markNotificationAsRead: builder.mutation<void, string>({
      query: (id: string) => ({
        url: `/notifications/${id}/read`,
        method: 'POST',
      }),
      invalidatesTags: ['Notification'],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useMarkNotificationAsReadMutation,
} = notificationApi;


