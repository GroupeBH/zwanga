import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL } from '../config/env';
import { getStoreDispatch } from '../store/storeAccessor';
import { isTokenExpired, isTokenExpiringSoon } from '../utils/jwt';
import { clearTokens, getTokens, storeTokens } from './tokenStorage';

/**
 * Token refresh service.
 *
 * Rules:
 * - network errors do not force logout;
 * - auth errors on refresh (400/401/403) force a local logout;
 * - app startup always attempts a refresh when a refresh token exists.
 */

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;
let isForceLoggingOut = false;

const AUTH_REFRESH_ERROR_STATUSES = new Set([400, 401, 403]);

const getNormalizedBaseUrl = () => {
  if (!API_BASE_URL) return '';
  return API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
};

const refreshBaseQuery = fetchBaseQuery({
  baseUrl: getNormalizedBaseUrl(),
});

async function forceLocalLogout(reason: string): Promise<void> {
  if (isForceLoggingOut) {
    return;
  }

  isForceLoggingOut = true;
  try {
    console.warn(`[tokenRefresh] Local logout forced: ${reason}`);
    await clearTokens();
    try {
      getStoreDispatch()({ type: 'auth/logout' });
    } catch (dispatchError) {
      console.warn('[tokenRefresh] Store dispatch unavailable during local logout', dispatchError);
    }
  } catch (error) {
    console.error('[tokenRefresh] Failed to force local logout:', error);
  } finally {
    isForceLoggingOut = false;
  }
}

/**
 * Startup auth validation.
 *
 * Behavior:
 * - requires access+refresh tokens;
 * - requires non-expired refresh token;
 * - always tries refresh on app start;
 * - if refresh fails, keeps session only when local access token is still valid.
 */
export async function validateAndRefreshTokens(): Promise<boolean> {
  try {
    const { accessToken, refreshToken } = await getTokens();

    if (!accessToken || !refreshToken) {
      console.log('[validateAndRefreshTokens] No tokens found');
      return false;
    }

    if (isTokenExpired(refreshToken)) {
      console.log('[validateAndRefreshTokens] Refresh token expired');
      await forceLocalLogout('refresh token expired at startup');
      return false;
    }

    console.log('[validateAndRefreshTokens] Startup refresh attempt...');
    const refreshedAccessToken = await refreshAccessToken(refreshToken);
    if (refreshedAccessToken) {
      console.log('[validateAndRefreshTokens] Startup refresh succeeded');
      return true;
    }

    const latestTokens = await getTokens();
    if (
      latestTokens.accessToken &&
      latestTokens.refreshToken &&
      !isTokenExpired(latestTokens.accessToken)
    ) {
      console.warn(
        '[validateAndRefreshTokens] Refresh unavailable, local access token still valid'
      );
      return true;
    }

    await forceLocalLogout('no valid tokens after startup refresh failure');
    return false;
  } catch (error) {
    console.error('[validateAndRefreshTokens] Error:', error);
    return false;
  }
}

