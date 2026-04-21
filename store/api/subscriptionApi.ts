import type {
  PremiumOverview,
  SubscribeToProPayload,
  Subscription,
  SubscriptionPaymentResponse,
  SubscriptionPlanSummary,
} from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

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
      }),
      invalidatesTags: ['Subscription', 'User', 'Trip', 'MyTrips'],
    }),

    checkSubscriptionPaymentStatus: builder.query<SubscriptionPaymentResponse, string>({
      query: (orderNumber: string) => `/subscriptions/payments/${encodeURIComponent(orderNumber)}/status`,
      providesTags: ['Subscription'],
    }),
  }),
});

export const {
  useGetSubscriptionPlansQuery,
  useGetPremiumOverviewQuery,
  useStartPremiumTrialMutation,
  useSubscribeToProMutation,
  useLazyCheckSubscriptionPaymentStatusQuery,
} = subscriptionApi;
