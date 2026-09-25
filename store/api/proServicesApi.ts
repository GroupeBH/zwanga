import { baseApi } from "./baseApi";
import type { BaseEndpointBuilder } from "./types";
import type {
  ProApplication,
  ProCase,
  ProCaseRow,
  ProOffering,
  ServiceCode,
} from "@/types/proServices";

export const proServicesApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    getProOfferings: builder.query<ProOffering[], void>({
      query: () => "/pro-services/catalogue",
      providesTags: ["ProServices"],
    }),
    getMyProCases: builder.query<
      { items: ProCaseRow[]; nextCursor: string | null },
      string | void
    >({
      query: (cursor) => ({
        url: "/pro-services/mine",
        params: cursor ? { cursor } : undefined,
      }),
      providesTags: ["ProServices"],
    }),
    getProCase: builder.query<ProCase, string>({
      query: (id) => `/pro-services/mine/${encodeURIComponent(id)}`,
      providesTags: ["ProServices"],
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
      invalidatesTags: ["ProServices"],
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
      invalidatesTags: ["ProServices"],
    }),
    cancelProCase: builder.mutation<{ id: string }, string>({
      query: (id) => ({
        url: `/pro-services/mine/${encodeURIComponent(id)}/cancel`,
        method: "POST",
        timeout: 15000,
      }),
      invalidatesTags: ["ProServices"],
    }),
  }),
});
export const {
  useGetProOfferingsQuery,
  useGetMyProCasesQuery,
  useGetProCaseQuery,
  useCreateProCaseMutation,
  useAcceptProQuoteMutation,
  useCancelProCaseMutation,
} = proServicesApi;
