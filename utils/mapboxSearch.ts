import Constants from 'expo-constants';

/* =====================================================
   CONFIG
===================================================== */

const mapboxToken =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

// Proximité par défaut : Kinshasa
const DEFAULT_PROXIMITY = {
  latitude: -4.325,
  longitude: 15.322,
};

// Bounding box de la République Démocratique du Congo
// Format: [longitude ouest, latitude sud, longitude est, latitude nord]
const RDC_BBOX = '12.0,-13.5,31.3,5.4';

// Code ISO du pays pour la RDC
const RDC_COUNTRY_CODE = 'cd';

/* =====================================================
   SESSION TOKEN (obligatoire Mapbox Search Box)
===================================================== */

function generateSessionToken(): string {
  return `session-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 15)}`;
}

let currentSessionToken: string | null = null;

function getSessionToken(): string {
  if (!currentSessionToken) {
    currentSessionToken = generateSessionToken();
  }
  return currentSessionToken;
}

export function resetSessionToken(): void {
  currentSessionToken = null;
}

/* =====================================================
   TYPES
===================================================== */

export interface MapboxSearchSuggestion {
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

/* =====================================================
   SEARCH SUGGESTIONS
===================================================== */

export async function searchMapboxPlaces(
  query: string,
  proximity?: { longitude: number; latitude: number },
  limit: number = 5,
): Promise<MapboxSearchSuggestion[]> {
  if (!mapboxToken || !query?.trim()) return [];

  const trimmedQuery = query.trim().substring(0, 256);
  const effectiveProximity = proximity ?? DEFAULT_PROXIMITY;
  const validLimit = Math.min(Math.max(limit, 1), 10);

  try {
    const params = new URLSearchParams();
    params.append('q', trimmedQuery);
    params.append('access_token', mapboxToken);
    params.append('session_token', getSessionToken());
    params.append('limit', validLimit.toString());
    params.append('language', 'fr');

    // 🔒 RESTRICTION GÉOGRAPHIQUE : République Démocratique du Congo uniquement
    params.append('country', RDC_COUNTRY_CODE);
    params.append('bbox', RDC_BBOX);

    // Types de lieux détaillés : adresses, rues/avenues, quartiers, districts, localités, POI
    // Inclut tous les types pertinents pour obtenir des résultats précis à Kinshasa
    params.append(
      'types',
      'address,street,neighborhood,district,locality,place,poi',
    );

    params.append(
      'proximity',
      `${effectiveProximity.longitude},${effectiveProximity.latitude}`,
    );

    const url = `https://api.mapbox.com/search/searchbox/v1/suggest?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.warn('Mapbox suggest error:', response.status);
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data?.suggestions)) return [];

    return data.suggestions
      .map((s: any) => {
        const feature = s.feature ?? {};
        const context = feature.properties?.context ?? {};
        const coords = feature.geometry?.coordinates ?? [];

        const [longitude, latitude] =
          Array.isArray(coords) && coords.length >= 2
            ? coords
            : [null, null];

        const addressParts = [
          feature.properties?.name,
          context.neighborhood?.name,
          context.locality?.name,
          context.district?.name,
          context.region?.name,
          context.country?.name,
        ].filter(Boolean);

        return {
          id: s.mapbox_id ?? s.id,
          name: feature.properties?.name ?? s.name ?? trimmedQuery,
          fullAddress:
            addressParts.join(', ') ??
            feature.properties?.full_address ??
            '',
          placeType:
            feature.properties?.category ??
            s.place_type ??
            [],
          coordinates: {
            latitude,
            longitude,
          },
          context: {
            country: context.country?.name,
            region: context.region?.name,
            district: context.district?.name,
            locality: context.locality?.name,
            neighborhood: context.neighborhood?.name,
            postcode: context.postcode?.name,
          },
        };
      })

      /* =============================
         FILTRAGE GÉOGRAPHIQUE (RDC uniquement)
      ============================== */
      .filter((s: MapboxSearchSuggestion) => {
        // Vérifier que le résultat a un ID et un nom
        if (!s.id || !s.name) return false;

        // Vérifier que le pays est bien la RDC (si disponible)
        if (s.context?.country) {
          const countryLower = s.context.country.toLowerCase();
          const rdcNames = ['république démocratique du congo', 'democratic republic of the congo', 'rdc', 'congo (kinshasa)', 'congo-kinshasa'];
          const isRDC = rdcNames.some(name => countryLower.includes(name.toLowerCase()));
          if (!isRDC && countryLower !== 'congo') {
            return false;
          }
        }

        // Vérifier que les coordonnées sont dans la bounding box de la RDC
        if (s.coordinates.latitude !== null && s.coordinates.longitude !== null) {
          const lat = s.coordinates.latitude;
          const lng = s.coordinates.longitude;
          // RDC bbox: [12.0, -13.5, 31.3, 5.4] (ouest, sud, est, nord)
          if (lng < 12.0 || lng > 31.3 || lat < -13.5 || lat > 5.4) {
            return false;
          }
        }

        return true;
      })

      /* =============================
         PRIORISATION (UX) - Favoriser les résultats détaillés et Kinshasa
      ============================== */
      .sort((a: any, b: any) => {
        const weight = (s: MapboxSearchSuggestion) => {
          let score = 0;
          
          // Prioriser les résultats les plus spécifiques et détaillés
          if (s.placeType.includes('address')) score += 6; // Adresses spécifiques (plus précis)
          else if (s.placeType.includes('street')) score += 5; // Rues et avenues (très pertinent)
          else if (s.placeType.includes('neighborhood')) score += 4; // Quartiers (pertinent)
          else if (s.placeType.includes('district')) score += 3; // Districts (pertinent)
          else if (s.placeType.includes('poi')) score += 2; // Points d'intérêt (lieux spécifiques)
          else if (s.placeType.includes('place')) score += 1; // Lieux génériques
          // locality n'ajoute pas de score (moins prioritaire)
          
          // Bonus pour les résultats à Kinshasa (vérifier dans le contexte)
          const locality = s.context?.locality?.toLowerCase() || '';
          const region = s.context?.region?.toLowerCase() || '';
          if (locality.includes('kinshasa') || region.includes('kinshasa')) {
            score += 2; // Bonus pour Kinshasa
          }
          
          // Bonus pour les résultats proches de Kinshasa (si coordonnées disponibles)
          if (s.coordinates.latitude !== null && s.coordinates.longitude !== null) {
            const lat = s.coordinates.latitude;
            const lng = s.coordinates.longitude;
            // Vérifier si dans la zone de Kinshasa (approximative)
            // Kinshasa bbox approximative: [15.0, -4.6, 15.5, -4.2]
            if (lng >= 15.0 && lng <= 15.5 && lat >= -4.6 && lat <= -4.2) {
              score += 1; // Bonus pour proximité géographique
            }
          }
          
          return score;
        };
        return weight(b) - weight(a);
      });
  } catch (error) {
    console.warn('Mapbox search error:', error);
    return [];
  }
}

/* =====================================================
   RETRIEVE DETAILS (coordonnées finales)
===================================================== */

export async function getMapboxPlaceDetails(
  suggestionId: string,
): Promise<MapboxSearchSuggestion | null> {
  if (!mapboxToken) return null;

  try {
    const params = new URLSearchParams({
      id: suggestionId,
      access_token: mapboxToken,
      session_token: getSessionToken(),
    });

    const url = `https://api.mapbox.com/search/searchbox/v1/retrieve?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) return null;

    const data = await response.json();
    const feature = data?.features?.[0];
    if (!feature?.geometry?.coordinates) return null;

    const [longitude, latitude] = feature.geometry.coordinates;

    const context = feature.properties?.context ?? {};
    const addressParts = [
      feature.properties?.name,
      context.neighborhood?.name,
      context.locality?.name,
      context.district?.name,
      context.region?.name,
      context.country?.name,
    ].filter(Boolean);

    return {
      id: suggestionId,
      name: feature.properties?.name ?? '',
      fullAddress: addressParts.join(', '),
      placeType: feature.properties?.category ?? [],
      coordinates: {
        latitude,
        longitude,
      },
      context: {
        country: context.country?.name,
        region: context.region?.name,
        district: context.district?.name,
        locality: context.locality?.name,
        neighborhood: context.neighborhood?.name,
        postcode: context.postcode?.name,
      },
    };
  } catch (error) {
    console.warn('Mapbox retrieve error:', error);
    return null;
  }
}
