import type {
  SupportConfig,
  SupportFaqEntry,
  SupportFaqListResponse,
  SupportTicketCategory,
  SupportTicketDetails,
  SupportTicketListResponse,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

export interface ListSupportFaqParams {
  category?: string;
  search?: string;
  locale?: string;
  audience?: string;
  page?: number;
  limit?: number;
}

export interface ListSupportTicketsParams {
  page?: number;
  limit?: number;
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  category?: SupportTicketCategory;
  search?: string;
}

export interface CreateSupportTicketPayload {
  subject: string;
  message: string;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
}

export interface AddSupportTicketMessagePayload {
  id: string;
  content: string;
}

export const supportApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    getSupportConfig: builder.query<SupportConfig, void>({
      query: () => '/support/config',
    }),

    getSupportFaq: builder.query<SupportFaqListResponse, ListSupportFaqParams | void>({
      query: (params) => ({
        url: '/support/faq',
        params,
      }),
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'SupportFaq' as const, id })),
              'SupportFaq',
            ]
          : ['SupportFaq'],
    }),

    getSupportFaqEntry: builder.query<SupportFaqEntry, string>({
      query: (id) => `/support/faq/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'SupportFaq', id }],
    }),

    getMySupportTickets: builder.query<SupportTicketListResponse, ListSupportTicketsParams | void>({
      query: (params) => ({
        url: '/support/tickets',
        params,
      }),
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'SupportTicket' as const, id })),
              'SupportTicket',
            ]
          : ['SupportTicket'],
    }),

    getSupportTicketById: builder.query<SupportTicketDetails, string>({
      query: (id) => `/support/tickets/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'SupportTicket', id }],
    }),

    createSupportTicket: builder.mutation<SupportTicketDetails, CreateSupportTicketPayload>({
      query: (body) => ({
        url: '/support/tickets',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SupportTicket'],
    }),

    addSupportTicketMessage: builder.mutation<SupportTicketDetails, AddSupportTicketMessagePayload>({
      query: ({ id, content }) => ({
        url: `/support/tickets/${id}/messages`,
        method: 'POST',
        body: { content },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'SupportTicket', id }, 'SupportTicket'],
    }),

    closeSupportTicket: builder.mutation<SupportTicketDetails, string>({
      query: (id) => ({
        url: `/support/tickets/${id}/close`,
        method: 'PATCH',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'SupportTicket', id }, 'SupportTicket'],
    }),

    reopenSupportTicket: builder.mutation<SupportTicketDetails, string>({
      query: (id) => ({
        url: `/support/tickets/${id}/reopen`,
        method: 'PATCH',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'SupportTicket', id }, 'SupportTicket'],
    }),
  }),
});

export const {
  useGetSupportConfigQuery,
  useGetSupportFaqQuery,
  useGetSupportFaqEntryQuery,
  useGetMySupportTicketsQuery,
  useGetSupportTicketByIdQuery,
  useCreateSupportTicketMutation,
  useAddSupportTicketMessageMutation,
  useCloseSupportTicketMutation,
  useReopenSupportTicketMutation,
} = supportApi;
