import { store } from '@/store';
import { isMapboxConfigured, mapboxApi } from '@/store/api/mapboxApi';

/* =====================================================
   CONFIG
===================================================== */

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

// Configuration des villes principales de la RDC pour améliorer la précision
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
    center: { latitude: -2.490, longitude: 28.860 },
    bbox: { minLng: 28.8, maxLng: 28.95, minLat: -2.55, maxLat: -2.45 },
    aliases: ['bukavu', 'costermansville'],
  },
  matadi: {
    name: 'Matadi',
    center: { latitude: -5.817, longitude: 13.450 },
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

// Fonction pour détecter si une suggestion appartient à une ville majeure
function detectCity(suggestion: MapboxSearchSuggestion): string | null {
  const locality = suggestion.context?.locality?.toLowerCase() || '';
  const region = suggestion.context?.region?.toLowerCase() || '';
  const name = suggestion.name?.toLowerCase() || '';
  const fullAddress = suggestion.fullAddress?.toLowerCase() || '';
  
  const searchText = `${locality} ${region} ${name} ${fullAddress}`;
  
  for (const [cityKey, cityConfig] of Object.entries(MAJOR_CITIES)) {
    // Vérifier les alias et le nom de la ville
    if (cityConfig.aliases.some(alias => searchText.includes(alias))) {
      return cityKey;
    }
    
    // Vérifier les coordonnées dans la bounding box de la ville
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
  if (!isMapboxConfigured() || !query?.trim()) return [];

  const trimmedQuery = query.trim().substring(0, 256);
  const validLimit = Math.min(Math.max(limit, 1), 10);

  // Détecter si la requête mentionne une ville majeure
  const queryLower = trimmedQuery.toLowerCase();
  let detectedCityConfig: typeof MAJOR_CITIES[keyof typeof MAJOR_CITIES] | null = null;
  
  for (const cityConfig of Object.values(MAJOR_CITIES)) {
    if (cityConfig.aliases.some(alias => queryLower.includes(alias))) {
      detectedCityConfig = cityConfig;
      break;
    }
  }

  // Utiliser la proximité de la ville détectée, ou celle fournie, ou la valeur par défaut
  const effectiveProximity = 
    detectedCityConfig?.center ?? 
    proximity ?? 
    DEFAULT_PROXIMITY;

  try {
    const request = store.dispatch(
      mapboxApi.endpoints.suggestPlaces.initiate(
        {
          query: trimmedQuery,
          sessionToken: getSessionToken(),
          limit: validLimit,
          language: 'fr',
          country: RDC_COUNTRY_CODE,
          bbox: RDC_BBOX,
          types: 'address,street,neighborhood,district,locality,place,poi',
          proximity: `${effectiveProximity.longitude},${effectiveProximity.latitude}`,
        },
        { forceRefetch: true, subscribe: false },
      ),
    );
    let data: any;
    try {
      data = await request.unwrap();
    } finally {
      request.unsubscribe();
    }
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
         PRIORISATION (UX) - Favoriser les résultats détaillés et les villes majeures
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
          
          // Bonus pour les villes majeures de la RDC
          const detectedCity = detectCity(s);
          if (detectedCity) {
            score += 3; // Bonus significatif pour les villes majeures
          }
          
          // Bonus supplémentaire pour Kinshasa (ville principale)
          if (detectedCity === 'kinshasa') {
            score += 1; // Bonus supplémentaire pour Kinshasa
          }
          
          // Bonus pour les résultats avec contexte complet (locality, neighborhood, etc.)
          const hasCompleteContext = 
            s.context?.locality && 
            (s.context?.neighborhood || s.context?.district);
          if (hasCompleteContext) {
            score += 2; // Bonus pour contexte détaillé
          }
          
          // Bonus pour les résultats avec nom complet et adresse détaillée
          if (s.fullAddress && s.fullAddress.length > s.name.length + 10) {
            score += 1; // Bonus pour adresse complète
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
  if (!isMapboxConfigured()) return null;

  try {
    const request = store.dispatch(
      mapboxApi.endpoints.retrievePlace.initiate(
        {
          suggestionId,
          sessionToken: getSessionToken(),
        },
        { forceRefetch: true, subscribe: false },
      ),
    );
    let data: any;
    try {
      data = await request.unwrap();
    } finally {
      request.unsubscribe();
    }
    const feature = data?.features?.[0];
    if (!feature?.geometry?.coordinates) return null;

    const coords = feature.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    
    const [longitude, latitude] = coords;
    
    // Valider les coordonnées
    if (
      typeof longitude !== 'number' ||
      typeof latitude !== 'number' ||
      isNaN(longitude) ||
      isNaN(latitude) ||
      !isFinite(longitude) ||
      !isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      console.warn('Invalid coordinates from Mapbox retrieve:', { longitude, latitude });
      return null;
    }

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
