import type {
  PremiumOverview,
  Subscription,
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

    subscribeToPro: builder.mutation<Subscription, void>({
      query: () => ({
        url: '/subscriptions/subscribe',
        method: 'POST',
        body: { plan: 'pro' },
      }),
      invalidatesTags: ['Subscription', 'User', 'Trip', 'MyTrips'],
    }),
  }),
});

export const {
  useGetSubscriptionPlansQuery,
  useGetPremiumOverviewQuery,
  useStartPremiumTrialMutation,
  useSubscribeToProMutation,
} = subscriptionApi;
