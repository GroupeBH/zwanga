import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL } from '../config/env';
import { logout, setTokens } from '../store/slices/authSlice';
import { getStoreDispatch } from '../store/storeAccessor';
import { isTokenExpired, isTokenExpiringSoon } from '../utils/jwt';
import { clearTokens, getTokens, storeTokens } from './tokenStorage';

/**
 * Service de rafraîchissement automatique des tokens JWT
 * Gère la vérification et le renouvellement des access tokens
 */

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

// Normaliser l'URL de base pour éviter les doubles slashes
const getNormalizedBaseUrl = () => {
  if (!API_BASE_URL) return '';
  return API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
};

// Créer un baseQuery sans authentification pour le refresh token
// Cela garantit la même configuration que Redux Query mais sans header Authorization
const refreshBaseQuery = fetchBaseQuery({
  baseUrl: getNormalizedBaseUrl(),
  // Pas de prepareHeaders - on ne veut pas de header Authorization pour le refresh
});

/**
 * Vérifie si les tokens sont valides et rafraîchit si nécessaire
 * @returns true si l'utilisateur est authentifié, false sinon
 */
export async function validateAndRefreshTokens(): Promise<boolean> {

  try {
    const { accessToken, refreshToken } = await getTokens();

    console.log("accessToken at validateAndRefreshTokens", accessToken);
    console.log("refreshToken at validateAndRefreshTokens", refreshToken);

    // Pas de tokens = utilisateur non connecté
    if (!accessToken || !refreshToken) {
      console.log('Aucun token trouvé - utilisateur non connecté');
      return false;
    }

    // Vérifier l'access token
    const accessTokenExpired = isTokenExpired(accessToken);
    const accessTokenExpiringSoon = isTokenExpiringSoon(accessToken, 5);

    // Si l'access token est valide et n'expire pas bientôt, tout est OK
    if (!accessTokenExpired && !accessTokenExpiringSoon) {
      console.log('Access token valide');
      return true;
    }

    // L'access token est expiré ou expire bientôt, vérifier le refresh token
    const refreshTokenExpired = isTokenExpired(refreshToken);

    if (refreshTokenExpired) {
      console.log('Refresh token expiré - déconnexion nécessaire');
      // Nettoyer les tokens et déconnecter
      await clearTokens();
      getStoreDispatch()(logout());
      return false;
    }

    // Le refresh token est valide, rafraîchir l'access token
    console.log('Rafraîchissement de l\'access token...');
    const newAccessToken = await refreshAccessToken(refreshToken);

    if (newAccessToken) {
      console.log('Access token rafraîchi avec succès');
      return true;
    } else {
      // Si refreshAccessToken retourne null, cela peut être dû à une erreur réseau
      // Dans ce cas, on ne déconnecte pas l'utilisateur - il peut utiliser l'app en mode offline
      // On retourne true pour indiquer que l'utilisateur reste authentifié avec ses tokens existants
      console.log('Échec du rafraîchissement - peut-être offline, utilisateur reste connecté');
      // Ne pas déconnecter - l'utilisateur peut continuer avec son access token actuel (même s'il est expiré)
      // Les requêtes échoueront mais l'utilisateur ne sera pas déconnecté
      return true; // Retourner true pour indiquer que l'utilisateur reste authentifié
    }
  } catch (error: any) {
    console.error('Erreur lors de la validation des tokens:', error);
    
    // Vérifier si c'est une erreur réseau
    const isNetworkError = 
      error?.name === 'TypeError' ||
      error?.message?.toLowerCase().includes('network') ||
      error?.message?.toLowerCase().includes('fetch');
    
    if (isNetworkError) {
      console.warn('Erreur réseau détectée - utilisateur reste connecté en mode offline');
      return true; // L'utilisateur reste authentifié
    }
    
    // Pour les autres erreurs, déconnecter par sécurité
    await clearTokens();
    getStoreDispatch()(logout());
    return false;
  }
}

/**
 * Rafraîchit l'access token avec le refresh token
 * @param refreshToken Le refresh token valide
 * @returns Le nouveau access token ou null en cas d'échec
 */
