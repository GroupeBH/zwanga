import React from 'react';
import { Text, View } from 'react-native';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import MapView, { Marker } from 'react-native-maps';
import { HOME_MAP_PROVIDER, IS_ANDROID, USER_LOCATION_MARKER_ANCHOR } from '@/features/home/homeMapPolicy';
import { HOME_MAP_PADDING, HOME_MAP_STYLE } from '@/features/home/homeMapAppearance';
import { styles } from '@/features/home/HomeMap.styles';
import type { useHomeLocation } from '@/hooks/home/useHomeLocation';
import type { useHomeMap } from '@/hooks/home/useHomeMap';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';
import type { useHomeUserLocation } from '@/hooks/home/useHomeUserLocation';
import type { useHomeSheet } from '@/hooks/home/useHomeSheet';

const positionImage = require('@/assets/images/map-markers/home-position-dot.png');

type Props =
  Pick<ReturnType<typeof useHomeMapNavigation>, 'shouldRenderHomeMap'>
  & Pick<ReturnType<typeof useHomeMap>, 'mapRef' | 'mapRegion'>
  & Pick<ReturnType<typeof useHomeSheet>, 'mapBottomOffset'>
  & Pick<ReturnType<typeof useHomeUserLocation>, 'userLocationMarker' | 'userLocationMarkerRef' | 'showUserLocationCallout'>
  & Pick<ReturnType<typeof useHomeLocation>, 'liveUserCoordinate'>
  & { homeMapPadding?: typeof HOME_MAP_PADDING; showLocationLegend?: boolean };

// Only the current user's location belongs on Home. Ride tracking stays in navigation.
export const HomeMap = React.memo(function HomeMap({
  shouldRenderHomeMap, mapRef, mapRegion, mapBottomOffset,
  userLocationMarker, liveUserCoordinate, userLocationMarkerRef, showUserLocationCallout,
  homeMapPadding = HOME_MAP_PADDING,
  showLocationLegend = true,
}: Props) {
  const coordinate = normalizeTripMapCoordinate(liveUserCoordinate?.latitude, liveUserCoordinate?.longitude)
    ?? normalizeTripMapCoordinate(userLocationMarker?.coordinate.latitude, userLocationMarker?.coordinate.longitude);
  return (
    <View style={[styles.mapViewport, { bottom: mapBottomOffset }]}>
      {shouldRenderHomeMap && (
        <MapView ref={mapRef} provider={HOME_MAP_PROVIDER} style={styles.map}
          initialRegion={mapRegion} customMapStyle={IS_ANDROID ? HOME_MAP_STYLE : undefined}
          mapType={IS_ANDROID ? 'standard' : 'mutedStandard'} mapPadding={homeMapPadding}
          onMapReady={() => mapRef.current?.animateToRegion(mapRegion, 0)}
          showsCompass={false} showsTraffic={false} showsBuildings={false} showsIndoors={false}
          showsPointsOfInterest={false} showsUserLocation={false} showsMyLocationButton={false}
          moveOnMarkerPress={false} toolbarEnabled={false}>
          {coordinate && (
            <Marker ref={userLocationMarkerRef} identifier="home-user-location" coordinate={coordinate}
              image={positionImage}
              anchor={USER_LOCATION_MARKER_ANCHOR} title="Ma position"
              description={userLocationMarker?.address} onPress={showUserLocationCallout}
              tracksViewChanges={false} zIndex={10} />
          )}
        </MapView>
      )}
      {shouldRenderHomeMap && showLocationLegend && <View style={styles.locationLegend} pointerEvents="none">
        <View style={[styles.locationLegendDot, !coordinate && styles.locationLegendPendingDot]} />
        <Text style={styles.locationLegendText}>{coordinate ? 'Votre position' : 'Position en attente'}</Text>
      </View>}
    </View>
  );
});
