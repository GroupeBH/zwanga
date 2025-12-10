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

// Créer un baseQuery sans authentification pour le refresh token
// Cela garantit la même configuration que Redux Query mais sans header Authorization
const refreshBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  // Pas de prepareHeaders - on ne veut pas de header Authorization pour le refresh
});

/**
 * Vérifie si les tokens sont valides et rafraîchit si nécessaire
 * @returns true si l'utilisateur est authentifié, false sinon
 */
export async function validateAndRefreshTokens(): Promise<boolean> {

  try {
    const { accessToken, refreshToken } = await getTokens();

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
      console.log('Échec du rafraîchissement - déconnexion');
      await clearTokens();
      getStoreDispatch()(logout());
      return false;
    }
  } catch (error) {
    console.error('Erreur lors de la validation des tokens:', error);
    // En cas d'erreur, déconnecter par sécurité
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

  const refreshUrl = `${API_BASE_URL}/auth/refresh`;
  console.log('Rafraîchissement de l\'access token');
  console.log('  - API_BASE_URL:', API_BASE_URL);
  console.log('  - URL complète:', refreshUrl);
  console.log('  - Refresh token length:', refreshToken?.length || 0);
  
  // Vérifier que fetch est disponible
  if (typeof fetch === 'undefined') {
    console.error('fetch n\'est pas disponible dans cet environnement!');
    isRefreshing = false;
    return Promise.resolve(null);
  }

  refreshPromise = (async () => {
    try {
      console.log('  - Début de la requête refresh');
      console.log('  - Body:', JSON.stringify({ refreshToken: refreshToken.substring(0, 20) + '...' }));
      
      // Utiliser fetchBaseQuery pour garantir la même configuration que Redux Query
      const result = await refreshBaseQuery(
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
        throw new Error(`HTTP ${result.error.status}: ${JSON.stringify(result.error.data)}`);
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
      
      // Vérifier si c'est une erreur réseau
      if (error?.name === 'AbortError' || error?.message?.includes('network') || error?.message?.includes('fetch')) {
        console.error('  - Erreur réseau détectée - la requête n\'a pas atteint le serveur');
      }
      
      // En cas d'erreur, nettoyer et déconnecter
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

