import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL } from '../../config/env';
import { DEFAULT_API_TIMEOUT_MS } from '../../constants/network';
import { refreshAccessToken } from '../../services/tokenRefresh';
import { getTokens } from '../../services/tokenStorage';
import { getTokenSessionVersion } from '../../services/tokenSession';
import { isTokenExpired } from '../../utils/jwt';

const fetchQuery = fetchBaseQuery({ baseUrl: API_BASE_URL, timeout: DEFAULT_API_TIMEOUT_MS });
const unavailable = (message: string): { error: FetchBaseQueryError } =>
  ({ error: { status: 'FETCH_ERROR', error: message } });

/** A request belongs to its initial session, including refresh waits and retries. */
export const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> =
  async (args, api, extraOptions) => {
    const version = getTokenSessionVersion();
    const isCurrent = () => version === getTokenSessionVersion() && !api.signal.aborted;
    const stale = () => unavailable('La session a changé. Veuillez réessayer.');
    const offline = () => unavailable('Connexion indisponible pour renouveler la session. Réessayez lorsque le réseau revient.');
    let tokens = await getTokens();
    if (!isCurrent()) return stale();
    if (tokens.accessToken && isTokenExpired(tokens.accessToken)) {
      if (tokens.refreshToken) await refreshAccessToken(tokens.refreshToken);
      tokens = await getTokens();
      if (!isCurrent()) return stale();
      if (!tokens.accessToken || isTokenExpired(tokens.accessToken)) return offline();
    }
    const execute = (accessToken: string | null) => {
      const request = typeof args === 'string' ? { url: args } : args;
      const headers = new Headers(request.headers as HeadersInit | undefined);
      if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
      return fetchQuery({ ...request, headers }, api, extraOptions);
    };
    let result = await execute(tokens.accessToken);
    if (!isCurrent()) return stale();
    if (result.error?.status !== 401 || !tokens.refreshToken) return result;

    const latest = await getTokens();
    if (!isCurrent()) return stale();
    const renewed = latest.accessToken !== tokens.accessToken && latest.accessToken &&
      !isTokenExpired(latest.accessToken) ? latest.accessToken :
      await refreshAccessToken(latest.refreshToken ?? tokens.refreshToken);
    if (!isCurrent()) return stale();
    if (renewed && !isTokenExpired(renewed)) {
      result = await execute(renewed);
      return isCurrent() ? result : stale();
    }
    // Preserve cached/offline ride context on transient renewal failure, not a false 401.
    return offline();
  };

/**
 * API de base avec configuration commune
 * Tous les modules API étendent cette configuration
 */
export const baseApi = createApi({
  reducerPath: 'zwangaApi',
  baseQuery: baseQueryWithReauth,
  keepUnusedDataFor: 180,
  tagTypes: [
    'AccountActivity',
    'User',
    'Trip',
    'MyTrips',
    'RecurringTrip',
    'Booking',
    'Message',
    'Conversation',
    'Review',
    'Notification',
    'Vehicle',
    'TripRequest',
    'MyTripRequests',
    'DriverOffer',
    'MyDriverOffers',
    'EmergencyContact',
    'SafetyAlert',
    'UserReport',
    'KycStatus',
    'FavoriteLocations',
    'TripSafetyParticipant',
    'TripSafetyHistory',
    'TripSafetyTrip',
    'SupportFaq',
    'SupportTicket',
    'Subscription',
    'SubscriptionPlans',
    'DocumentFundingRequest',
    'ProServices',
    'Wallet',
    'DriverSettlement',
    'TripShareLink',
    'PaymentHistory',
    'Referral',
  ],
  endpoints: () => ({}),
});