/**
 * Refreshes access token with refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    console.log('[refreshAccessToken] Refresh already in progress, waiting...');
    return refreshPromise;
  }

  isRefreshing = true;

  if (!API_BASE_URL) {
    console.error('[refreshAccessToken] API_BASE_URL is undefined');
    isRefreshing = false;
    return Promise.resolve(null);
  }

  refreshPromise = (async () => {
    let result: any = null;
    try {
      result = await refreshBaseQuery(
        {
          url: '/auth/refresh',
          method: 'POST',
          body: { refreshToken },
        },
        // @ts-ignore isolated call: no api object required
        { signal: new AbortController().signal },
        {}
      );

      if (result.error) {
        const errorStatus = result.error.status;
        const errorData = result.error.data;

        if (errorStatus === 'FETCH_ERROR' || errorStatus === 'TIMEOUT_ERROR') {
          throw {
            name: 'TypeError',
            message: 'Network request failed',
            isNetworkError: true,
            originalError: result.error,
          };
        }

        throw {
          name: 'HTTPError',
          message: `HTTP ${String(errorStatus)}: ${JSON.stringify(errorData)}`,
          status: errorStatus,
          data: errorData,
          isNetworkError: false,
        };
      }

      const data = result.data as { accessToken: string; refreshToken: string };
      if (!data?.accessToken || !data?.refreshToken) {
        throw new Error('Missing tokens in refresh response');
      }

      await storeTokens(data.accessToken, data.refreshToken);
      try {
        getStoreDispatch()({
          type: 'auth/setTokens',
          payload: {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          },
        });
      } catch (dispatchError) {
        console.warn(
          '[refreshAccessToken] Store not initialized, tokens saved in SecureStore only',
          dispatchError
        );
      }

      console.log('[refreshAccessToken] Tokens refreshed and stored');
      return data.accessToken;
    } catch (error: any) {
      const status = error?.status;
      const isNetworkError =
        error?.isNetworkError === true ||
        error?.name === 'TypeError' ||
        error?.name === 'AbortError' ||
        error?.message?.toLowerCase().includes('network') ||
        error?.message?.toLowerCase().includes('fetch') ||
        error?.message?.toLowerCase().includes('failed to fetch') ||
        error?.message?.toLowerCase().includes('network request failed') ||
        (result?.error &&
          'status' in result.error &&
          (result.error.status === 'FETCH_ERROR' ||
            result.error.status === 'TIMEOUT_ERROR'));

      if (isNetworkError) {
        console.warn('[refreshAccessToken] Network error, keep session');
        return null;
      }

      const isAuthRefreshError =
        typeof status === 'number' && AUTH_REFRESH_ERROR_STATUSES.has(status);

      if (isAuthRefreshError) {
        await forceLocalLogout(
          `refresh token rejected by backend (HTTP ${status})`
        );
        return null;
      }

      console.warn(
        `[refreshAccessToken] Non-auth backend error (status=${String(
          status
        )}), keep session`
      );
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Returns current access token.
 * Does not refresh automatically.
 */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    const { accessToken } = await getTokens();
    return accessToken || null;
  } catch (error) {
    console.error('[getValidAccessToken] Error:', error);
    return null;
  }
}

/**
 * Proactive refresh on app start / app foreground.
 */
export async function proactiveTokenRefresh(): Promise<boolean> {
  try {
    const { accessToken, refreshToken } = await getTokens();

    if (!accessToken || !refreshToken) {
      console.log('[proactiveTokenRefresh] No tokens');
      return false;
    }

    if (isTokenExpired(refreshToken)) {
      console.log('[proactiveTokenRefresh] Refresh token expired');
      await forceLocalLogout('refresh token expired');
      return false;
    }

    const HOURS_24_IN_MINUTES = 24 * 60;
    if (
      isTokenExpired(accessToken) ||
      isTokenExpiringSoon(accessToken, HOURS_24_IN_MINUTES)
    ) {
      console.log(
        '[proactiveTokenRefresh] Access token expired/expiring soon, refreshing...'
      );
      const newAccessToken = await refreshAccessToken(refreshToken);
      if (newAccessToken) {
        return true;
      }

      const latestTokens = await getTokens();
      const hasValidLocalSession =
        !!latestTokens.accessToken &&
        !!latestTokens.refreshToken &&
        !isTokenExpired(latestTokens.accessToken) &&
        !isTokenExpired(latestTokens.refreshToken);

      if (!hasValidLocalSession) {
        await forceLocalLogout('session invalid after proactive refresh failure');
        return false;
      }

      console.warn(
        '[proactiveTokenRefresh] Refresh unavailable, local session still valid'
      );
      return true;
    }

    console.log('[proactiveTokenRefresh] Access token valid, no refresh needed');
    return true;
  } catch (error) {
    console.error('[proactiveTokenRefresh] Error:', error);
    return false;
  }
}

/**
 * Handles 401 by attempting a refresh.
 */
export async function handle401Error(): Promise<boolean> {
  console.log('[handle401Error] 401 detected');
  const { accessToken, refreshToken } = await getTokens();

  if (!accessToken && !refreshToken) {
    console.log('[handle401Error] Missing tokens');
    return false;
  }

  if (!accessToken || !isTokenExpired(accessToken)) {
    console.log('[handle401Error] Access token not expired, skip refresh');
    return false;
  }

  if (!refreshToken || isTokenExpired(refreshToken)) {
    console.log('[handle401Error] Refresh token missing/expired');
    await forceLocalLogout('refresh token missing or expired during 401 handling');
    return false;
  }

  const newAccessToken = await refreshAccessToken(refreshToken);
  if (newAccessToken) {
    console.log('[handle401Error] Refresh succeeded after 401');
    return true;
  }

  const latestTokens = await getTokens();
  if (
    !latestTokens.accessToken ||
    !latestTokens.refreshToken ||
    isTokenExpired(latestTokens.accessToken)
  ) {
    await forceLocalLogout('no valid tokens after 401 and refresh failure');
  }

  console.log('[handle401Error] Refresh failed after 401');
  return false;
}
