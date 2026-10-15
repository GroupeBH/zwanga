import type { MapStyleElement } from 'react-native-maps';

// Google Maps styling; Apple Maps retains its native appearance on iOS.
export const HOME_BASE_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#ECEFE9' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#78766F' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F5F5F0' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#BFDFE9' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
