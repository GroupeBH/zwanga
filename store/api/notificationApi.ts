import { baseApi } from './baseApi';

/**
 * API notifications
 * Gère les notifications de l'utilisateur
 */
export const notificationApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Récupérer toutes les notifications
    getNotifications: builder.query<any[], void>({
      query: () => '/notifications',
      providesTags: ['Notification'],
    }),

    // Marquer une notification comme lue
    markNotificationAsRead: builder.mutation<void, string>({
      query: (id) => ({
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


