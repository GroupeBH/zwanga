import type {
  SubscriptionPaymentMethod,
  WalletLedgerEntry,
  WalletPaymentResponse,
  WalletSummary,
} from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

type InitiateWalletTopUpPayload = {
  amount: number;
  method: SubscriptionPaymentMethod;
  phone?: string;
  approveUrl?: string;
  cancelUrl?: string;
  declineUrl?: string;
};

const walletTag = { type: 'Wallet' as const, id: 'ME' };

export const walletApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    getMyWallet: builder.query<WalletSummary, void>({
      query: () => '/wallet/me',
      providesTags: [walletTag],
    }),
    getWalletLedger: builder.query<WalletLedgerEntry[], void>({
      query: () => '/wallet/ledger',
      providesTags: [walletTag],
    }),
    initiateWalletTopUp: builder.mutation<WalletPaymentResponse, InitiateWalletTopUpPayload>({
      query: (body) => ({
        url: '/wallet/topups',
        method: 'POST',
        body,
      }),
      invalidatesTags: [walletTag],
    }),
    checkWalletTopUpStatus: builder.query<WalletPaymentResponse, string>({
      query: (orderNumber) => `/wallet/topups/${encodeURIComponent(orderNumber)}/status`,
      providesTags: [walletTag],
    }),
  }),
});

export const {
  useGetMyWalletQuery,
  useGetWalletLedgerQuery,
  useInitiateWalletTopUpMutation,
  useLazyCheckWalletTopUpStatusQuery,
} = walletApi;