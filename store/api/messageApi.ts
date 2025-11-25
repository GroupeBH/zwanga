import { baseApi } from './baseApi';
import type { Conversation, Message } from '../../types';
import type { BaseEndpointBuilder } from './types';

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
  endpoints: (builder: BaseEndpointBuilder) => ({
    listConversations: builder.query<PaginatedResponse<Conversation>, ListParams | void>({
      query: (params?: ListParams) => ({
        url: '/conversations',
        params,
      }),
      providesTags: (result: PaginatedResponse<Conversation> | undefined) =>
        result
          ? [
              ...result.data.map(({ id }) => ({ type: 'Conversation' as const, id })),
              'Conversation',
            ]
          : ['Conversation'],
    }),

    getConversation: builder.query<Conversation, string>({
      query: (id: string) => `/conversations/${id}`,
      providesTags: (_result, _error, id: string) => [{ type: 'Conversation', id }],
    }),

    getConversationMessages: builder.query<Message[], ConversationMessagesArgs>({
      query: ({ conversationId }: ConversationMessagesArgs) => `/conversations/${conversationId}/messages`,
      providesTags: (_result, _error, { conversationId }: ConversationMessagesArgs) => [
        { type: 'Message', id: conversationId },
        { type: 'Conversation', id: conversationId },
      ],
    }),

    sendConversationMessage: builder.mutation<Message, SendConversationMessagePayload>({
      query: ({ conversationId, content }: SendConversationMessagePayload) => ({
        url: `/conversations/${conversationId}/messages`,
        method: 'POST',
        body: { content },
      }),
      invalidatesTags: (_result, _error, { conversationId }: SendConversationMessagePayload) => [
        { type: 'Message', id: conversationId },
        { type: 'Conversation', id: conversationId },
      ],
    }),

    createConversation: builder.mutation<Conversation, CreateConversationPayload>({
      query: (payload: CreateConversationPayload) => ({
        url: '/conversations',
        method: 'POST',
        body: payload,
      }),
      invalidatesTags: ['Conversation'],
    }),

    markConversationAsRead: builder.mutation<{ message: string }, string>({
      query: (conversationId: string) => ({
        url: `/conversations/${conversationId}/read`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id: string) => [{ type: 'Conversation', id }],
    }),

    addParticipants: builder.mutation<
      Conversation,
      { conversationId: string; userIds: string[] }
    >({
      query: ({ conversationId, userIds }: { conversationId: string; userIds: string[] }) => ({
        url: `/conversations/${conversationId}/participants`,
        method: 'POST',
        body: { userIds },
      }),
      invalidatesTags: (_result, _error, { conversationId }: { conversationId: string }) => [
        { type: 'Conversation', id: conversationId },
      ],
    }),

    removeParticipant: builder.mutation<
      { message: string },
      { conversationId: string; userId: string }
    >({
      query: ({ conversationId, userId }: { conversationId: string; userId: string }) => ({
        url: `/conversations/${conversationId}/participants/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { conversationId }: { conversationId: string }) => [
        { type: 'Conversation', id: conversationId },
      ],
    }),

    getBookingMessages: builder.query<Message[], string>({
      query: (bookingId: string) => `/chat/booking/${bookingId}/messages`,
      providesTags: (_result, _error, bookingId: string) => [{ type: 'Message', id: bookingId }],
    }),

    markMessageAsRead: builder.mutation<{ message: string }, string>({
      query: (messageId: string) => ({
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
