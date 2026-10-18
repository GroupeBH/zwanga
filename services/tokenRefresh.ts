import { authRefreshApi } from '../store/api/authRefreshApi';
import { getStoreDispatch } from '../store/storeAccessor';
import { isTokenExpired, isTokenExpiringSoon } from '../utils/jwt';
import { clearTokens, getTokens, storeTokens } from './tokenStorage';
import { getTokenSessionVersion } from './tokenSession';
import { hasUsableNewAuthSession } from '../features/auth/sessionPolicy';
import { getNetworkRecoveryEpoch } from './networkRecovery';

const AUTH_REFRESH_ERROR_STATUSES = new Set([400, 401, 403]);
const COOLDOWN_MS = 60_000;
let inFlight: { version: number; token: string; promise: Promise<string | null> } | null = null;
let lastAttempt: { version: number; token: string; at: number; recoveryEpoch: number; transient: boolean } | null = null;
let recoveryRetry: { version: number; at: number } | null = null;

async function forceLocalLogout(version: number): Promise<void> {
  if (version !== getTokenSessionVersion()) return;
  if (await clearTokens(version)) getStoreDispatch()({ type: 'auth/logout' });
}

/** Offline context is NOT permission to send an authenticated request. */
export async function hasRecoverableSession(): Promise<boolean> {
  const version = getTokenSessionVersion();
  const { accessToken, refreshToken } = await getTokens();
  return version === getTokenSessionVersion() && Boolean(accessToken && refreshToken && !isTokenExpired(refreshToken));
}

/** Single flight per session; stale replies can neither restore nor clear another account. */
export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const version = getTokenSessionVersion();
  const tokens = await getTokens();
  if (version !== getTokenSessionVersion() || tokens.refreshToken !== refreshToken) return null;
  if (isTokenExpired(refreshToken)) { await forceLocalLogout(version); return null; }
  if (inFlight?.version === version && inFlight.token === refreshToken) return inFlight.promise;
  if (lastAttempt?.version === version && lastAttempt.token === refreshToken &&
      Date.now() - lastAttempt.at < COOLDOWN_MS) {
    const recovered = lastAttempt.transient && getNetworkRecoveryEpoch() > lastAttempt.recoveryEpoch;
    // First genuine recovery is immediate; rapid network flapping cannot hammer auth.
    if (!recovered || (recoveryRetry?.version === version && Date.now() - recoveryRetry.at < 5_000)) return null;
    recoveryRetry = { version, at: Date.now() };
  }
  const attempt = { version, token: refreshToken, at: Date.now(), recoveryEpoch: getNetworkRecoveryEpoch(), transient: false };
  lastAttempt = attempt;
  const run = { version, token: refreshToken, promise: Promise.resolve<string | null>(null) };
  inFlight = run;
  run.promise = (async () => {
    try {
      const request = getStoreDispatch()(authRefreshApi.endpoints.refreshSession.initiate({ refreshToken }));
      let data: { accessToken: string; refreshToken: string };
      try { data = await request.unwrap(); } finally { request.reset(); }
      if (version !== getTokenSessionVersion()) return null;
      if (!hasUsableNewAuthSession(data?.accessToken, data?.refreshToken)) return null;
      const saved = await storeTokens(data.accessToken, data.refreshToken, version);
      if (!saved || version !== getTokenSessionVersion()) return null;
      getStoreDispatch()({ type: 'auth/setTokens', payload: data });
      lastAttempt = null;
      recoveryRetry = null;
      return data.accessToken;
    } catch (error: unknown) {
      const status = (error as { status?: unknown })?.status;
      attempt.transient = status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR' ||
        (typeof status === 'number' && status >= 500 && status < 600);
      if (typeof status === 'number' && AUTH_REFRESH_ERROR_STATUSES.has(status)) {
        await forceLocalLogout(version);
      }
      // A timeout, lost connection or server failure never revokes the local session.
      return null;
    } finally {
      if (inFlight === run) inFlight = null;
    }
  })();
  return run.promise;
}

/** Startup/foreground retain cached ride context during a transient refresh failure. */
export async function validateAndRefreshTokens(): Promise<boolean> {
  const version = getTokenSessionVersion();
  const { accessToken, refreshToken } = await getTokens();
  if (version !== getTokenSessionVersion()) return false;
  if (!accessToken || !refreshToken) return false;
  if (isTokenExpired(refreshToken)) { await forceLocalLogout(version); return false; }
  if (isTokenExpired(accessToken)) await refreshAccessToken(refreshToken);
  return version === getTokenSessionVersion() && hasRecoverableSession();
}

/** Never attach an expired access token. baseApi handles renewal before HTTP. */
export async function getValidAccessToken(): Promise<string | null> {
  const version = getTokenSessionVersion();
  const { accessToken } = await getTokens();
  return version === getTokenSessionVersion() && accessToken && !isTokenExpired(accessToken) ? accessToken : null;
}

export async function proactiveTokenRefresh(): Promise<boolean> {
  const version = getTokenSessionVersion();
  const { accessToken, refreshToken } = await getTokens();
  if (version !== getTokenSessionVersion()) return false;
  if (!accessToken || !refreshToken) return false;
  if (isTokenExpired(refreshToken)) { await forceLocalLogout(version); return false; }
  if (isTokenExpired(accessToken) || isTokenExpiringSoon(accessToken, 2)) {
    await refreshAccessToken(refreshToken);
  }
  return version === getTokenSessionVersion() && hasRecoverableSession();
}

/** True means an HTTP retry is authorized; offline context alone is insufficient. */
export async function handle401Error(): Promise<boolean> {
  const { refreshToken } = await getTokens();
  return Boolean(refreshToken && await refreshAccessToken(refreshToken));
}
