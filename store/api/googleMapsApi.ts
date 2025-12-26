import { baseApi } from './baseApi';

// ==================== Types ====================

export interface GeocodeRequest {
  address: string;
  region?: string;
}

export interface ReverseGeocodeRequest {
  lat: number;
  lng: number;
}

export interface GeocodeResponse {
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId?: string;
  addressComponents?: {
    longName: string;
    shortName: string;
    types: string[];
  }[];
}

export interface PlacesAutocompleteRequest {
  input: string;
  locationLat?: number;
  locationLng?: number;
  radius?: number;
  region?: string;
  language?: string;
}

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
}

export interface PlaceDetailsRequest {
  placeId: string;
  language?: string;
}

export interface PlaceDetails {
  placeId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  name?: string;
  phoneNumber?: string;
  website?: string;
  rating?: number;
  types?: string[];
}

export interface PlacesSearchRequest {
  query: string;
  locationLat?: number;
  locationLng?: number;
  radius?: number;
  language?: string;
}

export interface Waypoint {
  address?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
}

export enum TravelMode {
  DRIVING = 'driving',
  WALKING = 'walking',
  BICYCLING = 'bicycling',
  TRANSIT = 'transit',
}

export enum Avoid {
  TOLLS = 'tolls',
  HIGHWAYS = 'highways',
  FERRIES = 'ferries',
  INDOOR = 'indoor',
}

export interface DirectionsRequest {
  origin: Waypoint;
  destination: Waypoint;
  waypoints?: Waypoint[];
  mode?: TravelMode;
  avoid?: Avoid[];
  optimizeWaypoints?: boolean;
  alternatives?: boolean;
  language?: string;
  region?: string;
  departureTime?: number;
  arrivalTime?: number;
}

export interface RouteStep {
  distance: number; // meters
  duration: number; // seconds
  htmlInstructions: string;
  polyline: string;
  startLocation: { lat: number; lng: number };
  endLocation: { lat: number; lng: number };
}

export interface RouteLeg {
  distance: number; // meters
  duration: number; // seconds
  startAddress: string;
  endAddress: string;
  startLocation: { lat: number; lng: number };
  endLocation: { lat: number; lng: number };
  steps: RouteStep[];
}

export interface Route {
  summary: string;
  legs: RouteLeg[];
  overviewPolyline: string;
  bounds: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
  copyrights: string;
  warnings: string[];
}

export interface DirectionsResponse {
  routes: Route[];
  status: string;
  errorMessage?: string;
}

// ==================== API ====================

export const googleMapsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    geocode: builder.mutation<GeocodeResponse, GeocodeRequest>({
      query: (body) => ({
        url: '/google-maps/geocode',
        method: 'POST',
        body,
      }),
    }),

    reverseGeocode: builder.mutation<GeocodeResponse, ReverseGeocodeRequest>({
      query: (body) => ({
        url: '/google-maps/reverse-geocode',
        method: 'POST',
        body,
      }),
    }),

    placesAutocomplete: builder.query<PlacePrediction[], PlacesAutocompleteRequest>({
      query: (params) => ({
        url: '/google-maps/places/autocomplete',
        params,
      }),
    }),

    getPlaceDetails: builder.query<PlaceDetails, PlaceDetailsRequest>({
      query: (params) => ({
        url: '/google-maps/places/details',
        params,
      }),
    }),

    placesSearch: builder.query<PlaceDetails[], PlacesSearchRequest>({
      query: (params) => ({
        url: '/google-maps/places/search',
        params,
      }),
    }),

    getDirections: builder.mutation<DirectionsResponse, DirectionsRequest>({
      query: (body) => ({
        url: '/google-maps/directions',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const {
  useGeocodeMutation,
  useReverseGeocodeMutation,
  usePlacesAutocompleteQuery,
  useLazyPlacesAutocompleteQuery,
  useGetPlaceDetailsQuery,
  useLazyGetPlaceDetailsQuery,
  usePlacesSearchQuery,
  useLazyPlacesSearchQuery,
  useGetDirectionsMutation,
} = googleMapsApi;

