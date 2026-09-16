import type { PaymentHistoryItem } from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

const paymentHistoryTag = { type: 'PaymentHistory' as const, id: 'ME' };

export const paymentApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
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
  useGetPaymentHistoryQuery,
  useLazyGetPaymentDetailsQuery,
} = paymentApi;
