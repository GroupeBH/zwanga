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
let refreshPromise: Promise<string> | null = null;

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

  refreshPromise = (async () => {
    try {
      // Appeler l'API de refresh
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.accessToken || !data.refreshToken) {
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
    } catch (error) {
      console.error('Erreur lors du rafraîchissement du token:', error);
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
  
  const { refreshToken } = await getTokens();

  if (!refreshToken) {
    console.log('Pas de refresh token disponible');
    await clearTokens();
    getStoreDispatch()(logout());
    return false;
  }

  // Vérifier que le refresh token n'est pas expiré
  if (isTokenExpired(refreshToken)) {
    console.log('Refresh token expiré');
    await clearTokens();
    getStoreDispatch()(logout());
    return false;
  }

  // Tenter de rafraîchir
  const newAccessToken = await refreshAccessToken(refreshToken);
  
  if (newAccessToken) {
    console.log('Token rafraîchi après 401');
    return true;
  } else {
    console.log('Échec du rafraîchissement après 401');
    return false;
  }
}

