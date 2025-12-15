/**
 * Utility functions for route calculation and display
 */

import Constants from 'expo-constants';

type LatLng = { latitude: number; longitude: number };

export interface RouteInfo {
  coordinates: LatLng[];
  duration: number; // Duration in seconds
  distance: number; // Distance in meters
}

/**
 * Get route coordinates between two points using Mapbox Directions API
 * Falls back to straight line if API fails or token is not configured
 */
export async function getRouteCoordinates(
  origin: LatLng,
  destination: LatLng,
): Promise<LatLng[]> {
  const routeInfo = await getRouteInfo(origin, destination);
  return routeInfo.coordinates;
}

/**
 * Get complete route information (coordinates, duration, distance) using Mapbox Directions API
 * Falls back to straight line if API fails or token is not configured
 */
export async function getRouteInfo(
  origin: LatLng,
  destination: LatLng,
): Promise<RouteInfo> {
  try {
    // Get Mapbox access token from environment variables
    const extra = Constants.expoConfig?.extra || {};
    const accessToken = 
      extra.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || 
      process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

    if (!accessToken) {
      console.warn('Mapbox access token not configured. Using straight line.');
      // Fallback: calculate approximate distance and duration
      const distance = calculateDistance(origin, destination) * 1000; // Convert to meters
      const estimatedDuration = (distance / 1000) * 60; // Rough estimate: 1km = 1 minute
      return {
        coordinates: [origin, destination],
        duration: estimatedDuration,
        distance: distance,
      };
    }

    // Mapbox Directions API v5
    // Format: [longitude, latitude] for coordinates
    // Add overview=full to get detailed route information
    const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&overview=full&access_token=${accessToken}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Mapbox Directions API failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.code === 'Ok' && data.routes?.[0]) {
      const route = data.routes[0];
      // Mapbox returns coordinates as [longitude, latitude] arrays
      const coordinates = route.geometry?.coordinates as [number, number][] || [];
      const routeCoordinates = coordinates.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));

      return {
        coordinates: routeCoordinates.length > 0 ? routeCoordinates : [origin, destination],
        duration: route.duration || 0, // Duration in seconds
        distance: route.distance || 0, // Distance in meters
      };
    }

    if (data.code === 'NoRoute') {
      console.warn('No route found between points. Using straight line.');
      // Fallback: calculate approximate distance and duration
      const distance = calculateDistance(origin, destination) * 1000;
      const estimatedDuration = (distance / 1000) * 60;
      return {
        coordinates: [origin, destination],
        duration: estimatedDuration,
        distance: distance,
      };
    }

    throw new Error(`Mapbox Directions API error: ${data.code} - ${data.message || 'Unknown error'}`);
  } catch (error) {
    console.warn('Failed to fetch route, using straight line:', error);
    // Fallback: calculate approximate distance and duration
    const distance = calculateDistance(origin, destination) * 1000;
    const estimatedDuration = (distance / 1000) * 60;
    return {
      coordinates: [origin, destination],
      duration: estimatedDuration,
      distance: distance,
    };
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

