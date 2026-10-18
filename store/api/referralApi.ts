import type {
  ReferralLedgerEntry,
  ReferralReward,
  ReferralSummary,
  ReferralWithdrawal,
  ReferredUserSummary,
} from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

const referralTag = { type: 'Referral' as const, id: 'ME' };
type Page<T> = { data: T[]; nextCursor: string | null };
type PageArgs = { before?: string; limit?: number };

interface AttachReferralAttributionPayload {
  referralToken: string;
  referralProvider: 'chottulink';
  referralReferringLink?: string;
  referralCapturedAt: string;
}

interface AttachReferralAttributionResult {
  attached: true;
  newlyAttached: boolean;
  referredAt: string;
  referrer: { firstName: string };
}

export const referralApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    getMyReferralPage: builder.query<Page<ReferredUserSummary>, PageArgs>({
      query: params => ({ url: '/referrals/me/referrals/page', params }),
      keepUnusedDataFor: 15, providesTags: [referralTag],
    }),
    getMyReferralRewardPage: builder.query<Page<ReferralReward>, PageArgs>({
      query: params => ({ url: '/referrals/me/rewards/page', params }),
      keepUnusedDataFor: 15, providesTags: [referralTag],
    }),
    getMyReferralWithdrawalPage: builder.query<Page<ReferralWithdrawal>, PageArgs>({
      query: params => ({ url: '/referrals/me/withdrawals/page', params }),
      keepUnusedDataFor: 15, providesTags: [referralTag],
    }),
    validateReferralCode: builder.mutation<
      { valid: boolean; code: string; referrer: { firstName: string } },
      string
    >({
      query: (code) => ({
        url: '/referrals/validate-code',
        method: 'POST',
        body: { code },
      }),
    }),
    resolveReferralAttribution: builder.mutation<
      { valid: boolean; referrer: { firstName: string } },
      string
    >({
      query: (referralToken) => ({
        url: '/referrals/resolve-attribution',
        method: 'POST',
        body: { referralToken },
      }),
    }),
    attachMyReferralAttribution: builder.mutation<
      AttachReferralAttributionResult,
      AttachReferralAttributionPayload
    >({
      query: (body) => ({
        url: '/referrals/me/attribution',
        method: 'POST',
        body,
      }),
      invalidatesTags: [referralTag],
    }),
    getMyReferralSummary: builder.query<ReferralSummary, void>({
      query: () => '/referrals/me',
      providesTags: [referralTag],
    }),
    getMyReferrals: builder.query<ReferredUserSummary[], void>({
      query: () => '/referrals/me/referrals',
      providesTags: [referralTag],
    }),
    getMyReferralRewards: builder.query<ReferralReward[], void>({
      query: () => '/referrals/me/rewards',
      providesTags: [referralTag],
    }),
    getMyReferralLedger: builder.query<ReferralLedgerEntry[], void>({
      query: () => '/referrals/me/ledger',
      providesTags: [referralTag],
    }),
    getMyReferralWithdrawals: builder.query<ReferralWithdrawal[], void>({
      query: () => '/referrals/me/withdrawals',
      providesTags: [referralTag],
    }),
    requestReferralWithdrawal: builder.mutation<
      ReferralWithdrawal,
      { tokens: number; phone?: string }
    >({
      query: (body) => ({
        url: '/referrals/me/withdrawals',
        method: 'POST',
        body,
      }),
      invalidatesTags: [referralTag],
    }),
    checkReferralWithdrawalStatus: builder.query<ReferralWithdrawal, string>({
      query: (orderNumber) =>
        `/referrals/withdrawals/${encodeURIComponent(orderNumber)}/status`,
      providesTags: [referralTag],
    }),
  }),
});

export const {
  useGetMyReferralPageQuery,
  useGetMyReferralRewardPageQuery,
  useGetMyReferralWithdrawalPageQuery,
  useValidateReferralCodeMutation,
  useResolveReferralAttributionMutation,
  useAttachMyReferralAttributionMutation,
  useGetMyReferralSummaryQuery,
  useGetMyReferralsQuery,
  useGetMyReferralRewardsQuery,
  useGetMyReferralLedgerQuery,
  useGetMyReferralWithdrawalsQuery,
  useRequestReferralWithdrawalMutation,
  useLazyCheckReferralWithdrawalStatusQuery,
} = referralApi;
