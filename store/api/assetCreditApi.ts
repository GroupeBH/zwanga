import { baseApi } from "./baseApi";
import type { BaseEndpointBuilder } from "./types";

export interface AssetCredit {
  id: string;
  assetKind: "phone" | "vehicle" | "equipment";
  label: string;
  principalMinor: string;
  paidMinor: string;
  dueMinor: string;
  status:
    "offered" | "accepted" | "active" | "settled" | "declined" | "cancelled";
  terms: string;
  policyVersion: string;
  entries?: {
    id: string;
    kind: string;
    amountMinor: string;
    dueDeltaMinor: string;
    createdAt: string;
  }[];
  policyText?: string;
}
export const assetCreditApi = baseApi.injectEndpoints({
  endpoints: (b: BaseEndpointBuilder) => ({
    getAssetCredits: b.query<
      { items: AssetCredit[]; policyText: string },
      void
    >({
      query: () => "/asset-credits/mine",
      providesTags: ["ProServices"],
    }),
    getAssetCredit: b.query<AssetCredit, string>({
      query: (id) => `/asset-credits/mine/${encodeURIComponent(id)}`,
      providesTags: ["ProServices"],
    }),
    getAssetCreditRequests: b.query<
      { items: { id: string; status: string }[] },
      void
    >({
      query: () => "/asset-credits/requests",
      providesTags: ["ProServices"],
    }),
    requestAssetCredit: b.mutation<{ id: string }, void>({
      query: () => ({
        url: "/asset-credits/requests",
        method: "POST",
        body: { assetKind: "phone", notes: "" },
      }),
      invalidatesTags: ["ProServices"],
    }),
    decideAssetCredit: b.mutation<
      { id: string },
      { id: string; accept: boolean; policyVersion: string }
    >({
      query: ({ id, accept, policyVersion }) => ({
        url: `/asset-credits/mine/${encodeURIComponent(id)}/${accept ? "accept" : "decline"}`,
        method: "POST",
        body: accept ? { consent: true, policyVersion } : undefined,
      }),
      invalidatesTags: ["ProServices"],
    }),
    repayAssetCredit: b.mutation<
      { id: string; replayed: boolean },
      { id: string; mutationId: string; amountMinor: number }
    >({
      query: ({ id, ...body }) => ({
        url: `/asset-credits/mine/${encodeURIComponent(id)}/repay`,
        method: "POST",
        body,
        timeout: 15000,
      }),
      invalidatesTags: ["ProServices", "Wallet"],
    }),
  }),
});
export const {
  useGetAssetCreditsQuery,
  useGetAssetCreditQuery,
  useGetAssetCreditRequestsQuery,
  useRequestAssetCreditMutation,
  useDecideAssetCreditMutation,
  useRepayAssetCreditMutation,
} = assetCreditApi;
