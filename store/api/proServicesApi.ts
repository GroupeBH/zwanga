import { baseApi } from "./baseApi";
import type { BaseEndpointBuilder } from "./types";
import type {
  ProApplication,
  ProCase,
  ProCaseRow,
  ProOffering,
  ServiceCode,
  CurrentDocumentCase,
} from "@/types/proServices";

export const proServicesApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    getProOfferings: builder.query<ProOffering[], void>({
      query: () => "/pro-services/catalogue",
      providesTags: [{ type: 'ProServices', id: 'DOCUMENTS' }],
    }),
    getMyProCases: builder.query<
      { items: ProCaseRow[]; nextCursor: string | null },
      string | void
    >({
      query: (cursor) => ({
        url: "/pro-services/mine",
        params: cursor ? { cursor } : undefined,
      }),
      providesTags: [{ type: 'ProServices', id: 'DOCUMENTS' }],
    }),
    getProCase: builder.query<ProCase, string>({
      query: (id) => `/pro-services/mine/${encodeURIComponent(id)}`,
      providesTags: [{ type: 'ProServices', id: 'DOCUMENTS' }],
    }),
    getCurrentDocumentCase: builder.query<CurrentDocumentCase, void>({
      query: () => "/pro-services/mine/current-documents",
      providesTags: [{ type: 'ProServices', id: 'DOCUMENTS' }],
    }),
    updateDocumentCase: builder.mutation<{ id: string }, {
      id: string; mutationId: string; expectedUpdatedAt: string;
      contactConsent: true; application: ProApplication;
    }>({
      query: ({ id, ...body }) => ({
        url: `/pro-services/mine/${encodeURIComponent(id)}`,
        method: "PATCH", body, timeout: 15000,
      }),
      invalidatesTags: [{ type: 'ProServices', id: 'DOCUMENTS' }],
    }),
    createProCase: builder.mutation<
      { id: string },
      {
        serviceCode: ServiceCode;
        submissionKey: string;
        contactConsent: true;
        application: ProApplication;
      }
    >({
      query: (body) => ({
        url: "/pro-services/applications",
        method: "POST",
        body,
        timeout: 15000,
      }),
      invalidatesTags: [{ type: 'ProServices', id: 'DOCUMENTS' }],
    }),
    acceptProQuote: builder.mutation<
      { id: string },
      { id: string; quoteVersion: number; consent: true }
    >({
      query: ({ id, ...body }) => ({
        url: `/pro-services/mine/${encodeURIComponent(id)}/accept`,
        method: "POST",
        body,
        timeout: 15000,
      }),
      invalidatesTags: [{ type: 'ProServices', id: 'DOCUMENTS' }],
    }),
    cancelProCase: builder.mutation<{ id: string }, string>({
      query: (id) => ({
        url: `/pro-services/mine/${encodeURIComponent(id)}/cancel`,
        method: "POST",
        timeout: 15000,
      }),
      invalidatesTags: [{ type: 'ProServices', id: 'DOCUMENTS' }],
    }),
  }),
});
export const {
  useGetProOfferingsQuery,
  useGetMyProCasesQuery,
  useGetProCaseQuery,
  useGetCurrentDocumentCaseQuery,
  useUpdateDocumentCaseMutation,
  useCreateProCaseMutation,
  useAcceptProQuoteMutation,
  useCancelProCaseMutation,
} = proServicesApi;
