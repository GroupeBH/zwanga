import type { NavigationCoordinate } from '@/utils/navigation/routeProgress';
import { useDriverNavigationFoundation } from '../../hooks/driver-navigation/useDriverNavigationFoundation';
import { useDriverNavigationPresentation } from '../../hooks/driver-navigation/useDriverNavigationPresentation';
import { androidNavigationMarkerImages } from './navigationPresentation';
import { USE_ANDROID_NAVIGATION_MARKER_IMAGES, ANDROID_PIN_MARKER_ANCHOR } from './navigationModel';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import {
  getVehicleTrackingMarkerImage,
  PASSENGER_TRACKING_MARKER_ANCHOR,
  PassengerTrackingMarker,
  VEHICLE_TRACKING_MARKER_ANCHOR,
  VehicleTrackingMarker,
} from '@/components/TrackingMapMarkers';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

interface DriverNavigationMapProps {
  foundation: ReturnType<typeof useDriverNavigationFoundation>;
  initialMapCoordinate: NavigationCoordinate;
  presentation: ReturnType<typeof useDriverNavigationPresentation>;
}

export function DriverNavigationMap({
  foundation,
  initialMapCoordinate,
  presentation,
}: DriverNavigationMapProps) {
  const trip = foundation.data.trip;
  if (!trip) return null;
  return (
    <MapView
      ref={foundation.mapState.mapRef}
      onMapReady={foundation.mapState.handleMapReady}
      onLayout={foundation.mapState.onMapLayout}
      style={styles.map}
      provider={PROVIDER_GOOGLE}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      showsTraffic={false}
      showsBuildings={false}
      showsIndoors={false}
      showsPointsOfInterest={false}
      loadingEnabled={false}
      mapType="standard"
      minZoomLevel={12}
      maxZoomLevel={18}
      pitchEnabled={foundation.data.isTripOngoing}
      rotateEnabled={foundation.data.isTripOngoing}
      scrollEnabled={foundation.data.isTripOngoing}
      zoomEnabled={foundation.data.isTripOngoing}
      toolbarEnabled={false}
      moveOnMarkerPress={false}
      initialRegion={{
        latitude: initialMapCoordinate.latitude,
        longitude: initialMapCoordinate.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }}
    >
      {/* Itinéraire (simplifié) */}
      {presentation.routeSectionCoordinates.nextCoordinates.length > 1 && (
        <Polyline
          key="next-route"
          coordinates={presentation.routeSectionCoordinates.nextCoordinates}
          strokeWidth={foundation.mapState.routeSectionFocus === 'next' ? 6 : 3}
          strokeColor={foundation.mapState.routeSectionFocus === 'next' ? Colors.primaryDark : 'rgba(255, 107, 53, 0.26)'}
          lineCap="round"
          lineJoin="round"
          tappable
          onPress={() => foundation.mapState.setRouteSectionFocus('next')}
          zIndex={foundation.mapState.routeSectionFocus === 'next' ? 12 : 2}
        />
      )}

      {presentation.routeSectionCoordinates.remainingCoordinates.length > 1 && (
        <Polyline
          key="remaining-route"
          coordinates={presentation.routeSectionCoordinates.remainingCoordinates}
          strokeWidth={foundation.mapState.routeSectionFocus === 'remaining' ? 6 : 3}
          strokeColor={foundation.mapState.routeSectionFocus === 'remaining' ? Colors.infoDark : 'rgba(52, 152, 219, 0.24)'}
          lineDashPattern={foundation.mapState.routeSectionFocus === 'remaining' ? undefined : [8, 6]}
          lineCap="round"
          lineJoin="round"
          tappable
          onPress={() => foundation.mapState.setRouteSectionFocus('remaining')}
          zIndex={foundation.mapState.routeSectionFocus === 'remaining' ? 13 : 3}
        />
      )}

      {/* Position actuelle du conducteur - Marqueur voiture */}
      {presentation.currentDriverCoordinate && (
        <Marker.Animated
          key="driver-position"
          ref={foundation.mapState.driverMarkerRef}
          coordinate={foundation.mapState.driverPosition as unknown as { latitude: number; longitude: number }}
          anchor={VEHICLE_TRACKING_MARKER_ANCHOR}
          title="Ma position"
          image={
            USE_ANDROID_NAVIGATION_MARKER_IMAGES
              ? getVehicleTrackingMarkerImage(trip.vehicleType)
              : undefined
          }
          flat
          rotation={foundation.mapState.heading}
          tracksViewChanges={false}
        >
          {!USE_ANDROID_NAVIGATION_MARKER_IMAGES && (
            <VehicleTrackingMarker vehicleType={trip.vehicleType} />
          )}
        </Marker.Animated>
      )}

      {foundation.passengers.passengerMapLocations.map((passenger) => {
        const passengerMarkerKey = `live-passenger-${passenger.bookingId}:${passenger.status}`;
        const passengerDescription =
          passenger.status === 'arrived'
            ? 'Passager arrivé'
            : passenger.status === 'pickup'
              ? 'Point de prise en charge'
              : passenger.isLive
                ? 'Position en direct'
                : 'Position du passager';

        return (
          <Marker
            ref={(marker) => {
              if (marker) {
                foundation.mapState.passengerMarkerRefs.current[passenger.bookingId] = marker;
              } else {
                delete foundation.mapState.passengerMarkerRefs.current[passenger.bookingId];
              }
            }}
            key={passengerMarkerKey}
            coordinate={passenger.coordinate}
            anchor={PASSENGER_TRACKING_MARKER_ANCHOR}
            title={passenger.passengerName}
            description={passengerDescription}
            onPress={() => {
              foundation.mapState.stopDriverMarkerAnimation();
              foundation.mapState.navigateAfterRelease(() => foundation.data.router.push(`/passenger/${passenger.passengerId}`));
            }}
            tracksViewChanges={USE_ANDROID_NAVIGATION_MARKER_IMAGES && !foundation.mapState.isPassengerMarkerLoaded(passengerMarkerKey)}
            zIndex={20}
          >
            <PassengerTrackingMarker
              status={passenger.status}
              onReady={() => foundation.mapState.refreshPassengerMarker(passengerMarkerKey,
                () => foundation.mapState.passengerMarkerRefs.current[passenger.bookingId] ?? null)}
            />
          </Marker>
        );
      })}
      {/* Départ publié du trajet */}
      {foundation.data.tripDepartureCoordinate && (
        <Marker
          coordinate={foundation.data.tripDepartureCoordinate}
          anchor={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? ANDROID_PIN_MARKER_ANCHOR : { x: 0.5, y: 0.5 }}
          image={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? androidNavigationMarkerImages.departure : undefined}
          pinColor={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? undefined : Colors.primary}
          title="Départ"
          description={presentation.tripDepartureLabel}
          tracksViewChanges={false}
          zIndex={8}
        >
          {!USE_ANDROID_NAVIGATION_MARKER_IMAGES && (
            <View
              collapsable={false}
              style={[styles.waypointMarkerContainer, styles.departureMarker]}
            >
              <Ionicons name="location" size={20} color={Colors.white} />
            </View>
          )}
        </Marker>
      )}

      {/* Prochain waypoint uniquement (1 seul pour éviter les crashs) */}
      {presentation.currentNavigationWaypoint &&
       presentation.currentNavigationWaypointCoordinate &&
       !presentation.currentNavigationWaypoint.completed && (
        <Marker
          coordinate={presentation.currentNavigationWaypointCoordinate}
          anchor={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? ANDROID_PIN_MARKER_ANCHOR : { x: 0.5, y: 0.5 }}
          image={
            USE_ANDROID_NAVIGATION_MARKER_IMAGES
              ? androidNavigationMarkerImages[
                  presentation.currentNavigationWaypoint.type === 'pickup' ? 'pickup' : 'dropoff'
                ]
              : undefined
          }
          pinColor={
            USE_ANDROID_NAVIGATION_MARKER_IMAGES
              ? undefined
              : presentation.currentNavigationWaypoint.type === 'pickup'
                ? Colors.secondary
                : Colors.success
          }
          title={`${presentation.currentNavigationWaypoint.type === 'pickup' ? 'Lieu de prise en charge' : "Point d'arrivée"} ${presentation.currentNavigationWaypoint.passenger.name}`}
          description={presentation.currentNavigationWaypoint.address}
          tracksViewChanges={false}
          zIndex={26}
        >
          {!USE_ANDROID_NAVIGATION_MARKER_IMAGES && (
            <View
              collapsable={false}
              style={[
                styles.waypointMarkerContainer,
                presentation.currentNavigationWaypoint.type === 'pickup'
                  ? styles.pickupMarker
                  : styles.dropoffMarker,
              ]}
            >
              <Ionicons
                name={presentation.currentNavigationWaypoint.type === 'pickup' ? 'person-add' : 'flag'}
                size={20}
                color={Colors.white}
              />
            </View>
          )}
        </Marker>
      )}

      {/* Destination finale - Marqueur arrivée */}
      {presentation.shouldShowTripArrivalMarker && foundation.data.tripArrivalCoordinate && (
        <Marker
          coordinate={{
            latitude: foundation.data.tripArrivalCoordinate.latitude,
            longitude: foundation.data.tripArrivalCoordinate.longitude,
          }}
          anchor={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? ANDROID_PIN_MARKER_ANCHOR : { x: 0.5, y: 1 }}
          image={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? androidNavigationMarkerImages.destination : undefined}
          pinColor={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? undefined : Colors.success}
          title="Arrivée"
          description={presentation.tripArrivalLabel}
          tracksViewChanges={!USE_ANDROID_NAVIGATION_MARKER_IMAGES && foundation.mapState.destinationTracksViewChanges}
          zIndex={18}
        >
          {!USE_ANDROID_NAVIGATION_MARKER_IMAGES && (
            <View
              collapsable={false}
              style={styles.destinationMarkerContainer}
              onLayout={() => {
                if (foundation.mapState.isMountedRef.current && foundation.mapState.destinationTracksViewChanges) {
                  foundation.mapState.setDestinationTracksViewChanges(false);
                }
              }}
            >
              <View style={styles.destinationMarkerBody}>
                <Ionicons name="flag" size={22} color={Colors.white} />
              </View>
              <View style={styles.destinationMarkerTip} />
            </View>
          )}
        </Marker>
      )}
    </MapView>
  );
}
