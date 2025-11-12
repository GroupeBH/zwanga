import { baseApi } from './baseApi';
import type { Conversation, Message } from '../../types';

/**
 * API messages
 * Gère les conversations et les messages entre utilisateurs
 */
export const messageApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Récupérer toutes les conversations de l'utilisateur
    getConversations: builder.query<Conversation[], void>({
      query: () => '/messages/conversations',
      providesTags: ['Conversation'],
    }),

    // Récupérer les messages d'une conversation
    getMessages: builder.query<Message[], string>({
      query: (conversationId) => `/messages/conversations/${conversationId}`,
      providesTags: (result, error, conversationId) => [{ type: 'Message', id: conversationId }],
    }),

    // Envoyer un message dans une conversation
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

    // Marquer les messages d'une conversation comme lus
    markMessagesAsRead: builder.mutation<void, string>({
      query: (conversationId) => ({
        url: `/messages/conversations/${conversationId}/read`,
        method: 'POST',
      }),
      invalidatesTags: ['Conversation'],
    }),
  }),
});

export const {
  useGetConversationsQuery,
  useGetMessagesQuery,
  useSendMessageMutation,
  useMarkMessagesAsReadMutation,
} = messageApi;


