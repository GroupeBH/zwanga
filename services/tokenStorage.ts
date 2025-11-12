import * as SecureStore from 'expo-secure-store';

/**
 * Service de gestion des tokens JWT avec SecureStore
 * Stocke de manière sécurisée les accessToken et refreshToken
 */

// SecureStore n'accepte que des caractères alphanumériques, ".", "-", et "_"
// On remplace ":" par "_" pour respecter les contraintes
const ACCESS_TOKEN_KEY = '@zwanga_accessToken';
const REFRESH_TOKEN_KEY = '@zwanga_refreshToken';

/**
 * Stocke l'access token de manière sécurisée
 */
export async function storeAccessToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  } catch (error) {
    console.error('Erreur lors du stockage de l\'access token:', error);
    throw error;
  }
}

/**
 * Récupère l'access token depuis le stockage sécurisé
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    return token;
  } catch (error: any) {
    // Si l'erreur est due à une clé invalide ou un token inexistant, retourner null silencieusement
    if (error?.message?.includes('Invalid key') || error?.message?.includes('not found')) {
      return null;
    }
    console.error('Erreur lors de la récupération de l\'access token:', error);
    return null;
  }
}

/**
 * Stocke le refresh token de manière sécurisée
 */
export async function storeRefreshToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } catch (error) {
    console.error('Erreur lors du stockage du refresh token:', error);
    throw error;
  }
}

/**
 * Récupère le refresh token depuis le stockage sécurisé
 */
export async function getRefreshToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    return token;
  } catch (error: any) {
    // Si l'erreur est due à une clé invalide ou un token inexistant, retourner null silencieusement
    if (error?.message?.includes('Invalid key') || error?.message?.includes('not found')) {
      return null;
    }
    console.error('Erreur lors de la récupération du refresh token:', error);
    return null;
  }
}

/**
 * Stocke les deux tokens (access et refresh)
 */
export async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  try {
    await Promise.all([
      storeAccessToken(accessToken),
      storeRefreshToken(refreshToken),
    ]);
  } catch (error) {
    console.error('Erreur lors du stockage des tokens:', error);
    throw error;
  }
}

/**
 * Récupère les deux tokens (access et refresh)
 * Retourne null pour chaque token s'il n'existe pas (utilisateur non connecté)
 */
export async function getTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  try {
    // Récupérer les tokens individuellement pour gérer les erreurs séparément
    const accessToken = await getAccessToken();
    const refreshToken = await getRefreshToken();
    
    return { accessToken, refreshToken };
  } catch (error: any) {
    // En cas d'erreur, retourner null pour les deux tokens
    // Cela signifie que l'utilisateur n'est pas connecté
    console.error('Erreur lors de la récupération des tokens:', error);
    return { accessToken: null, refreshToken: null };
  }
}

/**
 * Supprime l'access token du stockage sécurisé
 */
export async function removeAccessToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  } catch (error: any) {
    // Ignorer l'erreur si le token n'existe pas déjà
    if (!error?.message?.includes('not found')) {
      console.error('Erreur lors de la suppression de l\'access token:', error);
    }
  }
}

/**
 * Supprime le refresh token du stockage sécurisé
 */
export async function removeRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch (error: any) {
    // Ignorer l'erreur si le token n'existe pas déjà
    if (!error?.message?.includes('not found')) {
      console.error('Erreur lors de la suppression du refresh token:', error);
    }
  }
}

/**
 * Supprime tous les tokens du stockage sécurisé
 */
export async function clearTokens(): Promise<void> {
  try {
    await Promise.all([
      removeAccessToken(),
      removeRefreshToken(),
    ]);
  } catch (error) {
    console.error('Erreur lors de la suppression des tokens:', error);
  }
}

