import type {
  PremiumOverview,
  SubscribeToProPayload,
  Subscription,
  SubscriptionPaymentResponse,
  SubscriptionPlanSummary,
} from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

const SUBSCRIPTION_PAYMENT_START_TIMEOUT_MS = 20_000;
const SUBSCRIPTION_PAYMENT_STATUS_TIMEOUT_MS = 10_000;

export const subscriptionApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    getSubscriptionPlans: builder.query<SubscriptionPlanSummary[], void>({
      query: () => '/subscriptions/plans',
      providesTags: ['SubscriptionPlans'],
    }),

    getPremiumOverview: builder.query<PremiumOverview, void>({
      query: () => '/subscriptions/premium-overview',
      providesTags: ['Subscription'],
    }),

    startPremiumTrial: builder.mutation<Subscription, void>({
      query: () => ({
        url: '/subscriptions/trial',
        method: 'POST',
      }),
      invalidatesTags: ['Subscription', 'User', 'Trip', 'MyTrips'],
    }),

    subscribeToPro: builder.mutation<SubscriptionPaymentResponse, SubscribeToProPayload>({
      query: (payload: SubscribeToProPayload) => ({
        url: '/subscriptions/subscribe',
        method: 'POST',
        body: { plan: 'pro', ...payload },
        timeout: SUBSCRIPTION_PAYMENT_START_TIMEOUT_MS,
      }),
      invalidatesTags: ['Subscription', 'User', 'Trip', 'MyTrips', 'PaymentHistory'],
    }),

    checkSubscriptionPaymentStatus: builder.query<SubscriptionPaymentResponse, string>({
      query: (orderNumber: string) => ({
        url: `/subscriptions/payments/${encodeURIComponent(orderNumber)}/status`,
        timeout: SUBSCRIPTION_PAYMENT_STATUS_TIMEOUT_MS,
      }),
      providesTags: ['Subscription'],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetSubscriptionPlansQuery,
  useGetPremiumOverviewQuery,
  useStartPremiumTrialMutation,
  useSubscribeToProMutation,
  useLazyCheckSubscriptionPaymentStatusQuery,
} = subscriptionApi;
