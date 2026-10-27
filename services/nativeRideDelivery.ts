import { NativeModules, Platform } from 'react-native';
import { getTokens } from './tokenStorage';
import { getTokenSessionVersion } from './tokenSession';
import { decodeJWT, getUserIdFromToken } from '@/utils/jwt';

/** Advertise v6 only after a native receiver is bound to the current session. */
export async function bindNativeRideDelivery(userId: string, channelId: string): Promise<boolean> {
  const bridge = NativeModules?.ZwangaDriverAlerts;
  if (Platform.OS !== 'android' || typeof bridge?.bindNativeRideAccount !== 'function') return false;
  const version = getTokenSessionVersion();
  const { refreshToken } = await getTokens({ throwOnError: true });
  if (!refreshToken || getUserIdFromToken(refreshToken) !== userId || version !== getTokenSessionVersion()) return false;
  const expires = Number(decodeJWT(refreshToken)?.exp) * 1000;
  if (!Number.isFinite(expires) || expires <= Date.now()) return false;
  return bridge.bindNativeRideAccount(userId, expires, channelId) === 6;
}
