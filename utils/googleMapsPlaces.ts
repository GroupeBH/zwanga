import { normalizeSearchText, unique, containsAlias, analyzeQuery, scoreSuggestionForQuery, getTypeSpecificityScore, shouldRunPreciseTextSearch } from './places/searchRanking';
import { DEFAULT_PROXIMITY, MAJOR_CITIES, MajorCityConfig, RDC_BBOX, GoogleMapsSearchSuggestion } from './places/searchModel';
import { store } from '@/store';
import { googleMapsApi, type PlaceDetails } from '@/store/api/googleMapsApi';
import { readableLocation } from '@/utils/readableLocation';
export type { GoogleMapsSearchSuggestion } from './places/searchModel';

/* =====================================================
   CITY AND LOCATION HELPERS
===================================================== */

const isInRdcBounds = (latitude: number | null, longitude: number | null) => {
  if (latitude === null || longitude === null) {
    return true;
  }

  return (
    longitude >= RDC_BBOX.minLng &&
    longitude <= RDC_BBOX.maxLng &&
    latitude >= RDC_BBOX.minLat &&
    latitude <= RDC_BBOX.maxLat
  );
};

const normalizeSearchProximity = (
  proximity?: { longitude: number; latitude: number },
): { longitude: number; latitude: number } | null => {
  if (!proximity) return null;

  const latitude = Number(proximity.latitude);
  const longitude = Number(proximity.longitude);
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    isInRdcBounds(latitude, longitude)
  ) {
    return { latitude, longitude };
  }

  // Recover the common GeoJSON/LatLng inversion when the swapped pair is in RDC.
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    isInRdcBounds(longitude, latitude)
  ) {
    return { latitude: longitude, longitude: latitude };
  }

  return null;
};

const findCityConfigInText = (value: string): MajorCityConfig | null => {
  for (const cityConfig of Object.values(MAJOR_CITIES)) {
    if (cityConfig.aliases.some((alias) => containsAlias(value, alias))) {
      return cityConfig;
    }
  }

  return null;
};

const findCityConfigNearProximity = (
  proximity?: { longitude: number; latitude: number },
): MajorCityConfig | null => {
  if (!proximity) {
    return null;
  }

  for (const cityConfig of Object.values(MAJOR_CITIES)) {
    const bbox = cityConfig.bbox;
    if (
      proximity.longitude >= bbox.minLng &&
      proximity.longitude <= bbox.maxLng &&
      proximity.latitude >= bbox.minLat &&
      proximity.latitude <= bbox.maxLat
    ) {
      return cityConfig;
    }
  }

  return null;
};

function detectCity(suggestion: GoogleMapsSearchSuggestion): string | null {
  const searchText = [
    suggestion.context?.locality,
    suggestion.context?.region,
    suggestion.name,
    suggestion.fullAddress,
  ].filter(Boolean).join(' ');

  for (const [cityKey, cityConfig] of Object.entries(MAJOR_CITIES)) {
    if (cityConfig.aliases.some((alias) => containsAlias(searchText, alias))) {
      return cityKey;
    }

    if (suggestion.coordinates.latitude !== null && suggestion.coordinates.longitude !== null) {
      const lat = suggestion.coordinates.latitude;
      const lng = suggestion.coordinates.longitude;
      const bbox = cityConfig.bbox;

      if (
        lng >= bbox.minLng &&
        lng <= bbox.maxLng &&
        lat >= bbox.minLat &&
        lat <= bbox.maxLat
      ) {
        return cityKey;
      }
    }
  }

  return null;
}

const buildPreciseTextSearchQuery = (
  trimmedQuery: string,
  detectedCityConfig: MajorCityConfig | null,
  proximity?: { longitude: number; latitude: number },
) => {
  const cityConfig =
    detectedCityConfig ??
    findCityConfigNearProximity(proximity) ??
    MAJOR_CITIES.kinshasa;
  const alreadyHasCity = findCityConfigInText(trimmedQuery);

  return alreadyHasCity
    ? `${trimmedQuery}, Congo-Kinshasa`
    : `${trimmedQuery}, ${cityConfig.name}, Congo-Kinshasa`;
};

