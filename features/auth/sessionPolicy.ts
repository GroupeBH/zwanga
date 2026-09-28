import { decodeJWT, isTokenExpired } from '@/utils/jwt';

/** A refreshable session must still identify a user, even while offline. */
export function hasRecoverableAuthSession(
  accessToken: string | null,
  refreshToken: string | null,
): boolean {
  if (!accessToken || !refreshToken) return false;

  const refreshPayload = decodeJWT(refreshToken);
  const payload = decodeJWT(accessToken);
  const userId = payload?.sub || payload?.userId;
  return Boolean(
    typeof userId === 'string' &&
    userId.trim() &&
    typeof payload?.exp === 'number' &&
    Number.isFinite(payload.exp) &&
    typeof refreshPayload?.exp === 'number' &&
    Number.isFinite(refreshPayload.exp) &&
    refreshPayload.exp * 1000 > Date.now(),
  );
}

/** A newly issued session must be usable immediately for authenticated requests. */
export function hasUsableNewAuthSession(
  accessToken: string | null,
  refreshToken: string | null,
): boolean {
  return hasRecoverableAuthSession(accessToken, refreshToken) &&
    !isTokenExpired(accessToken!);
}
