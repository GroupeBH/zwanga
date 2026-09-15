import { RouteCoordinate } from '../../features/driver-navigation/navigationModel';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';



export function useDriverRouteFormatting() {
  const decodePolyline = (encoded: string): RouteCoordinate[] => {
    const allPoints: RouteCoordinate[] = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
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

      const coordinate = normalizeTripMapCoordinate(lat / 1e5, lng / 1e5);
      if (!coordinate) {
        return [];
      }

      allPoints.push(coordinate);
    }

    // Simplifier le polyline pour économiser la mémoire (max 200 points)
    const maxPoints = 200;
    if (allPoints.length <= maxPoints) {
      return allPoints;
    }
    
    const step = Math.ceil(allPoints.length / maxPoints);
    const simplified: RouteCoordinate[] = [];
    for (let i = 0; i < allPoints.length; i += step) {
      simplified.push(allPoints[i]);
    }
    // Toujours inclure le dernier point
    if (simplified[simplified.length - 1] !== allPoints[allPoints.length - 1]) {
      simplified.push(allPoints[allPoints.length - 1]);
    }
    
    return simplified;
  };

  // Obtenir l'icône de manœuvre
  const getManeuverIcon = (maneuver?: string): string => {
    if (!maneuver) return 'arrow-up';
    
    const maneuverMap: Record<string, string> = {
      'turn-left': 'arrow-back',
      'turn-right': 'arrow-forward',
      'turn-slight-left': 'arrow-back',
      'turn-slight-right': 'arrow-forward',
      'turn-sharp-left': 'arrow-back',
      'turn-sharp-right': 'arrow-forward',
      'uturn-left': 'return-up-back',
      'uturn-right': 'return-up-forward',
      'straight': 'arrow-up',
      'ramp-left': 'arrow-back',
      'ramp-right': 'arrow-forward',
      'merge': 'git-merge',
      'fork-left': 'git-branch',
      'fork-right': 'git-branch',
      'roundabout-left': 'refresh',
      'roundabout-right': 'refresh',
    };

    return maneuverMap[maneuver] || 'arrow-up';
  };

  return {
    decodePolyline,
    getManeuverIcon,
  };
}
