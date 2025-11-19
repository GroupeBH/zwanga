import { createApi, fetchBaseQuery, retry } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { API_BASE_URL } from '../../config/env';
import { getValidAccessToken, handle401Error } from '../../services/tokenRefresh';
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

/**
 * Base query avec retry et gestion des erreurs 401
 */
const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  // Première tentative
  let result = await baseQueryWithAuth(args, api, extraOptions);

  // Si erreur 401 (Unauthorized), tenter de rafraîchir le token
  if (result.error && result.error.status === 401) {
    console.log('Erreur 401 - tentative de rafraîchissement du token');
    
    // Tenter de rafraîchir le token
    const refreshed = await handle401Error();
    
    if (refreshed) {
      // Le token a été rafraîchi, réessayer la requête
      console.log('Token rafraîchi, nouvelle tentative de la requête');
      result = await baseQueryWithAuth(args, api, extraOptions);
    } else {
      // Impossible de rafraîchir, l'utilisateur sera redirigé vers login
      console.log('Impossible de rafraîchir le token - déconnexion');
    }
  }

  return result;
};

/**
 * API de base avec configuration commune
 * Tous les modules API étendent cette configuration
 */
export const baseApi = createApi({
  reducerPath: 'zwangaApi',
  baseQuery: retry(baseQueryWithReauth, { maxRetries: 0 }),
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
  ],
  endpoints: () => ({}),
});