export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  // Si un rafraîchissement est déjà en cours, attendre qu'il se termine
  if (isRefreshing && refreshPromise) {
    console.log('Rafraîchissement déjà en cours, attente...');
    return refreshPromise;
  }

  isRefreshing = true;

  // Vérifier que API_BASE_URL est défini
  if (!API_BASE_URL) {
    console.error('API_BASE_URL est undefined!');
    isRefreshing = false;
    return Promise.resolve(null);
  }

  const normalizedBaseUrl = getNormalizedBaseUrl();
  const refreshUrl = `${normalizedBaseUrl}/auth/refresh`;
  console.log('Rafraîchissement de l\'access token');
  console.log('  - API_BASE_URL:', API_BASE_URL);
  console.log('  - Normalized base URL:', normalizedBaseUrl);
  console.log('  - URL complète:', refreshUrl);
  console.log('  - Refresh token length:', refreshToken?.length || 0);
  
  // Vérifier que fetch est disponible
  if (typeof fetch === 'undefined') {
    console.error('fetch n\'est pas disponible dans cet environnement!');
    isRefreshing = false;
    return Promise.resolve(null);
  }

  refreshPromise = (async () => {
    let result: any = null;
    try {
      console.log('  - Début de la requête refresh');
      console.log('  - Body:', JSON.stringify({ refreshToken: refreshToken.substring(0, 20) + '...' }));
      
      // Utiliser refreshBaseQuery qui utilise déjà l'URL normalisée
      result = await refreshBaseQuery(
        {
          url: '/auth/refresh',
          method: 'POST',
          body: { refreshToken },
        },
        // @ts-ignore - on n'a pas besoin de l'API pour cette requête isolée
        { signal: new AbortController().signal },
        {}
      );

      console.log('  - Requête envoyée avec succès');
      console.log('  - Result:', result);

      if (result.error) {
        console.error('  - Error:', result.error);
        console.error('  - Error status:', result.error.status);
        console.error('  - Error data:', result.error.data);
        
        // Conserver l'erreur pour la détection réseau plus tard
        const errorStatus = result.error.status;
        const errorData = result.error.data;
        
        // Si c'est une erreur FETCH_ERROR, c'est une erreur réseau
        if (errorStatus === 'FETCH_ERROR') {
          throw { name: 'TypeError', message: 'Network request failed', isNetworkError: true, originalError: result.error };
        }
        
        throw { 
          name: 'HTTPError', 
          message: `HTTP ${errorStatus}: ${JSON.stringify(errorData)}`,
          status: errorStatus,
          data: errorData,
          isNetworkError: false
        };
      }

      const data = result.data as { accessToken: string; refreshToken: string };
      console.log('  - Response data reçu:', { 
        hasAccessToken: !!data?.accessToken, 
        hasRefreshToken: !!data?.refreshToken 
      });

      if (!data?.accessToken || !data?.refreshToken) {
        throw new Error('Tokens manquants dans la réponse');
      }

      // Stocker les nouveaux tokens
      await storeTokens(data.accessToken, data.refreshToken);

      // Mettre à jour Redux
      getStoreDispatch()(setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      }));

      console.log('Tokens rafraîchis et stockés');
      return data.accessToken;
    } catch (error: any) {
      console.error('Erreur lors du rafraîchissement du token:');
      console.error('  - Type:', error?.name || typeof error);
      console.error('  - Message:', error?.message);
      console.error('  - Stack:', error?.stack);
      
      // Vérifier si c'est une erreur réseau (offline, pas de connexion, etc.)
      const isNetworkError = 
        error?.isNetworkError === true ||
        error?.name === 'TypeError' ||
        error?.name === 'AbortError' ||
        error?.message?.toLowerCase().includes('network') ||
        error?.message?.toLowerCase().includes('fetch') ||
        error?.message?.toLowerCase().includes('failed to fetch') ||
        error?.message?.toLowerCase().includes('network request failed') ||
        (result?.error && 'status' in result.error && result.error.status === 'FETCH_ERROR');
      
      if (isNetworkError) {
        console.warn('  - Erreur réseau détectée - pas de déconnexion en mode offline');
        // Ne pas déconnecter l'utilisateur en cas d'erreur réseau
        // L'utilisateur reste connecté et peut continuer à utiliser l'app en mode offline
        isRefreshing = false;
        refreshPromise = null;
        return null; // Retourner null mais sans déconnecter
      }
      
      // Pour les autres erreurs (401, 403, etc.), c'est une vraie erreur d'authentification
      console.error('  - Erreur d\'authentification détectée - déconnexion');
      await clearTokens();
      getStoreDispatch()(logout());
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Intercepteur pour rafraîchir automatiquement le token avant chaque requête
 * Retourne l'access token valide ou null
 */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    const { accessToken, refreshToken } = await getTokens();

    if (!accessToken || !refreshToken) {
      await clearTokens();
      getStoreDispatch()(logout());
      return null;
    }

    // Si le token expire bientôt, le rafraîchir
    if (isTokenExpiringSoon(accessToken, 5) || isTokenExpired(accessToken)) {
      console.log('Access token expiré/expirant, rafraîchissement...');
      const newAccessToken = await refreshAccessToken(refreshToken);
      return newAccessToken;
    }

    return accessToken;
  } catch (error) {
    console.error('Erreur lors de la récupération du token valide:', error);
    return null;
  }
}

/**
 * Gère une erreur 401 (Unauthorized) en tentant de rafraîchir le token
 * @returns true si le token a été rafraîchi, false sinon
 */
export async function handle401Error(): Promise<boolean> {
  console.log('Erreur 401 détectée, tentative de rafraîchissement...');
  const { accessToken, refreshToken } = await getTokens();

  if (!accessToken && !refreshToken) {
    console.log('Tokens manquants, déconnexion requise');
    await clearTokens();
    getStoreDispatch()(logout());
    return false;
  }

  if (!accessToken || !isTokenExpired(accessToken)) {
    console.log('Access token encore valide, pas de refresh');
    return false;
  }

  if (!refreshToken || isTokenExpired(refreshToken)) {
    console.log('Refresh token expiré');
    await clearTokens();
    getStoreDispatch()(logout());
    return false;
  }

  const newAccessToken = await refreshAccessToken(refreshToken);

  if (newAccessToken) {
    console.log('Token rafraîchi après 401');
    return true;
  }

  console.log('Échec du rafraîchissement après 401');
  return false;
}

