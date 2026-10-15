import React from 'react';
import { View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { HOME_MAP_PROVIDER, USER_LOCATION_MARKER_ANCHOR } from '@/features/home/homeMapPolicy';
import { styles } from '@/features/home/HomeMap.styles';
import { HOME_BASE_MAP_STYLE } from '@/features/home/homeBaseMapStyle';
import type { useHomeMap } from '@/hooks/home/useHomeMap';

const userMarkerImage = require('@/assets/images/map-markers/user-location-marker.png');
const mapPadding = { top: 0, right: 0, bottom: 32, left: 0 };
type Props = Pick<ReturnType<typeof useHomeMap>,
  'attachHomeMap' | 'onHomeMapReady' | 'onHomeMapLayout' | 'mapRegion' | 'userCoordinate'>
  & { shouldRenderHomeMap: boolean };

// One static native image, no custom marker snapshots, callouts or trip markers.
export const HomeMap = React.memo(function HomeMap({ shouldRenderHomeMap, attachHomeMap,
  onHomeMapReady, onHomeMapLayout, mapRegion, userCoordinate }: Props) {
  if (!shouldRenderHomeMap) return <View style={styles.map} />;
  return <MapView
    ref={attachHomeMap}
    onMapReady={onHomeMapReady}
    onLayout={onHomeMapLayout}
    provider={HOME_MAP_PROVIDER}
    style={styles.map}
    initialRegion={mapRegion}
    customMapStyle={HOME_BASE_MAP_STYLE}
    mapPadding={mapPadding}
    showsCompass={false}
    showsTraffic={false}
    showsBuildings={false}
    showsIndoors={false}
    showsPointsOfInterest={false}
    showsUserLocation={false}
    showsMyLocationButton={false}
    moveOnMarkerPress={false}
    toolbarEnabled={false}
    rotateEnabled={false}
    pitchEnabled={false}
  >
    {userCoordinate && <Marker
      identifier="home-user-location"
      coordinate={userCoordinate}
      image={userMarkerImage}
      anchor={USER_LOCATION_MARKER_ANCHOR}
      tracksViewChanges={false}
      tappable={false}
    />}
  </MapView>;
});
