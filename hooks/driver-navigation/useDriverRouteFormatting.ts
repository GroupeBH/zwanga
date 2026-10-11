import { decodeSafePolyline } from '@/utils/routes/safePolyline';
import { RouteCoordinate } from '../../features/driver-navigation/navigationModel';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';



export function useDriverRouteFormatting() {
  const decodePolyline = (encoded: string): RouteCoordinate[] => decodeSafePolyline(
    encoded, 200, point => normalizeTripMapCoordinate(point.latitude, point.longitude),
  );

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
