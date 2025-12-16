import Constants from 'expo-constants';

const mapboxToken =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

// Générer un session token unique pour cette session
// Le session token doit être réutilisé pour toutes les requêtes d'une même session de recherche
function generateSessionToken(): string {
  // Utiliser un timestamp + un nombre aléatoire pour créer un token unique
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// Stocker le session token actuel (généré une fois par session)
let currentSessionToken: string | null = null;

function getSessionToken(): string {
  if (!currentSessionToken) {
    currentSessionToken = generateSessionToken();
  }
  return currentSessionToken;
}

// Réinitialiser le session token (utile pour démarrer une nouvelle session de recherche)
export function resetSessionToken(): void {
  currentSessionToken = null;
}

export interface MapboxSearchSuggestion {
  id: string;
  name: string;
  fullAddress: string;
  placeType: string[];
  coordinates: {
    latitude: number;
    longitude: number;
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

export interface MapboxSearchResponse {
  suggestions: MapboxSearchSuggestion[];
}

/**
 * Recherche des suggestions de lieux via l'API Mapbox Search Box
 * @param query - Texte de recherche
 * @param proximity - Coordonnées pour prioriser les résultats proches (optionnel)
 * @param limit - Nombre maximum de résultats (par défaut: 5)
 * @returns Liste des suggestions
 */
export async function searchMapboxPlaces(
  query: string,
  proximity?: { longitude: number; latitude: number },
  limit: number = 5,
): Promise<MapboxSearchSuggestion[]> {
  if (!mapboxToken) {
    console.warn('Mapbox access token not configured');
    return [];
  }

  if (!query || query.trim().length === 0) {
    return [];
  }

  // Valider la proximité si fournie
  if (proximity) {
    if (
      typeof proximity.longitude !== 'number' ||
      typeof proximity.latitude !== 'number' ||
      isNaN(proximity.longitude) ||
      isNaN(proximity.latitude) ||
      !isFinite(proximity.longitude) ||
      !isFinite(proximity.latitude)
    ) {
      console.warn('Invalid proximity coordinates, ignoring proximity parameter');
      proximity = undefined;
    }
  }

  // Valider et limiter le nombre de résultats
  const validLimit = Math.min(Math.max(1, Math.floor(limit)), 10);

  try {
    const baseUrl = 'https://api.mapbox.com/search/searchbox/v1/suggest';
    let trimmedQuery = query.trim();
    
    // Valider que la requête n'est pas trop longue (limite Mapbox: ~256 caractères)
    if (trimmedQuery.length > 256) {
      trimmedQuery = trimmedQuery.substring(0, 256);
    }
    
    // Encoder correctement la requête avec URLSearchParams (gère automatiquement l'encodage)
    const params = new URLSearchParams();
    params.append('q', trimmedQuery);
    params.append('access_token', mapboxToken);
    params.append('session_token', getSessionToken()); // Ajouter le session token requis
    params.append('limit', validLimit.toString());
    params.append('language', 'fr');
    params.append('types', 'place,locality,neighborhood,address,poi');

    // Ajouter la proximité si disponible et valide
    if (proximity) {
      params.append('proximity', `${proximity.longitude},${proximity.latitude}`);
    }

    const url = `${baseUrl}?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.warn(`Mapbox Search API failed: ${response.status} - ${errorText}`);
      throw new Error(`Mapbox Search API failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.suggestions || !Array.isArray(data.suggestions)) {
      return [];
    }

    // Transformer les suggestions de Mapbox en format standardisé
    return data.suggestions.map((suggestion: any) => {
      const [longitude, latitude] = suggestion.feature?.geometry?.coordinates || [0, 0];
      const properties = suggestion.feature?.properties || {};
      const context = suggestion.feature?.properties?.context || {};

      // Construire l'adresse complète
      const addressParts = [
        properties.name,
        context.neighborhood?.name,
        context.locality?.name,
        context.district?.name,
        context.region?.name,
        context.country?.name,
      ].filter(Boolean);

      return {
        id: suggestion.mapbox_id || suggestion.id || `suggestion-${Date.now()}-${Math.random()}`,
        name: properties.name || suggestion.name || query,
        fullAddress: addressParts.join(', ') || properties.full_address || suggestion.full_address || '',
        placeType: properties.category || suggestion.place_type || [],
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
    });
  } catch (error: any) {
    // Ne logger que les erreurs non-400 (bad request) et non liées au session token pour éviter le spam
    const errorMessage = error?.message || '';
    if (errorMessage && 
        !errorMessage.includes('400') && 
        !errorMessage.includes('Session Token')) {
      console.warn('Erreur lors de la recherche Mapbox:', errorMessage);
    }
    return [];
  }
}

/**
 * Récupère les détails complets d'une suggestion via son ID
 * @param suggestionId - ID de la suggestion Mapbox
 * @returns Détails complets du lieu
 */
export async function getMapboxPlaceDetails(suggestionId: string): Promise<MapboxSearchSuggestion | null> {
  if (!mapboxToken) {
    console.warn('Mapbox access token not configured');
    return null;
  }

  try {
    const baseUrl = 'https://api.mapbox.com/search/searchbox/v1/retrieve';
    const params = new URLSearchParams({
      id: suggestionId,
      access_token: mapboxToken,
      session_token: getSessionToken(), // Utiliser le même session token que pour les suggestions
    });

    const url = `${baseUrl}?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Mapbox Retrieve API failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      return null;
    }

    const feature = data.features[0];
    const [longitude, latitude] = feature.geometry?.coordinates || [0, 0];
    const properties = feature.properties || {};
    const context = properties.context || {};

    const addressParts = [
      properties.name,
      context.neighborhood?.name,
      context.locality?.name,
      context.district?.name,
      context.region?.name,
      context.country?.name,
    ].filter(Boolean);

    return {
      id: suggestionId,
      name: properties.name || '',
      fullAddress: addressParts.join(', ') || properties.full_address || '',
      placeType: properties.category || [],
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
    console.warn('Erreur lors de la récupération des détails Mapbox:', error);
    return null;
  }
}

