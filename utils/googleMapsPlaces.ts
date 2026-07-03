import { store } from '@/store';
import { googleMapsApi, type PlaceDetails } from '@/store/api/googleMapsApi';

/* =====================================================
   CONFIG
===================================================== */

const DEFAULT_PROXIMITY = {
  latitude: -4.325,
  longitude: 15.322,
};

const MAJOR_CITIES = {
  kinshasa: {
    name: 'Kinshasa',
    center: { latitude: -4.325, longitude: 15.322 },
    bbox: { minLng: 15.0, maxLng: 15.5, minLat: -4.6, maxLat: -4.2 },
    aliases: ['kinshasa', 'kin', 'kinsasa'],
  },
  lubumbashi: {
    name: 'Lubumbashi',
    center: { latitude: -11.664, longitude: 27.482 },
    bbox: { minLng: 27.3, maxLng: 27.7, minLat: -11.8, maxLat: -11.5 },
    aliases: ['lubumbashi', 'lubum', 'elizabethville'],
  },
  goma: {
    name: 'Goma',
    center: { latitude: -1.679, longitude: 29.228 },
    bbox: { minLng: 29.1, maxLng: 29.3, minLat: -1.75, maxLat: -1.6 },
    aliases: ['goma'],
  },
  bukavu: {
    name: 'Bukavu',
    center: { latitude: -2.49, longitude: 28.86 },
    bbox: { minLng: 28.8, maxLng: 28.95, minLat: -2.55, maxLat: -2.45 },
    aliases: ['bukavu', 'costermansville'],
  },
  matadi: {
    name: 'Matadi',
    center: { latitude: -5.817, longitude: 13.45 },
    bbox: { minLng: 13.3, maxLng: 13.6, minLat: -5.9, maxLat: -5.7 },
    aliases: ['matadi'],
  },
  kolwezi: {
    name: 'Kolwezi',
    center: { latitude: -10.716, longitude: 25.467 },
    bbox: { minLng: 25.3, maxLng: 25.6, minLat: -10.8, maxLat: -10.6 },
    aliases: ['kolwezi', 'kolwesi'],
  },
} as const;

type MajorCityConfig = typeof MAJOR_CITIES[keyof typeof MAJOR_CITIES];

const RDC_BBOX = { minLng: 12.0, maxLng: 31.3, minLat: -13.5, maxLat: 5.4 };

const GENERIC_ADDRESS_TERMS = new Set([
  'avenue',
  'av',
  'rue',
  'route',
  'boulevard',
  'bd',
  'place',
  'quartier',
  'q',
  'commune',
  'cite',
  'camp',
]);

const CONNECTOR_TERMS = new Set([
  'a',
  'au',
  'aux',
  'chez',
  'de',
  'des',
  'du',
  'en',
  'la',
  'le',
  'les',
  'sur',
]);

const KINSHASA_ADMIN_PHRASES = [
  'bandalungwa',
  'barumbu',
  'bumbu',
  'gombe',
  'kalamu',
  'kasa vubu',
  'kasavubu',
  'kimbanseke',
  'kinshasa',
  'kintambo',
  'kisenso',
  'lemba',
  'limete',
  'lingwala',
  'makala',
  'maluku',
  'masina',
  'matete',
  'mont ngafula',
  'mont ngaf',
  'ndjili',
  'n djili',
  'ngaba',
  'ngaliema',
  'ngiri ngiri',
  'nsele',
  'selembao',
];

/* =====================================================
   TYPES
===================================================== */

export interface GoogleMapsSearchSuggestion {
  id: string;
  name: string;
  fullAddress: string;
  placeType: string[];
  coordinates: {
    latitude: number | null;
    longitude: number | null;
  };
  context?: {
    country?: string;
    region?: string;
    district?: string;
    locality?: string;
    neighborhood?: string;
    postcode?: string;
  };
}

type QueryAnalysis = {
  normalizedQuery: string;
  allTerms: string[];
  specificTerms: string[];
  contextTerms: string[];
  genericTerms: string[];
  hasAddressIndicator: boolean;
  hasAdminQualifier: boolean;
};

/* =====================================================
   QUERY SCORING
===================================================== */

const normalizeSearchText = (value?: string | null) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const unique = (values: string[]) => Array.from(new Set(values));

const tokenize = (value: string) =>
  normalizeSearchText(value)
    .split(' ')
    .filter((term) => term.length >= 2 && !CONNECTOR_TERMS.has(term));

const containsAlias = (searchText: string, alias: string) => {
  const normalizedSearch = normalizeSearchText(searchText);
  const normalizedAlias = normalizeSearchText(alias);

  if (!normalizedSearch || !normalizedAlias) {
    return false;
  }

  if (normalizedAlias.length <= 3 && !normalizedAlias.includes(' ')) {
    return normalizedSearch.split(' ').includes(normalizedAlias);
  }

  return normalizedSearch.includes(normalizedAlias);
};

const getAdminTermsInQuery = (normalizedQuery: string) => {
  const adminTerms = new Set<string>();

  KINSHASA_ADMIN_PHRASES.forEach((phrase) => {
    const normalizedPhrase = normalizeSearchText(phrase);
    if (!normalizedPhrase || !normalizedQuery.includes(normalizedPhrase)) {
      return;
    }

    normalizedPhrase.split(' ').forEach((term) => adminTerms.add(term));
  });

  return adminTerms;
};

