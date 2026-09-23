import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { enqueueTokenWrite, getTokenSessionVersion, invalidateTokenSession } from './tokenSession';

/**
 * Service de gestion des tokens JWT avec SecureStore
 * + cache mémoire pour limiter les lectures et déchiffrements répétés.
 */

type SecureStoreKeyConfig = {
  access?: string;
  refresh?: string;
  fcm?: string;
};

type TokenPair = {
  accessToken: string | null;
  refreshToken: string | null;
};

const secureStoreKeys =
  ((Constants.expoConfig?.extra as { secureStoreKeys?: SecureStoreKeyConfig })?.secureStoreKeys ?? {});

const sanitizeKey = (raw: string | undefined, fallback: string) => {
  const key = raw?.trim() || fallback;
  // SecureStore accepte seulement [A-Za-z0-9._-]
  const sanitized = key.replace(/[^A-Za-z0-9._-]/g, '_');
  return sanitized.length > 0 ? sanitized : fallback;
};

const ACCESS_TOKEN_KEY = sanitizeKey(secureStoreKeys.access, 'zwanga_accessToken');
const REFRESH_TOKEN_KEY = sanitizeKey(secureStoreKeys.refresh, 'zwanga_refreshToken');
const FCM_TOKEN_KEY = sanitizeKey(secureStoreKeys.fcm, 'zwanga_fcmToken');

// In-memory cache to avoid repeated SecureStore decryptions.
let tokenCache: TokenPair = { accessToken: null, refreshToken: null };
let tokensCacheHydrated = false;
let tokensHydrationPromise: Promise<TokenPair> | null = null;

let fcmTokenCache: string | null = null;
let fcmCacheHydrated = false;
let fcmHydrationPromise: Promise<string | null> | null = null;

const readSecureItem = async (key: string, label: string): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error: any) {
    if (error?.message?.includes('Invalid key') || error?.message?.includes('not found')) {
      return null;
    }
    console.error(`Erreur lors de la récupération de ${label}:`, error);
    return null;
  }
};

const hydrateTokensCache = async (): Promise<TokenPair> => {
  if (tokensCacheHydrated) {
    return tokenCache;
  }

  if (!tokensHydrationPromise) {
    const version = getTokenSessionVersion();
    tokensHydrationPromise = (async () => {
      const [accessToken, refreshToken] = await Promise.all([
        readSecureItem(ACCESS_TOKEN_KEY, 'l\'access token'),
        readSecureItem(REFRESH_TOKEN_KEY, 'le refresh token'),
      ]);

      if (version === getTokenSessionVersion()) {
        tokenCache = { accessToken, refreshToken };
        tokensCacheHydrated = true;
      }
      return tokenCache;
    })().finally(() => {
      tokensHydrationPromise = null;
    });
  }

  return tokensHydrationPromise;
};

const hydrateFcmCache = async (): Promise<string | null> => {
  if (fcmCacheHydrated) {
    return fcmTokenCache;
  }

  if (!fcmHydrationPromise) {
    fcmHydrationPromise = (async () => {
      fcmTokenCache = await readSecureItem(FCM_TOKEN_KEY, 'le token FCM');
      fcmCacheHydrated = true;
      return fcmTokenCache;
    })().finally(() => {
      fcmHydrationPromise = null;
    });
  }

  return fcmHydrationPromise;
};

/**
 * Stocke le jeton d'accès de manière sécurisée
 */
export async function storeAccessToken(token: string): Promise<void> {
  const version = invalidateTokenSession();
  await enqueueTokenWrite(async () => {
    if (version !== getTokenSessionVersion()) return;
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
      if (version !== getTokenSessionVersion()) return;
      tokenCache.accessToken = token;
      tokensCacheHydrated = true;
    } catch (error) {
      console.error('Erreur lors du stockage de l\'access token:', error);
      throw error;
    }
  });
}

/**
 * Récupère le jeton d'accès depuis le stockage sécurisé
 */
export async function getAccessToken(): Promise<string | null> {
  const { accessToken } = await hydrateTokensCache();
  return accessToken;
}

/**
 * Stocke le jeton d'actualisation de manière sécurisée
 */