const mapPlaceDetailsToSuggestion = (
  place: PlaceDetails,
  fallbackName: string,
): GoogleMapsSearchSuggestion | null => {
  const latitude = place.lat;
  const longitude = place.lng;

  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    isNaN(latitude) ||
    isNaN(longitude) ||
    !isFinite(latitude) ||
    !isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    !isInRdcBounds(latitude, longitude)
  ) {
    return null;
  }

  const label = readableLocation({ ...place, fallbackTitle: fallbackName });

  return {
    id: place.placeId,
    name: label.title,
    fullAddress: label.address,
    placeType: Array.isArray(place.types) && place.types.length > 0 ? place.types : ['geocode'],
    coordinates: {
      latitude,
      longitude,
    },
    context: {},
  };
};

const mergeSuggestions = (suggestions: GoogleMapsSearchSuggestion[]) => {
  const merged = new Map<string, GoogleMapsSearchSuggestion>();

  suggestions.forEach((suggestion) => {
    const key =
      suggestion.id ||
      `${normalizeSearchText(suggestion.name)}|${normalizeSearchText(suggestion.fullAddress)}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, suggestion);
      return;
    }

    merged.set(key, {
      ...existing,
      name: existing.name || suggestion.name,
      fullAddress: existing.fullAddress.length >= suggestion.fullAddress.length
        ? existing.fullAddress
        : suggestion.fullAddress,
      placeType: unique([...existing.placeType, ...suggestion.placeType]),
      coordinates: {
        latitude: existing.coordinates.latitude ?? suggestion.coordinates.latitude,
        longitude: existing.coordinates.longitude ?? suggestion.coordinates.longitude,
      },
      context: {
        ...suggestion.context,
        ...existing.context,
      },
    });
  });

  return Array.from(merged.values());
};

/* =====================================================
   SEARCH SUGGESTIONS
===================================================== */

export async function searchGoogleMapsPlaces(
  query: string,
  proximity?: { longitude: number; latitude: number },
  limit: number = 5,
): Promise<GoogleMapsSearchSuggestion[]> {
  if (!query?.trim()) return [];

  const trimmedQuery = query.trim().substring(0, 256);
  const validLimit = Math.min(Math.max(limit, 1), 10);
  const queryAnalysis = analyzeQuery(trimmedQuery);
  const detectedCityConfig = findCityConfigInText(trimmedQuery);
  const safeProximity = normalizeSearchProximity(proximity);
  const effectiveProximity =
    detectedCityConfig?.center ??
    safeProximity ??
    DEFAULT_PROXIMITY;

  try {
    const autocompletePromise = store.dispatch(
      googleMapsApi.endpoints.placesAutocomplete.initiate(
        {
          input: trimmedQuery,
          locationLat: effectiveProximity.latitude,
          locationLng: effectiveProximity.longitude,
          radius: 50000,
          region: 'cd',
          language: 'fr',
        },
        { subscribe: false },
      ),
    );

    const textSearchPromise = shouldRunPreciseTextSearch(queryAnalysis)
      ? store.dispatch(
          googleMapsApi.endpoints.placesSearch.initiate(
            {
              query: buildPreciseTextSearchQuery(trimmedQuery, detectedCityConfig, safeProximity ?? undefined),
              locationLat: effectiveProximity.latitude,
              locationLng: effectiveProximity.longitude,
              radius: 50000,
              language: 'fr',
            },
            { subscribe: false },
          ),
        )
      : Promise.resolve(null);

    const [autocompleteResult, textSearchResult] = await Promise.all([
      autocompletePromise,
      textSearchPromise,
    ]);

    if (autocompleteResult.error) {
      console.warn('Places autocomplete error:', autocompleteResult.error);
    }

    const autocompleteSuggestions: GoogleMapsSearchSuggestion[] =
      Array.isArray(autocompleteResult.data)
        ? autocompleteResult.data.map((prediction) => {
            const mainText = prediction.mainText || prediction.description || '';
            const secondaryText = prediction.secondaryText || '';
            const fullAddress = secondaryText
              ? `${mainText}, ${secondaryText}`
              : prediction.description || mainText;
            const label = readableLocation({ name: mainText, formattedAddress: fullAddress });

            return {
              id: prediction.placeId,
              name: label.title,
              fullAddress: label.address,
              placeType: ['geocode'],
              coordinates: {
                latitude: null,
                longitude: null,
              },
              context: {},
            };
          })
        : [];

    if (textSearchResult?.error) {
      console.warn('Places text search error:', textSearchResult.error);
    }

    const textSearchSuggestions: GoogleMapsSearchSuggestion[] =
      textSearchResult && Array.isArray(textSearchResult.data)
        ? textSearchResult.data
            .map((place) => mapPlaceDetailsToSuggestion(place, trimmedQuery))
            .filter((suggestion): suggestion is GoogleMapsSearchSuggestion => suggestion !== null)
            .slice(0, validLimit)
        : [];

    const suggestions = mergeSuggestions([
      ...textSearchSuggestions,
      ...autocompleteSuggestions,
    ]);

    return suggestions
      .sort((a, b) => {
        const weight = (s: GoogleMapsSearchSuggestion) => {
          let score = getTypeSpecificityScore(s);
          const detectedCity = detectCity(s);

          if (detectedCity) score += 3;
          if (detectedCity === 'kinshasa') score += 1;
          if (s.fullAddress && s.fullAddress.length > s.name.length + 10) score += 1;

          score += scoreSuggestionForQuery(s, queryAnalysis);

          return score;
        };

        return weight(b) - weight(a);
      })
      .slice(0, validLimit);
  } catch (error) {
    console.warn('Places search error:', error);
    return [];
  }
}

/* Retrieve details */

export async function getGoogleMapsPlaceDetails(
  placeId: string,
): Promise<GoogleMapsSearchSuggestion | null> {
  if (!placeId) return null;

  try {
    const result = await store.dispatch(
      googleMapsApi.endpoints.getPlaceDetails.initiate(
        {
          placeId,
          language: 'fr',
        },
        { subscribe: false },
      ),
    );

    if (result.error || !result.data) {
      console.warn('Place details error:', result.error);
      return null;
    }

    const place = result.data;

    if (
      isNaN(place.lat) ||
      isNaN(place.lng) ||
      !isFinite(place.lat) ||
      !isFinite(place.lng) ||
      place.lat < -90 ||
      place.lat > 90 ||
      place.lng < -180 ||
      place.lng > 180 ||
      !isInRdcBounds(place.lat, place.lng)
    ) {
      console.warn('Invalid coordinates from backend:', { lat: place.lat, lng: place.lng });
      return null;
    }

    const types = Array.isArray(place.types) ? place.types : [];
    const placeType = types.filter((type: string) =>
      !['geocode', 'establishment', 'point_of_interest'].includes(type),
    );
    const label = readableLocation(place);

    return {
      id: placeId,
      name: label.title,
      fullAddress: label.address,
      placeType: placeType.length > 0 ? placeType : ['geocode'],
      coordinates: {
        latitude: place.lat,
        longitude: place.lng,
      },
      context: {},
    };
  } catch (error) {
    console.warn('Place details error:', error);
    return null;
  }
}

export type MapboxSearchSuggestion = GoogleMapsSearchSuggestion;
export const searchMapboxPlaces = searchGoogleMapsPlaces;
export const getMapboxPlaceDetails = getGoogleMapsPlaceDetails;
