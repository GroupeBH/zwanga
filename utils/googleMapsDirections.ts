import { store } from '@/store';
import { googleMapsApi, TravelMode } from '@/store/api/googleMapsApi';

export interface RouteCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Décode une polyline encodée de Google Maps
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
 * Obtient les coordonnées de l'itinéraire entre deux points en utilisant le backend
 * @param start Coordonnées de départ
 * @param end Coordonnées d'arrivée
 * @returns Tableau de coordonnées représentant l'itinéraire, ou null en cas d'erreur
 */
export async function getRouteCoordinates(
  start: RouteCoordinates,
  end: RouteCoordinates,
): Promise<RouteCoordinates[] | null> {
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
    // Utiliser le backend pour obtenir les directions via RTK Query
    const result = await store.dispatch(
      googleMapsApi.endpoints.getDirections.initiate({
        origin: {
          lat: start.latitude,
          lng: start.longitude,
        },
        destination: {
          lat: end.latitude,
          lng: end.longitude,
        },
        mode: TravelMode.DRIVING,
        alternatives: false,
      })
    );

    if (result.error || !result.data || !result.data.routes || result.data.routes.length === 0) {
      console.warn('No routes found from backend:', result.error || result.data?.status);
      return null;
    }

    // Prendre le premier itinéraire (le plus rapide/optimal)
    const route = result.data.routes[0];
    if (!route.overviewPolyline) {
      console.warn('No polyline in route');
      return null;
    }

    // Décoder la polyline encodée de Google Maps
    const coordinates = decodePolyline(route.overviewPolyline);
    
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
    console.warn('Error fetching directions from backend:', error);
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

