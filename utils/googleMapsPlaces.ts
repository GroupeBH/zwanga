import { store } from '@/store';
import { googleMapsApi } from '@/store/api/googleMapsApi';

/* =====================================================
   CONFIG
===================================================== */

// Proximité par défaut : Kinshasa
const DEFAULT_PROXIMITY = {
  latitude: -4.325,
  longitude: 15.322,
};

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
function detectCity(suggestion: GoogleMapsSearchSuggestion): string | null {
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

/* =====================================================
   SEARCH SUGGESTIONS (Autocomplete)
===================================================== */

export async function searchGoogleMapsPlaces(
  query: string,
  proximity?: { longitude: number; latitude: number },
  limit: number = 5,
): Promise<GoogleMapsSearchSuggestion[]> {
  if (!query?.trim()) return [];

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
    // Utiliser le backend pour obtenir les suggestions
    const result = await store.dispatch(
      googleMapsApi.endpoints.placesAutocomplete.initiate({
        input: trimmedQuery,
        locationLat: effectiveProximity.latitude,
        locationLng: effectiveProximity.longitude,
        radius: 50000, // 50km radius
        region: 'cd', // RDC
        language: 'fr',
      })
    );

    if (result.error || !result.data) {
      console.warn('Places autocomplete error:', result.error);
      return [];
    }

    if (!Array.isArray(result.data) || result.data.length === 0) {
      return [];
    }

    // Convertir les prédictions en format unifié
    const suggestions: GoogleMapsSearchSuggestion[] = result.data.map((prediction) => {
      // Extraire les composants de l'adresse
      const mainText = prediction.mainText || prediction.description || '';
      const secondaryText = prediction.secondaryText || '';
      const fullAddress = secondaryText ? `${mainText}, ${secondaryText}` : prediction.description || mainText;

      return {
        id: prediction.placeId,
        name: mainText,
        fullAddress: fullAddress,
        placeType: ['geocode'], // Le backend ne retourne pas les types, on utilise geocode par défaut
        coordinates: {
          latitude: null, // Sera rempli lors de getPlaceDetails
          longitude: null,
        },
        context: {
          // Les détails complets seront obtenus via getPlaceDetails
        },
      };
    });

    // Prioriser les résultats
    return suggestions
      .sort((a, b) => {
        const weight = (s: GoogleMapsSearchSuggestion) => {
          let score = 0;
          
          // Prioriser les résultats les plus spécifiques
          if (s.placeType.includes('street_address')) score += 6;
          else if (s.placeType.includes('route')) score += 5;
          else if (s.placeType.includes('neighborhood')) score += 4;
          else if (s.placeType.includes('sublocality')) score += 3;
          else if (s.placeType.includes('locality')) score += 2;
          else if (s.placeType.includes('administrative_area_level_1')) score += 1;
          
          // Bonus pour les villes majeures
          const detectedCity = detectCity(s);
          if (detectedCity) {
            score += 3;
          }
          
          if (detectedCity === 'kinshasa') {
            score += 1;
          }
          
          // Bonus pour adresse complète
          if (s.fullAddress && s.fullAddress.length > s.name.length + 10) {
            score += 1;
          }
          
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
   RETRIEVE DETAILS (coordonnées finales)
===================================================== */

export async function getGoogleMapsPlaceDetails(
  placeId: string,
): Promise<GoogleMapsSearchSuggestion | null> {
  if (!placeId) return null;

  try {
    // Utiliser le backend pour obtenir les détails du lieu
    const result = await store.dispatch(
      googleMapsApi.endpoints.getPlaceDetails.initiate({
        placeId,
        language: 'fr',
      })
    );

    if (result.error || !result.data) {
      console.warn('Place details error:', result.error);
      return null;
    }

    const place = result.data;

    // Valider les coordonnées
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

    // Extraire les types de lieu
    const types = Array.isArray(place.types) ? place.types : [];
    const placeType = types.filter((t: string) => 
      !['geocode', 'establishment', 'point_of_interest'].includes(t)
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
      context: {
        // Le backend ne retourne pas les composants d'adresse détaillés
        // On peut les extraire du formattedAddress si nécessaire
      },
    };
  } catch (error) {
    console.warn('Place details error:', error);
    return null;
  }
}

// Alias pour compatibilité avec l'ancien code
export type MapboxSearchSuggestion = GoogleMapsSearchSuggestion;
export const searchMapboxPlaces = searchGoogleMapsPlaces;
export const getMapboxPlaceDetails = getGoogleMapsPlaceDetails;

