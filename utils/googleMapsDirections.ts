import Constants from 'expo-constants';

const googleMapsApiKey =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export interface RouteCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Obtient les coordonnées de l'itinéraire entre deux points en utilisant l'API Directions de Google Maps
 * @param start Coordonnées de départ
 * @param end Coordonnées d'arrivée
 * @returns Tableau de coordonnées représentant l'itinéraire, ou null en cas d'erreur
 */
export async function getRouteCoordinates(
  start: RouteCoordinates,
  end: RouteCoordinates,
): Promise<RouteCoordinates[] | null> {
  if (!googleMapsApiKey) {
    console.warn('Google Maps API key not available for directions');
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
    // Google Maps Directions API format: latitude,longitude
    const origin = `${start.latitude},${start.longitude}`;
    const destination = `${end.latitude},${end.longitude}`;
    
    const url = `https://maps.googleapis.com/maps/api/directions/json?` +
      `origin=${origin}&` +
      `destination=${destination}&` +
      `key=${googleMapsApiKey}&` +
      `mode=driving&` +
      `alternatives=false`;

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Google Maps Directions API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.routes || !Array.isArray(data.routes) || data.routes.length === 0) {
      console.warn('No routes found in Google Maps Directions response:', data.status);
      return null;
    }

    // Prendre le premier itinéraire (le plus rapide/optimal)
    const route = data.routes[0];
    if (!route.overview_polyline || !route.overview_polyline.points) {
      console.warn('No polyline in route');
      return null;
    }

    // Décoder la polyline encodée de Google Maps
    const coordinates = decodePolyline(route.overview_polyline.points);
    
    return coordinates.map(([latitude, longitude]) => {
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
    console.warn('Error fetching directions from Google Maps:', error);
    return null;
  }
}

/**
 * Décode une polyline encodée de Google Maps
 * @param encoded Polyline encodée
 * @returns Tableau de coordonnées [latitude, longitude][]
 */
function decodePolyline(encoded: string): [number, number][] {
  const poly: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push([lat * 1e-5, lng * 1e-5]);
  }

  return poly;
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

