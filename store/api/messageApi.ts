import { baseApi } from './baseApi';
import type { Conversation, Message } from '../../types';

type PaginatedResponse<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
};

type ListParams = {
  page?: number;
  limit?: number;
};

type CreateConversationPayload = {
  title?: string;
  bookingId?: string;
  participantIds: string[];
  initialMessage?: string;
};

type SendConversationMessagePayload = {
  conversationId: string;
  content: string;
};

type ConversationMessagesArgs = {
  conversationId: string;
};

export const messageApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listConversations: builder.query<PaginatedResponse<Conversation>, ListParams | void>({
      query: (params) => ({
        url: '/conversations',
        params,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.data.map(({ id }) => ({ type: 'Conversation' as const, id })),
              'Conversation',
            ]
          : ['Conversation'],
    }),

    getConversation: builder.query<Conversation, string>({
      query: (id) => `/conversations/${id}`,
      providesTags: (result, error, id) => [{ type: 'Conversation', id }],
    }),

    getConversationMessages: builder.query<Message[], ConversationMessagesArgs>({
      query: ({ conversationId }) => `/conversations/${conversationId}/messages`,
      providesTags: (result, error, { conversationId }) => [
        { type: 'Message', id: conversationId },
        { type: 'Conversation', id: conversationId },
      ],
    }),

    sendConversationMessage: builder.mutation<Message, SendConversationMessagePayload>({
      query: ({ conversationId, content }) => ({
        url: `/conversations/${conversationId}/messages`,
        method: 'POST',
        body: { content },
      }),
      invalidatesTags: (result, error, { conversationId }) => [
        { type: 'Message', id: conversationId },
        { type: 'Conversation', id: conversationId },
      ],
    }),

    createConversation: builder.mutation<Conversation, CreateConversationPayload>({
      query: (payload) => ({
        url: '/conversations',
        method: 'POST',
        body: payload,
      }),
      invalidatesTags: ['Conversation'],
    }),

    markConversationAsRead: builder.mutation<{ message: string }, string>({
      query: (conversationId) => ({
        url: `/conversations/${conversationId}/read`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, id) => [{ type: 'Conversation', id }],
    }),

    addParticipants: builder.mutation<
      Conversation,
      { conversationId: string; userIds: string[] }
    >({
      query: ({ conversationId, userIds }) => ({
        url: `/conversations/${conversationId}/participants`,
        method: 'POST',
        body: { userIds },
      }),
      invalidatesTags: (result, error, { conversationId }) => [
        { type: 'Conversation', id: conversationId },
      ],
    }),

    removeParticipant: builder.mutation<
      { message: string },
      { conversationId: string; userId: string }
    >({
      query: ({ conversationId, userId }) => ({
        url: `/conversations/${conversationId}/participants/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { conversationId }) => [
        { type: 'Conversation', id: conversationId },
      ],
    }),

    getBookingMessages: builder.query<Message[], string>({
      query: (bookingId) => `/chat/booking/${bookingId}/messages`,
      providesTags: (result, error, bookingId) => [{ type: 'Message', id: bookingId }],
    }),

    markMessageAsRead: builder.mutation<{ message: string }, string>({
      query: (messageId) => ({
        url: `/chat/messages/${messageId}/read`,
        method: 'PUT',
      }),
      invalidatesTags: ['Conversation'],
    }),
  }),
});

export const {
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
} = messageApi;
