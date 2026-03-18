import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/**
 * Service de gestion des tokens JWT avec SecureStore
 * + cache memoire pour limiter les lectures/dechiffrements repetes.
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
    console.error(`Erreur lors de la recuperation de ${label}:`, error);
    return null;
  }
};

const hydrateTokensCache = async (): Promise<TokenPair> => {
  if (tokensCacheHydrated) {
    return tokenCache;
  }

  if (!tokensHydrationPromise) {
    tokensHydrationPromise = (async () => {
      const [accessToken, refreshToken] = await Promise.all([
        readSecureItem(ACCESS_TOKEN_KEY, 'l\'access token'),
        readSecureItem(REFRESH_TOKEN_KEY, 'le refresh token'),
      ]);

      tokenCache = { accessToken, refreshToken };
      tokensCacheHydrated = true;
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
 * Stocke l'access token de maniere securisee
 */
export async function storeAccessToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
    tokenCache.accessToken = token;
    tokensCacheHydrated = true;
  } catch (error) {
    console.error('Erreur lors du stockage de l\'access token:', error);
    throw error;
  }
}

/**
 * Recupere l'access token depuis le stockage securise
 */
export async function getAccessToken(): Promise<string | null> {
  const { accessToken } = await hydrateTokensCache();
  return accessToken;
}

/**
 * Stocke le refresh token de maniere securisee
 */
export async function storeRefreshToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    tokenCache.refreshToken = token;
    tokensCacheHydrated = true;
  } catch (error) {
    console.error('Erreur lors du stockage du refresh token:', error);
    throw error;
  }
}

/**
 * Recupere le refresh token depuis le stockage securise
 */
export async function getRefreshToken(): Promise<string | null> {
  const { refreshToken } = await hydrateTokensCache();
  return refreshToken;
}

/**
 * Stocke les deux tokens (access et refresh)
 */
export async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  try {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);

    tokenCache = { accessToken, refreshToken };
    tokensCacheHydrated = true;
  } catch (error) {
    console.error('Erreur lors du stockage des tokens:', error);
    throw error;
  }
}

/**
 * Recupere les deux tokens (access et refresh)
 */
export async function getTokens(): Promise<TokenPair> {
  try {
    return await hydrateTokensCache();
  } catch (error: any) {
    console.error('Erreur lors de la recuperation des tokens:', error);
    return { accessToken: null, refreshToken: null };
  }
}

/**
 * Supprime l'access token du stockage securise
 */
export async function removeAccessToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  } catch (error: any) {
    if (!error?.message?.includes('not found')) {
      console.error('Erreur lors de la suppression de l\'access token:', error);
    }
  } finally {
    tokenCache.accessToken = null;
    tokensCacheHydrated = true;
  }
}

/**
 * Supprime le refresh token du stockage securise
 */
export async function removeRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch (error: any) {
    if (!error?.message?.includes('not found')) {
      console.error('Erreur lors de la suppression du refresh token:', error);
    }
  } finally {
    tokenCache.refreshToken = null;
    tokensCacheHydrated = true;
  }
}

/**
 * Supprime tous les tokens du stockage securise
 * Vide completement le SecureStore (access token, refresh token, FCM token)
 */
export async function clearTokens(): Promise<void> {
  try {
    await Promise.all([
      removeAccessToken(),
      removeRefreshToken(),
      removeFcmToken(),
    ]);
    console.log('Tous les tokens ont ete supprimes du SecureStore');
  } catch (error) {
    console.error('Erreur lors de la suppression des tokens:', error);
  } finally {
    tokenCache = { accessToken: null, refreshToken: null };
    tokensCacheHydrated = true;
    fcmTokenCache = null;
    fcmCacheHydrated = true;
  }
}

/**
 * Stocke le token FCM pour eviter les requetes reseaux inutiles
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
 * Recupere le token FCM sauvegarde
 */
export async function getStoredFcmToken(): Promise<string | null> {
  return hydrateFcmCache();
}

/**
 * Supprime le token FCM sauvegarde
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
