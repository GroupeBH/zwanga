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

export const referralApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
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
  useValidateReferralCodeMutation,
  useGetMyReferralSummaryQuery,
  useGetMyReferralsQuery,
  useGetMyReferralRewardsQuery,
  useGetMyReferralLedgerQuery,
  useGetMyReferralWithdrawalsQuery,
  useRequestReferralWithdrawalMutation,
  useLazyCheckReferralWithdrawalStatusQuery,
} = referralApi;