const analyzeQuery = (query: string): QueryAnalysis => {
  const normalizedQuery = normalizeSearchText(query);
  const allTerms = unique(tokenize(query));
  const adminTerms = getAdminTermsInQuery(normalizedQuery);
  const hasAddressIndicator = allTerms.some((term) => GENERIC_ADDRESS_TERMS.has(term));
  const hasAdminQualifier = adminTerms.size > 0;
  const genericTerms = allTerms.filter((term) => GENERIC_ADDRESS_TERMS.has(term));
  const candidateSpecificTerms = allTerms.filter(
    (term) => !GENERIC_ADDRESS_TERMS.has(term) && !adminTerms.has(term),
  );

  return {
    normalizedQuery,
    allTerms,
    specificTerms: candidateSpecificTerms.length > 0 ? candidateSpecificTerms : allTerms,
    contextTerms: candidateSpecificTerms.length > 0
      ? allTerms.filter((term) => adminTerms.has(term))
      : [],
    genericTerms,
    hasAddressIndicator,
    hasAdminQualifier,
  };
};

const getSuggestionSearchText = (suggestion: GoogleMapsSearchSuggestion) =>
  normalizeSearchText([
    suggestion.name,
    suggestion.fullAddress,
    suggestion.context?.neighborhood,
    suggestion.context?.locality,
    suggestion.context?.district,
    suggestion.context?.region,
    suggestion.context?.country,
  ].filter(Boolean).join(' '));

const termMatchesText = (text: string, term: string) =>
  text.split(' ').some((word) => word === term || word.startsWith(term) || term.startsWith(word));

const scoreSuggestionForQuery = (
  suggestion: GoogleMapsSearchSuggestion,
  queryAnalysis: QueryAnalysis,
) => {
  const searchText = getSuggestionSearchText(suggestion);
  const nameText = normalizeSearchText(suggestion.name);
  const addressText = normalizeSearchText(suggestion.fullAddress);
  let score = 0;

  if (queryAnalysis.normalizedQuery && searchText.includes(queryAnalysis.normalizedQuery)) {
    score += 30;
  }

  let matchedSpecificTerms = 0;
  queryAnalysis.specificTerms.forEach((term, index) => {
    if (termMatchesText(searchText, term)) {
      matchedSpecificTerms += 1;
      score += 10;
      if (termMatchesText(nameText, term)) score += 5;
      if (termMatchesText(addressText, term)) score += 2;
      if (index === 0) score += 3;
    } else if (queryAnalysis.specificTerms.length > 0) {
      score -= 8;
    }
  });

  if (queryAnalysis.specificTerms.length > 0 && matchedSpecificTerms === 0) {
    score -= 14;
  }

  queryAnalysis.contextTerms.forEach((term) => {
    score += termMatchesText(searchText, term) ? 3 : -1;
  });

  queryAnalysis.genericTerms.forEach((term) => {
    if (termMatchesText(searchText, term)) {
      score += 2;
    }
  });

  if (suggestion.coordinates.latitude !== null && suggestion.coordinates.longitude !== null) {
    score += 2;
  }

  return score;
};

const getTypeSpecificityScore = (suggestion: GoogleMapsSearchSuggestion) => {
  if (suggestion.placeType.includes('street_address')) return 6;
  if (suggestion.placeType.includes('premise')) return 6;
  if (suggestion.placeType.includes('route')) return 5;
  if (suggestion.placeType.includes('neighborhood')) return 4;
  if (suggestion.placeType.includes('sublocality')) return 3;
  if (suggestion.placeType.includes('locality')) return 2;
  if (suggestion.placeType.includes('administrative_area_level_1')) return 1;
  return 0;
};

const shouldRunPreciseTextSearch = (queryAnalysis: QueryAnalysis) =>
  queryAnalysis.normalizedQuery.length >= 6 &&
  (
    queryAnalysis.allTerms.length >= 3 ||
    (queryAnalysis.hasAddressIndicator && queryAnalysis.specificTerms.length >= 1) ||
    (queryAnalysis.hasAdminQualifier && queryAnalysis.specificTerms.length >= 1)
  );

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

  const formattedAddress = place.formattedAddress || '';

  return {
    id: place.placeId,
    name: place.name || formattedAddress.split(',')[0]?.trim() || fallbackName,
    fullAddress: formattedAddress || place.name || fallbackName,
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

            return {
              id: prediction.placeId,
              name: mainText,
              fullAddress,
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

/* =====================================================
   RETRIEVE DETAILS
===================================================== */

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
      place.lng > 180
    ) {
      console.warn('Invalid coordinates from backend:', { lat: place.lat, lng: place.lng });
      return null;
    }

    const types = Array.isArray(place.types) ? place.types : [];
    const placeType = types.filter((type: string) =>
      !['geocode', 'establishment', 'point_of_interest'].includes(type),
    );

    return {
      id: placeId,
      name: place.name || '',
      fullAddress: place.formattedAddress || '',
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
