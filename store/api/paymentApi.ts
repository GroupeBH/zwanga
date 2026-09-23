import type { PaymentHistoryItem } from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';
import { readHistoryPage, type HistoryPage, type HistoryArgs } from './financeHistoryPage';
import { readPaymentContext, type BookingPaymentContext } from './paymentContext';

export type PaymentHistorySummary = { total: number; succeededByCurrency: { currency: string; amount: number }[] };
export type PaymentHistoryFilter = 'all' | 'pending' | 'failed' | 'succeeded';

const paymentHistoryTag = { type: 'PaymentHistory' as const, id: 'ME' };

export const paymentApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    getBookingPaymentHistory: builder.query<PaymentHistoryItem[], BookingPaymentContext>({
      queryFn: (args, _api, _options, baseQuery) => readPaymentContext(baseQuery, { ...args, kind: 'booking' }),
      keepUnusedDataFor: 30,
      providesTags: [paymentHistoryTag],
    }),
    getPendingSubscriptionPayments: builder.query<PaymentHistoryItem[], void>({
      queryFn: (_args, _api, _options, baseQuery) => readPaymentContext(baseQuery, { kind: 'subscription' }),
      keepUnusedDataFor: 30,
      providesTags: [paymentHistoryTag],
    }),
    getPaymentHistoryPage: builder.query<HistoryPage<PaymentHistoryItem>, HistoryArgs & { filter: PaymentHistoryFilter }>({
      keepUnusedDataFor: 15,
      queryFn: (args, _api, _options, baseQuery) => readHistoryPage<PaymentHistoryItem>(
        baseQuery, '/payments/history/page', '/payments/history', args, { filter: args.filter,
          matches: item => args.filter === 'all' || (args.filter === 'pending'
            ? ['pending', 'initiated'].includes(item.status) : args.filter === 'failed'
              ? ['failed', 'cancelled'].includes(item.status) : item.status === args.filter) }),
      providesTags: [paymentHistoryTag],
    }),
    getPaymentHistorySummary: builder.query<PaymentHistorySummary, void>({
      async queryFn(_arg, _api, _options, baseQuery) {
        const result = await baseQuery('/payments/history/summary');
        if (!result.error) return { data: result.data as PaymentHistorySummary };
        if (![404, 405].includes(Number(result.error.status))) return { error: result.error };
        const legacy = await baseQuery('/payments/history');
        if (legacy.error) return { error: legacy.error };
        const payments = legacy.data as PaymentHistoryItem[];
        const totals = new Map<string, number>();
        for (const item of payments) if (item.status === 'succeeded') {
          totals.set(item.currency, (totals.get(item.currency) ?? 0) + Number(item.amount));
        }
        return { data: { total: payments.length, succeededByCurrency:
          [...totals].map(([currency, amount]) => ({ currency, amount })) } };
      },
      providesTags: [paymentHistoryTag],
    }),
    getPaymentHistory: builder.query<PaymentHistoryItem[], void>({
      query: () => '/payments/history',
      providesTags: [paymentHistoryTag],
    }),
    getPaymentDetails: builder.query<PaymentHistoryItem, string>({
      query: (paymentId) => `/payments/${encodeURIComponent(paymentId)}/details`,
      providesTags: (_result, _error, paymentId) => [
        paymentHistoryTag,
        { type: 'PaymentHistory' as const, id: paymentId },
      ],
    }),
  }),
});

export const {
  useGetBookingPaymentHistoryQuery,
  useGetPendingSubscriptionPaymentsQuery,
  useGetPaymentHistoryPageQuery,
  useGetPaymentHistorySummaryQuery,
  useGetPaymentHistoryQuery,
  useLazyGetPaymentDetailsQuery,
} = paymentApi;
