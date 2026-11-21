import { baseApi } from "./baseApi";
import type { BaseEndpointBuilder } from "./types";

export type AssetKind = 'phone' | 'helmet' | 'gps_tracker' | 'delivery_equipment' | 'equipment' | 'vehicle';
export interface AssetProduct {
  kind: AssetKind; label: string; enabled: boolean; comingSoon?: boolean;
  eligibility?: { eligible: boolean; requiredMonths?: number; maximumGapHours?: number; rule?: string };
}
export interface AssetCreditRequest { id: string; assetKind: AssetKind; notes: string; status: string }

export interface AssetCredit {
  id: string;
  assetKind: AssetKind;
  label: string;
  principalMinor: string;
  cashPriceMinor?: string | null;
  creditFeeMinor?: string | null;
  costDisclosureVersion?: string | null;
  installmentCount?: number | null;
  installmentPeriod?: 'week' | 'month' | null;
  repaymentPlans?: { id: string; months: number }[];
  selectedPlanId?: string | null;
  repaymentPlanPreviews?: { id: string; months: number; minimumDueMinor: number; installments: NonNullable<AssetCredit['installments']> }[];
  minimumDueMinor?: number;
  nextInstallment?: { ordinal: number; dueAt: string | null; amountMinor: number; remainingMinor: number } | null;
  installments?: { ordinal: number; dueAt: string | null; amountMinor: number; remainingMinor: number }[];
  paidMinor: string;
  dueMinor: string;
  status:
    "offered" | "accepted" | "active" | "settled" | "declined" | "cancelled";
  terms: string;
  policyVersion: string;
  repaymentBps?: number;
  commissionBps?: number;
  totalRepaymentBps?: number;
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
    getAssetCreditProducts: b.query<{ items: AssetProduct[]; canRequest: boolean; policyText: string }, void>({
      query: () => '/asset-credits/products',
      providesTags: ['ProServices'],
    }),
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
      { items: AssetCreditRequest[] },
      void
    >({
      query: () => "/asset-credits/requests",
      providesTags: ["ProServices"],
    }),
    requestAssetCredit: b.mutation<{ id: string }, { assetKind: AssetKind; notes: string }>({
      query: (body) => ({
        url: "/asset-credits/requests",
        method: "POST",
        body,
      }),
      invalidatesTags: ["ProServices"],
    }),
    updateCreditRequestComment: b.mutation<{ id: string; notes: string }, { id: string; notes: string }>({
      query: ({ id, notes }) => ({ url: `/asset-credits/requests/${encodeURIComponent(id)}/comment`, method: 'PATCH', body: { notes } }),
      invalidatesTags: ['ProServices'],
    }),
    decideAssetCredit: b.mutation<
      { id: string },
      { id: string; accept: boolean; policyVersion: string; expectedTotalRepaymentBps?: number; costDisclosureVersion?: string; selectedPlanId?: string }
    >({
      query: ({ id, accept, policyVersion, expectedTotalRepaymentBps, costDisclosureVersion, selectedPlanId }) => ({
        url: `/asset-credits/mine/${encodeURIComponent(id)}/${accept ? "accept" : "decline"}`,
        method: "POST",
        body: accept ? { consent: true, policyVersion,
          ...(selectedPlanId ? { selectedPlanId } : {}),
          ...(costDisclosureVersion ? { costDisclosureVersion } : {}),
          ...(policyVersion === 'asset-credit-v2' ? { expectedTotalRepaymentBps } : {}),
        } : undefined,
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
  useGetAssetCreditProductsQuery,
  useGetAssetCreditsQuery,
  useGetAssetCreditQuery,
  useGetAssetCreditRequestsQuery,
  useRequestAssetCreditMutation,
  useUpdateCreditRequestCommentMutation,
  useDecideAssetCreditMutation,
  useRepayAssetCreditMutation,
} = assetCreditApi;
