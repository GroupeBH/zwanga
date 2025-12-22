import Constants from 'expo-constants';

const mapboxToken =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

export interface RouteCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Obtient les coordonnées de l'itinéraire entre deux points en utilisant l'API Directions de Mapbox
 * @param start Coordonnées de départ
 * @param end Coordonnées d'arrivée
 * @returns Tableau de coordonnées représentant l'itinéraire, ou null en cas d'erreur
 */
export async function getRouteCoordinates(
  start: RouteCoordinates,
  end: RouteCoordinates,
): Promise<RouteCoordinates[] | null> {
  if (!mapboxToken) {
    console.warn('Mapbox token not available for directions');
    return null;
  }

  // Valider les coordonnées
  if (
    typeof start.latitude !== 'number' ||
    typeof start.longitude !== 'number' ||
    typeof end.latitude !== 'number' ||
    typeof end.longitude !== 'number' ||
    isNaN(start.latitude) ||
    isNaN(start.longitude) ||
    isNaN(end.latitude) ||
    isNaN(end.longitude) ||
    !isFinite(start.latitude) ||
    !isFinite(start.longitude) ||
    !isFinite(end.latitude) ||
    !isFinite(end.longitude) ||
    start.latitude < -90 ||
    start.latitude > 90 ||
    start.longitude < -180 ||
    start.longitude > 180 ||
    end.latitude < -90 ||
    end.latitude > 90 ||
    end.longitude < -180 ||
    end.longitude > 180
  ) {
    console.warn('Invalid coordinates for directions:', { start, end });
    return null;
  }

  try {
    // Format: longitude,latitude pour Mapbox
    const coordinates = `${start.longitude},${start.latitude};${end.longitude},${end.latitude}`;
    
    // Utiliser le profil "driving" pour les trajets en voiture
    // Alternatives: walking, cycling, driving-traffic
    const profile = 'driving';
    
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?` +
      `geometries=geojson&` +
      `access_token=${mapboxToken}&` +
      `overview=full&` +
      `alternatives=false&` +
      `steps=false`;

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Mapbox Directions API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.routes || !Array.isArray(data.routes) || data.routes.length === 0) {
      console.warn('No routes found in Mapbox Directions response');
      return null;
    }

    // Prendre le premier itinéraire (le plus rapide/optimal)
    const route = data.routes[0];
    if (!route.geometry || !route.geometry.coordinates) {
      console.warn('No geometry in route');
      return null;
    }

    // Convertir les coordonnées [longitude, latitude] en {latitude, longitude}
    const coordinatesArray = route.geometry.coordinates as [number, number][];
    
    return coordinatesArray.map(([longitude, latitude]) => {
      // Valider chaque coordonnée
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
        longitude > 180
      ) {
        return null;
      }
      return { latitude, longitude };
    }).filter((coord): coord is RouteCoordinates => coord !== null);
  } catch (error) {
    console.warn('Error fetching directions from Mapbox:', error);
    return null;
  }
}

/**
 * Cache simple pour éviter trop d'appels API pour les mêmes itinéraires
 */
const routeCache = new Map<string, RouteCoordinates[] | null>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCacheKey(start: RouteCoordinates, end: RouteCoordinates): string {
  // Arrondir les coordonnées pour permettre un cache plus efficace
  const roundCoord = (coord: number, precision: number = 4) => {
    return Math.round(coord * Math.pow(10, precision)) / Math.pow(10, precision);
  };
  return `${roundCoord(start.latitude)}_${roundCoord(start.longitude)}_${roundCoord(end.latitude)}_${roundCoord(end.longitude)}`;
}

/**
 * Obtient les coordonnées de l'itinéraire avec cache
 */
export async function getCachedRouteCoordinates(
  start: RouteCoordinates,
  end: RouteCoordinates,
): Promise<RouteCoordinates[] | null> {
  const cacheKey = getCacheKey(start, end);
  const cached = routeCache.get(cacheKey);
  
  if (cached !== undefined) {
    return cached;
  }

  const route = await getRouteCoordinates(start, end);
  
  // Mettre en cache même si null (pour éviter de réessayer immédiatement)
  routeCache.set(cacheKey, route);
  
  // Nettoyer le cache après la durée spécifiée
  setTimeout(() => {
    routeCache.delete(cacheKey);
  }, CACHE_DURATION);

  return route;
}

