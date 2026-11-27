import React from 'react';
import { Text, View } from 'react-native';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import MapView, { Marker } from 'react-native-maps';
import { RoutePointMarker } from '@/components/maps/RoutePointMarker';
import { HOME_MAP_PROVIDER, IS_ANDROID, USER_LOCATION_MARKER_ANCHOR } from '@/features/home/homeMapPolicy';
import { HOME_MAP_PADDING, HOME_MAP_STYLE } from '@/features/home/homeMapAppearance';
import { styles } from '@/features/home/HomeMap.styles';
import type { useHomeLocation } from '@/hooks/home/useHomeLocation';
import type { useHomeMap } from '@/hooks/home/useHomeMap';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';
import type { useHomeUserLocation } from '@/hooks/home/useHomeUserLocation';
import type { useHomeSheet } from '@/hooks/home/useHomeSheet';
import type { HomeMapMarker } from '@/features/home/homeMapMarkers';
import type { useHomeRequestPickup } from '@/hooks/home/useHomeRequestPickup';
import { acceptedCoursePoints, type HomeAcceptedDriverCourse } from '@/features/home/homeAcceptedDriverCourse';

const positionImage = require('@/assets/images/map-markers/home-position-dot.png');

type Props =
  Pick<ReturnType<typeof useHomeMapNavigation>, 'shouldRenderHomeMap'>
  & Pick<ReturnType<typeof useHomeMap>, 'mapRef' | 'mapRegion'>
  & Pick<ReturnType<typeof useHomeSheet>, 'mapBottomOffset'>
  & Pick<ReturnType<typeof useHomeUserLocation>, 'userLocationMarker' | 'userLocationMarkerRef' | 'showUserLocationCallout'>
  & Pick<ReturnType<typeof useHomeLocation>, 'liveUserCoordinate'>
  & { homeMapPadding?: typeof HOME_MAP_PADDING; showLocationLegend?: boolean;
    markers?: HomeMapMarker[]; markerSummary?: string | null; onMarkerPress?: (marker: HomeMapMarker) => void;
    onReady?: () => void; pickupModel?: ReturnType<typeof useHomeRequestPickup>['pickupModel'];
    acceptedDriverCourse?: HomeAcceptedDriverCourse | null };

const NO_MARKERS: HomeMapMarker[] = [];

// The user's location plus public departure points already listed on Home.
// Native markers only. Private pickup positions come from the participant-only endpoint.
export const HomeMap = React.memo(function HomeMap({
  shouldRenderHomeMap, mapRef, mapRegion, mapBottomOffset,
  userLocationMarker, liveUserCoordinate, userLocationMarkerRef, showUserLocationCallout,
  homeMapPadding = HOME_MAP_PADDING,
  showLocationLegend = true,
  markers = NO_MARKERS, markerSummary = null, onMarkerPress, onReady, pickupModel, acceptedDriverCourse,
}: Props) {
  const coursePoints = acceptedCoursePoints(acceptedDriverCourse);
  const coordinate = normalizeTripMapCoordinate(liveUserCoordinate?.latitude, liveUserCoordinate?.longitude)
    ?? normalizeTripMapCoordinate(userLocationMarker?.coordinate.latitude, userLocationMarker?.coordinate.longitude);
  return (
    <View style={[styles.mapViewport, { bottom: mapBottomOffset }]}>
      {shouldRenderHomeMap && (
        <MapView ref={mapRef} provider={HOME_MAP_PROVIDER} style={styles.map}
          initialRegion={mapRegion} customMapStyle={IS_ANDROID ? HOME_MAP_STYLE : undefined}
          mapType={IS_ANDROID ? 'standard' : 'mutedStandard'} mapPadding={homeMapPadding}
          onMapReady={() => { mapRef.current?.animateToRegion(mapRegion, 0); onReady?.(); }}
          showsCompass={false} showsTraffic={false} showsBuildings={false} showsIndoors={false}
          showsPointsOfInterest={false} showsUserLocation={false} showsMyLocationButton={false}
          moveOnMarkerPress={false} toolbarEnabled={false}>
          {markers.map(marker => (
            <Marker key={marker.key} identifier={marker.key} coordinate={marker.coordinate}
              image={marker.image} title={marker.title} tracksViewChanges={false} zIndex={5}
              onPress={marker.kind === 'trip' && onMarkerPress ? () => onMarkerPress(marker) : undefined}
              onCalloutPress={onMarkerPress ? () => onMarkerPress(marker) : undefined} />
          ))}
          {coordinate && (
            <Marker ref={userLocationMarkerRef} identifier="home-user-location" coordinate={coordinate}
              image={positionImage}
              anchor={USER_LOCATION_MARKER_ANCHOR} title="Ma position"
              description={userLocationMarker?.address} onPress={showUserLocationCallout}
              tracksViewChanges={false} zIndex={10} />
          )}
          {pickupModel?.pickupPosition && <RoutePointMarker kind="departure" identifier="home-request-pickup-point" coordinate={pickupModel.pickupPosition}
            title="Votre point de récupération" />}
          {pickupModel?.driverPosition && <Marker identifier="home-request-driver" coordinate={pickupModel.driverPosition}
            title={pickupModel.person.name} description="Position récente de votre conducteur"
            pinColor="#E8490C" tracksViewChanges={false} zIndex={6} />}
          {coursePoints.departure && <RoutePointMarker kind="departure" identifier="home-accepted-course-departure" coordinate={coursePoints.departure}
            title="Départ du passager" />}
          {coursePoints.arrival && <RoutePointMarker kind="arrival" identifier="home-accepted-course-arrival" coordinate={coursePoints.arrival}
            title="Arrivée du passager" />}
        </MapView>
      )}
      {shouldRenderHomeMap && showLocationLegend && <View style={styles.locationLegend} pointerEvents="none">
        <View style={[styles.locationLegendDot, !coordinate && styles.locationLegendPendingDot]} />
        <Text style={styles.locationLegendText}>{coordinate ? 'Votre position' : 'Votre position en attente'}</Text>
        {markerSummary ? <Text style={styles.locationLegendSummary}>{`· ${markerSummary}`}</Text> : null}
      </View>}
    </View>
  );
});
