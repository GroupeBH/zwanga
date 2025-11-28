import { createApi, fetchBaseQuery, retry } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { API_BASE_URL } from '../../config/env';
import { getValidAccessToken } from '../../services/tokenRefresh';
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

  // Si erreur 401 (Unauthorized), laisser la requête échouer et gérer côté UI
  if (result.error && result.error.status === 401) {
    console.log('Erreur 401 détectée - aucun rafraîchissement automatique (handle401 désactivé)');
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


