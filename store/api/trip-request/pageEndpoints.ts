import type { BaseEndpointBuilder } from '../types';
import type { HistoryPage, HistoryArgs } from '../financeHistoryPage';
import type { TripRequest, DriverOfferWithTripRequest } from '@/types';
import type { ServerTripRequest, ServerDriverOfferWithTripRequest } from './serverTypes';
import { mapServerTripRequestToClient, mapServerDriverOfferWithTripRequestToClient } from './requestMapper';
import { tripRequestListTag, myTripRequestsListTag, myDriverOffersListTag } from './contracts';

export type RequestPageArgs = HistoryArgs & { search?: string };
export const buildRequestPageEndpoints = (builder: BaseEndpointBuilder) => ({
  getRequestDiscovery: builder.query<{ data: TripRequest[]; total: number; page: number; limit: number; hasMore: boolean }, { page: number; search?: string; minSeats?: number; sort: 'soon' | 'cheap' | 'nearby' }>({
    query: args => ({ url: '/trip-requests/discovery', params: { ...args, limit: 30 } }),
    transformResponse: (page: { data: ServerTripRequest[]; total: number; page: number; limit: number; hasMore: boolean }) => ({ ...page, data: page.data.map(mapServerTripRequestToClient) }),
    providesTags: [tripRequestListTag], keepUnusedDataFor: 15,
  }),
  getMyRequestStats: builder.query<{ totalRequests: number; activeRequests: number; requestsWithOffers: number; completedRequests: number; pendingOffersCount: number }, void>({
    query: () => '/trip-requests/my-stats',
    providesTags: [myTripRequestsListTag, myDriverOffersListTag], keepUnusedDataFor: 30,
  }),
  getAvailableRequestPage: builder.query<HistoryPage<TripRequest>, RequestPageArgs>({
    query: args => ({ url: '/trip-requests/pages/available', params: { ...args, limit: args.limit ?? 20 } }),
    transformResponse: (page: HistoryPage<ServerTripRequest>) => ({ ...page, data: page.data.map(mapServerTripRequestToClient) }),
    providesTags: [tripRequestListTag], keepUnusedDataFor: 30,
  }),
  getMyRequestPage: builder.query<HistoryPage<TripRequest>, RequestPageArgs>({
    query: args => ({ url: '/trip-requests/pages/my-requests', params: { ...args, limit: args.limit ?? 20 } }),
    transformResponse: (page: HistoryPage<ServerTripRequest>) => ({ ...page, data: page.data.map(mapServerTripRequestToClient) }),
    providesTags: [myTripRequestsListTag], keepUnusedDataFor: 30,
  }),
  getMyOfferPage: builder.query<HistoryPage<DriverOfferWithTripRequest>, HistoryArgs>({
    query: args => ({ url: '/trip-requests/pages/my-offers', params: { ...args, limit: args.limit ?? 20 } }),
    transformResponse: (page: HistoryPage<ServerDriverOfferWithTripRequest>) => ({ ...page, data: page.data.map(mapServerDriverOfferWithTripRequestToClient) }),
    providesTags: [myDriverOffersListTag], keepUnusedDataFor: 30,
  }),
});