export async function storeRefreshToken(token: string): Promise<void> {
  const version = invalidateTokenSession();
  await enqueueTokenWrite(async () => {
    if (version !== getTokenSessionVersion()) return;
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
      if (version !== getTokenSessionVersion()) return;
      tokenCache.refreshToken = token;
      tokensCacheHydrated = true;
    } catch (error) {
      console.error('Erreur lors du stockage du refresh token:', error);
      throw error;
    }
  });
}

/**
 * Récupère le jeton d'actualisation depuis le stockage sécurisé
 */
export async function getRefreshToken(): Promise<string | null> {
  const { refreshToken } = await hydrateTokensCache();
  return refreshToken;
}

/**
 * Stocke les deux tokens (access et refresh)
 */
export async function storeTokens(accessToken: string, refreshToken: string, expectedVersion?: number): Promise<boolean> {
  const version = expectedVersion ?? invalidateTokenSession();
  if (expectedVersion === undefined) {
    tokenCache = { accessToken: null, refreshToken: null };
    tokensCacheHydrated = true;
  }
  return enqueueTokenWrite(async () => {
    if (version !== getTokenSessionVersion()) return false;
    // Await both native writes even if one fails, so a queued logout runs last.
    const writes = await Promise.allSettled([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);
    const failed = writes.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;

    if (version !== getTokenSessionVersion()) return false;
    tokenCache = { accessToken, refreshToken };
    tokensCacheHydrated = true;
    return true;
  });
}

/**
 * Récupère les deux jetons (accès et actualisation)
 */
export async function getTokens(): Promise<TokenPair> {
  try {
    return await hydrateTokensCache();
  } catch (error: any) {
    console.error('Erreur lors de la récupération des tokens:', error);
    return { accessToken: null, refreshToken: null };
  }
}

/**
 * Supprime le jeton d'accès du stockage sécurisé
 */
export async function removeAccessToken(): Promise<void> {
  invalidateTokenSession();
  tokenCache.accessToken = null;
  tokensCacheHydrated = true;
  try {
    await enqueueTokenWrite(() => SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY));
  } catch (error: any) {
    if (!error?.message?.includes('not found')) {
      console.error('Erreur lors de la suppression de l\'access token:', error);
    }
  }
}

/**
 * Supprime le jeton d'actualisation du stockage sécurisé
 */
export async function removeRefreshToken(): Promise<void> {
  invalidateTokenSession();
  tokenCache.refreshToken = null;
  tokensCacheHydrated = true;
  try {
    await enqueueTokenWrite(() => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY));
  } catch (error: any) {
    if (!error?.message?.includes('not found')) {
      console.error('Erreur lors de la suppression du refresh token:', error);
    }
  }
}

/**
 * Supprime tous les jetons du stockage sécurisé
 * Vide completement le SecureStore (access token, refresh token, FCM token)
 */
export async function clearTokens(expectedVersion?: number): Promise<boolean> {
  if (expectedVersion !== undefined && expectedVersion !== getTokenSessionVersion()) return false;
  const version = invalidateTokenSession();
  tokenCache = { accessToken: null, refreshToken: null };
  tokensCacheHydrated = true;
  fcmTokenCache = null;
  fcmCacheHydrated = true;
  await enqueueTokenWrite(async () => {
    await Promise.all([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, FCM_TOKEN_KEY].map(async key => {
      try { await SecureStore.deleteItemAsync(key); }
      catch { console.warn('[TokenStorage] Nettoyage du stockage sécurisé indisponible.'); }
    }));
  });
  return version === getTokenSessionVersion();
}

/**
 * Stocke le jeton FCM pour éviter les requêtes réseau inutiles
 */
export async function storeFcmToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(FCM_TOKEN_KEY, token);
    fcmTokenCache = token;
    fcmCacheHydrated = true;
  } catch (error) {
    console.error('Erreur lors du stockage du token FCM:', error);
  }
}

/**
 * Récupère le jeton FCM sauvegardé
 */
export async function getStoredFcmToken(): Promise<string | null> {
  return hydrateFcmCache();
}

/**
 * Supprime le jeton FCM sauvegardé
 */
export async function removeFcmToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(FCM_TOKEN_KEY);
  } catch (error: any) {
    if (!error?.message?.includes('not found')) {
      console.error('Erreur lors de la suppression du token FCM:', error);
    }
  } finally {
    fcmTokenCache = null;
    fcmCacheHydrated = true;
  }
}
