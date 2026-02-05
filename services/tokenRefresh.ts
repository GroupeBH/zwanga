import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL } from '../config/env';
import { getStoreDispatch } from '../store/storeAccessor';
import { isTokenExpired, isTokenExpiringSoon } from '../utils/jwt';
import { getTokens, storeTokens } from './tokenStorage';

/**
 * Service de rafraîchissement automatique des tokens JWT
 * Gère la vérification et le renouvellement des access tokens
 * 
 * IMPORTANT: Ce service ne déclenche JAMAIS de logout directement.
 * La gestion du logout est centralisée dans AuthGuard pour éviter les race conditions.
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
 * Vérifie si les tokens existent et si le refresh token est valide.
 * Appelé par initializeAuth dans authSlice au démarrage.
 * 
 * IMPORTANT: Cette fonction ne rafraîchit PAS les tokens.
 * Le refresh est géré par :
 * 1. proactiveTokenRefresh() dans AuthGuard (au démarrage et retour de l'app)
 * 2. baseQueryWithReauth (sur erreur 401)
 * 3. Le backend (après KYC validé ou PIN changé)
 * 
 * @returns true si l'utilisateur a des tokens avec un refresh token valide, false sinon
 */
export async function validateAndRefreshTokens(): Promise<boolean> {
  try {
    const { accessToken, refreshToken } = await getTokens();

    // Pas de tokens = utilisateur non connecté
    if (!accessToken || !refreshToken) {
      console.log('[validateAndRefreshTokens] Aucun token trouvé');
      return false;
    }

    // Vérifier si le refresh token est expiré
    if (isTokenExpired(refreshToken)) {
      console.log('[validateAndRefreshTokens] Refresh token expiré');
      return false;
    }

    // L'utilisateur a des tokens avec un refresh token valide
    // Le proactiveTokenRefresh dans AuthGuard gérera le refresh si l'access token est expiré
    console.log('[validateAndRefreshTokens] Tokens présents, refresh token valide');
    return true;
  } catch (error: any) {
    console.error('[validateAndRefreshTokens] Erreur:', error);
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

      // Sauvegarder dans SecureStore puis mettre à jour le state Redux (séquentiellement)
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
        console.warn('[refreshAccessToken] Store non initialisé, tokens stockés uniquement dans SecureStore', dispatchError);
      }

      console.log('Tokens rafraîchis et stockés');
      return data.accessToken;
    } catch (error: any) {
      console.error('[refreshAccessToken] Erreur lors du rafraîchissement du token:');
      console.error('  - Type:', error?.name || typeof error);
      console.error('  - Message:', error?.message);
      
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
        console.warn('[refreshAccessToken] Erreur réseau - pas de déconnexion');
        return null;
      }
      
      // Pour les erreurs d'authentification (401, 403, etc.):
      // Ne PAS déclencher de logout ici car cela peut être une race condition
      // (ex: plusieurs requêtes parallèles essayent de refresh avec l'ancien token)
      // Le AuthGuard gérera le logout si les tokens sont vraiment invalides
      console.warn('[refreshAccessToken] Erreur d\'authentification - retourne null (logout géré par AuthGuard)');
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Récupère l'access token actuel pour les requêtes API.
 * 
 * IMPORTANT: Cette fonction ne rafraîchit JAMAIS le token automatiquement.
 * Elle retourne le token tel quel, même s'il est expiré.
 * 
 * Le refresh se produit UNIQUEMENT dans ces cas :
 * 1. Erreur 401 reçue du serveur (géré par baseQueryWithReauth)
 * 2. Retour dans l'app avec token expiré (géré par AuthGuard via proactiveTokenRefresh)
 * 3. Actions spécifiques : KYC validé, PIN changé (le backend renvoie de nouveaux tokens)
 * 
 * @returns L'access token actuel ou null si aucun token
 */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    const { accessToken } = await getTokens();
    // Retourner le token tel quel - le handler 401 gère les tokens expirés
    return accessToken || null;
  } catch (error) {
    console.error('[getValidAccessToken] Erreur:', error);
    return null;
  }
}

/**
 * Rafraîchissement proactif au retour dans l'app
 * Appelé quand l'app revient au premier plan ou au démarrage
 * Rafraîchit si le token expire dans moins de 1 jour (24h)
 * 
 * @returns true si les tokens sont valides, false sinon
 */
export async function proactiveTokenRefresh(): Promise<boolean> {
  try {
    const { accessToken, refreshToken } = await getTokens();

    if (!accessToken || !refreshToken) {
      console.log('[proactiveTokenRefresh] Pas de tokens');
      return false;
    }

    // Vérifier si le refresh token est valide
    if (isTokenExpired(refreshToken)) {
      console.log('[proactiveTokenRefresh] Refresh token expiré');
      return false;
    }

    // Si l'access token est expiré OU expire dans moins de 24h, rafraîchir
    const HOURS_24_IN_MINUTES = 24 * 60;
    if (isTokenExpired(accessToken) || isTokenExpiringSoon(accessToken, HOURS_24_IN_MINUTES)) {
      console.log('[proactiveTokenRefresh] Token expiré ou expire dans <24h - rafraîchissement...');
      const newAccessToken = await refreshAccessToken(refreshToken);
      return !!newAccessToken;
    }

    console.log('[proactiveTokenRefresh] Token valide, pas besoin de rafraîchir');
    return true;
  } catch (error) {
    console.error('[proactiveTokenRefresh] Erreur:', error);
    return false;
  }
}

/**
 * Gère une erreur 401 (Unauthorized) en tentant de rafraîchir le token
 * @returns true si le token a été rafraîchi, false sinon
 * 
 * NOTE: Ne déclenche PAS de logout - AuthGuard le gère.
 */
export async function handle401Error(): Promise<boolean> {
  console.log('[handle401Error] Erreur 401 détectée...');
  const { accessToken, refreshToken } = await getTokens();

  if (!accessToken && !refreshToken) {
    console.log('[handle401Error] Tokens manquants - retourne false');
    return false;
  }

  if (!accessToken || !isTokenExpired(accessToken)) {
    console.log('[handle401Error] Access token valide, pas de refresh');
    return false;
  }

  if (!refreshToken || isTokenExpired(refreshToken)) {
    console.log('[handle401Error] Refresh token expiré - retourne false');
    return false;
  }

  const newAccessToken = await refreshAccessToken(refreshToken);

  if (newAccessToken) {
    console.log('[handle401Error] Token rafraîchi après 401');
    return true;
  }

  console.log('[handle401Error] Échec du rafraîchissement - retourne false');
  return false;
}

