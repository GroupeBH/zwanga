import type { Notification, NotificationsResponse, MarkNotificationsResponse } from '@/types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

type ServerNotification = {
  id: string;
  userId: string | null;
  fcmToken: string;
  title: string;
  body: string;
  data: Record<string, any> | null;
  status: string;
  errorMessage: string | null;
  messageId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const mapServerNotificationToClient = (notification: ServerNotification): Notification => {
  return {
    id: notification.id,
    userId: notification.userId,
    fcmToken: notification.fcmToken,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    status: notification.status as Notification['status'],
    errorMessage: notification.errorMessage,
    messageId: notification.messageId,
    isRead: notification.isRead,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
};

type GetNotificationsParams = {
  limit?: number;
  offset?: number;
};

type MarkNotificationsAsReadPayload = {
  notificationIds: string[];
};

export const notificationApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    // Récupérer toutes les notifications de l'utilisateur
    getNotifications: builder.query<NotificationsResponse, GetNotificationsParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.limit) {
          searchParams.append('limit', params.limit.toString());
        }
        if (params?.offset) {
          searchParams.append('offset', params.offset.toString());
        }
        const queryString = searchParams.toString();
        return `/notifications${queryString ? `?${queryString}` : ''}`;
      },
      transformResponse: (response: {
        notifications: ServerNotification[];
        total: number;
        unreadCount: number;
      }) => ({
        notifications: response.notifications.map(mapServerNotificationToClient),
        total: response.total,
        unreadCount: response.unreadCount,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.notifications.map(({ id }) => ({ type: 'Notification' as const, id })),
              'Notification',
            ]
          : ['Notification'],
    }),

    // Marquer des notifications comme lues
    markNotificationsAsRead: builder.mutation<MarkNotificationsResponse, MarkNotificationsAsReadPayload>({
      query: (payload) => ({
        url: '/notifications/mark-as-read',
        method: 'PUT',
        body: payload,
      }),
      invalidatesTags: ['Notification'],
    }),

    // Marquer toutes les notifications comme lues
    markAllNotificationsAsRead: builder.mutation<MarkNotificationsResponse, void>({
      query: () => ({
        url: '/notifications/mark-all-as-read',
        method: 'PUT',
      }),
      invalidatesTags: ['Notification'],
    }),

    // Marquer des notifications comme non lues
    markNotificationsAsUnread: builder.mutation<MarkNotificationsResponse, MarkNotificationsAsReadPayload>({
      query: (payload) => ({
        url: '/notifications/mark-as-unread',
        method: 'PUT',
        body: payload,
      }),
      invalidatesTags: ['Notification'],
    }),

    // Désactiver des notifications (les retirer de la liste affichée)
    disableNotifications: builder.mutation<MarkNotificationsResponse, MarkNotificationsAsReadPayload>({
      query: (payload) => ({
        url: '/notifications/disable',
        method: 'PUT',
        body: payload,
      }),
      invalidatesTags: ['Notification'],
    }),

    // Réactiver des notifications (les remettre dans la liste affichée)
    enableNotifications: builder.mutation<MarkNotificationsResponse, MarkNotificationsAsReadPayload>({
      query: (payload) => ({
        url: '/notifications/enable',
        method: 'PUT',
        body: payload,
      }),
      invalidatesTags: ['Notification'],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useMarkNotificationsAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
  useMarkNotificationsAsUnreadMutation,
  useDisableNotificationsMutation,
  useEnableNotificationsMutation,
} = notificationApi;


