import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL } from '../../config/env';
import { getAccessToken } from '../../services/tokenStorage';
import type { RootState } from '../index';

/**
 * API de base avec configuration commune
 * Tous les modules API étendent cette configuration
 */
export const baseApi = createApi({
  reducerPath: 'zwangaApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: async (headers, { getState }) => {
      // Essayer d'abord de récupérer le token depuis Redux state
      const token = (getState() as RootState).auth.accessToken;
      
      // Si pas dans le state, essayer de le récupérer depuis SecureStore
      const accessToken = token || await getAccessToken();
      
      if (accessToken) {
        headers.set('authorization', `Bearer ${accessToken}`);
      }
      return headers;
    },
  }),
  tagTypes: ['User', 'Trip', 'Message', 'Conversation', 'Review', 'Notification'],
  endpoints: () => ({}),
});


