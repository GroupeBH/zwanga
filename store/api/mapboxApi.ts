import Constants from 'expo-constants';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

import { DEFAULT_API_TIMEOUT_MS } from '@/constants/network';

const mapboxAccessToken =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  '';

export const isMapboxConfigured = () => Boolean(mapboxAccessToken);

type SuggestPlacesArgs = {
  bbox: string;
  country: string;
  language: string;
  limit: number;
  proximity: string;
  query: string;
  sessionToken: string;
  types: string;
};

type RetrievePlaceArgs = {
  suggestionId: string;
  sessionToken: string;
};

type DirectionsArgs = {
  coordinates: string;
  profile?: 'driving' | 'driving-traffic' | 'walking' | 'cycling';
};

/**
 * Dedicated RTK Query transport for the optional Mapbox fallback services.
 * Keeping it separate avoids sending Zwanga authentication headers to Mapbox.
 */
export const mapboxApi = createApi({
  reducerPath: 'mapboxApi',
  baseQuery: fetchBaseQuery({
    baseUrl: 'https://api.mapbox.com',
    timeout: DEFAULT_API_TIMEOUT_MS,
  }),
  keepUnusedDataFor: 300,
  endpoints: (builder) => ({
    suggestPlaces: builder.query<unknown, SuggestPlacesArgs>({
      query: ({ query, sessionToken, ...params }) => ({
        url: '/search/searchbox/v1/suggest',
        params: {
          q: query,
          session_token: sessionToken,
          access_token: mapboxAccessToken,
          ...params,
        },
      }),
    }),
    retrievePlace: builder.query<unknown, RetrievePlaceArgs>({
      query: ({ suggestionId, sessionToken }) => ({
        url: '/search/searchbox/v1/retrieve',
        params: {
          id: suggestionId,
          session_token: sessionToken,
          access_token: mapboxAccessToken,
        },
      }),
    }),
    getDirections: builder.query<unknown, DirectionsArgs>({
      query: ({ coordinates, profile = 'driving' }) => ({
        url: `/directions/v5/mapbox/${profile}/${coordinates}`,
        params: {
          geometries: 'geojson',
          access_token: mapboxAccessToken,
          overview: 'full',
          alternatives: 'false',
          steps: 'false',
        },
      }),
    }),
  }),
});
