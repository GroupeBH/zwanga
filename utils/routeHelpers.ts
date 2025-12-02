/**
 * Utility functions for route calculation and display
 */

import Constants from 'expo-constants';

type LatLng = { latitude: number; longitude: number };

/**
 * Decode Google Maps encoded polyline string to coordinates
 * @param encoded - Encoded polyline string from Google Directions API
 * @returns Array of coordinates
 */
function decodePolyline(encoded: string): LatLng[] {
  const poly: LatLng[] = [];
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

    poly.push({ latitude: lat * 1e-5, longitude: lng * 1e-5 });
  }
  return poly;
}

/**
 * Get route coordinates between two points using Google Directions API
 * Falls back to straight line if API fails or key is not configured
 */
export async function getRouteCoordinates(
  origin: LatLng,
  destination: LatLng,
): Promise<LatLng[]> {
  try {
    // Get API key from environment variables
    const extra = Constants.expoConfig?.extra || {};
    const apiKey = 
      extra.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.warn('Google Maps API key not configured. Using straight line.');
      return [origin, destination];
    }

    // Use Google Directions API
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Directions API failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'OK' && data.routes?.[0]?.overview_polyline?.points) {
      // Decode the polyline
      const encodedPolyline = data.routes[0].overview_polyline.points;
      return decodePolyline(encodedPolyline);
    }

    if (data.status === 'ZERO_RESULTS') {
      console.warn('No route found between points. Using straight line.');
      return [origin, destination];
    }

    throw new Error(`Directions API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
  } catch (error) {
    console.warn('Failed to fetch route, using straight line:', error);
    // Fallback to straight line
    return [origin, destination];
  }
}

/**
 * Calculate distance between two points in kilometers (Haversine formula)
 */
export function calculateDistance(point1: LatLng, point2: LatLng): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const dLon = ((point2.longitude - point1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.latitude * Math.PI) / 180) *
      Math.cos((point2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

