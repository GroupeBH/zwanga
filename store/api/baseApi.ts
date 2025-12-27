import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { Mutex } from 'async-mutex';
import { API_BASE_URL } from '../../config/env';
import { getValidAccessToken, refreshAccessToken } from '../../services/tokenRefresh';
import type { RootState } from '../index';

/**
 * Base query avec gestion automatique du rafraîchissement des tokens
 */
const baseQueryWithAuth = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: async (headers, { getState }) => {
    // Récupérer un access token valide (rafraîchi automatiquement si nécessaire)
    const accessToken = await getValidAccessToken();

    if (accessToken) {
      headers.set('authorization', `Bearer ${accessToken}`);
    }
    return headers;
  },
});

const mutex = new Mutex();

/**
 * Base query avec retry et gestion des erreurs 401
 */
const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  // Attendre si un refresh est en cours
  await mutex.waitForUnlock();

  // Première tentative
  let result = await baseQueryWithAuth(args, api, extraOptions);

  // Si erreur 401 (Unauthorized) - mais pas si c'est une erreur réseau
  if (result.error && result.error.status === 401) {
    if (!mutex.isLocked()) {
      const release = await mutex.acquire();
      try {
        // Obtenir le refresh token actuel depuis le state ou storage
        // Note: idealement on le chope du state
        const state = api.getState() as RootState;
        const refreshToken = state.auth.refreshToken;

        if (refreshToken) {
          // Tenter le refresh
          const newAccessToken = await refreshAccessToken(refreshToken);

          if (newAccessToken) {
            // Refresh réussi, rejouer la requête initiale
            // Le baseQueryWithAuth va choper le nouveau token via getValidAccessToken/state
            result = await baseQueryWithAuth(args, api, extraOptions);
          } else {
            // Refresh échoué - peut-être une erreur réseau (offline)
            // refreshAccessToken ne déconnecte plus en cas d'erreur réseau
            // On retourne simplement l'erreur 401 originale
            // result reste 401
          }
        } else {
          // Pas de refresh token, on ne peut rien faire
          // Logout déjà géré normalement par l'absence de tokens
        }
      } finally {
        release();
      }
    } else {
      // Si le mutex était locké, cela signifie qu'un refresh était en cours.
      // On attend qu'il finisse, puis on rejoue la requête
      await mutex.waitForUnlock();
      result = await baseQueryWithAuth(args, api, extraOptions);
    }
  }
  
  // Si erreur réseau (FETCH_ERROR), ne pas déconnecter l'utilisateur
  // L'utilisateur peut continuer à utiliser l'app en mode offline
  if (result.error && result.error.status === 'FETCH_ERROR') {
    console.warn('[baseApi] Erreur réseau détectée - utilisateur reste connecté');
    // Retourner l'erreur mais ne pas déconnecter
  }

  return result;
};

/**
 * API de base avec configuration commune
 * Tous les modules API étendent cette configuration
 */
export const baseApi = createApi({
  reducerPath: 'zwangaApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'User',
    'Trip',
    'MyTrips',
    'Booking',
    'Message',
    'Conversation',
    'Review',
    'Notification',
    'Vehicle',
    'TripRequest',
    'DriverOffer',
    'MyDriverOffers',
    'EmergencyContact',
    'SafetyAlert',
    'UserReport',
    'KycStatus',
    'FavoriteLocations',
  ],
  endpoints: () => ({}),
});
