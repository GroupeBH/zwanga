import type { MapStyleElement } from 'react-native-maps';

/** A calm neighborhood map; the provider's attribution remains visible. */
export const HOME_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#EDF0EA' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#797570' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#EDF0EA' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C0E4EE' }] },
];

export const HOME_MAP_PADDING = { top: 80, bottom: 32, left: 12, right: 12 };
