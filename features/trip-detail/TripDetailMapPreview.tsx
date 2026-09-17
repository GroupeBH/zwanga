import { useTripDetailController } from '../../hooks/trip-detail/useTripDetailController';
import {
  USE_CUSTOM_MAP_MARKERS,
  USE_ANDROID_MAP_MARKER_IMAGES,
  TRIP_DETAIL_MAP_PROVIDER,
  ANDROID_TRIP_DETAIL_MARKER_ANCHOR,
  androidTripDetailMarkerImages,
} from './tripDetailModel';
import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

interface TripDetailMapPreviewProps {
  model: ReturnType<typeof useTripDetailController>;
}

export function TripDetailMapPreview({
  model,
}: TripDetailMapPreviewProps) {
  return (
    <TouchableOpacity
      style={styles.mapContainer}
      onPress={() => model.bookingState.setMapModalVisible(true)}
      activeOpacity={0.95}
    >
      <View style={[styles.mapPreview, { height: Math.min(214, Math.max(172, model.data.viewportHeight * 0.27)) }]}>
        <MapView
          provider={TRIP_DETAIL_MAP_PROVIDER}
          style={styles.mapView}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          region={model.mapPresentation.mapRegion}
        >
          {model.mapPresentation.routeMapCoordinates.length >= 2 && (
            <Polyline
              coordinates={model.mapPresentation.routeMapCoordinates}
              strokeColor={Colors.primary}
              strokeWidth={4}
              lineDashPattern={model.mapPresentation.hasDetailedRouteMapCoordinates ? undefined : [1, 1]}
            />
          )}

          <Marker
            coordinate={model.route.departureCoordinate}
            anchor={USE_ANDROID_MAP_MARKER_IMAGES ? ANDROID_TRIP_DETAIL_MARKER_ANCHOR : undefined}
            image={USE_ANDROID_MAP_MARKER_IMAGES ? androidTripDetailMarkerImages.departure : undefined}
            pinColor={USE_ANDROID_MAP_MARKER_IMAGES ? undefined : Colors.success}
            title={`Départ · ${model.presentation.routeLabels.departure.title}`}
            description={model.presentation.routeLabels.departure.address}
            tracksViewChanges={false}
          >
            {USE_CUSTOM_MAP_MARKERS ? (
              <View style={styles.markerStartCircle}>
                <Ionicons name="location" size={18} color={Colors.white} />
              </View>
            ) : null}
          </Marker>

          <Marker
            coordinate={model.route.arrivalCoordinate}
            anchor={USE_ANDROID_MAP_MARKER_IMAGES ? ANDROID_TRIP_DETAIL_MARKER_ANCHOR : undefined}
            image={USE_ANDROID_MAP_MARKER_IMAGES ? androidTripDetailMarkerImages.arrival : undefined}
            pinColor={USE_ANDROID_MAP_MARKER_IMAGES ? undefined : Colors.primary}
            title={`Arrivée · ${model.presentation.routeLabels.arrival.title}`}
            description={model.presentation.routeLabels.arrival.address}
            tracksViewChanges={false}
          >
            {USE_CUSTOM_MAP_MARKERS ? (
              <View style={styles.markerEndCircle}>
                <Ionicons name="navigate" size={18} color={Colors.white} />
              </View>
            ) : null}
          </Marker>

          {/* Destinations des passagers */}
          {model.mapPresentation.passengerDestinationMarkers.map((marker) => (
            <Marker
              key={`passenger-dest-${marker.id}`}
              coordinate={marker.coordinate}
              anchor={USE_ANDROID_MAP_MARKER_IMAGES ? ANDROID_TRIP_DETAIL_MARKER_ANCHOR : undefined}
              image={USE_ANDROID_MAP_MARKER_IMAGES ? androidTripDetailMarkerImages.passenger : undefined}
              pinColor={USE_ANDROID_MAP_MARKER_IMAGES ? undefined : Colors.secondary}
              title={marker.title}
              description={marker.description}
              tracksViewChanges={false}
            >
              {USE_CUSTOM_MAP_MARKERS ? (
                <View style={styles.markerPassengerDestCircle}>
                  <Ionicons name="person" size={14} color={Colors.white} />
                </View>
              ) : null}
            </Marker>
          ))}
        </MapView>

        <View style={styles.mapOverlay}>
          <View>
            <Text style={styles.mapOverlayLabel}>DÉPART</Text>
            <Text style={styles.mapOverlayValue}>{model.presentation.tripDepartureTimeLabel}</Text>
          </View>
          <View style={styles.mapOverlayDivider} />
          <Text style={styles.mapOverlayText}>Agrandir</Text>
        </View>

        <View style={styles.expandButton}>
          <View style={styles.expandButtonInner}>
            <Ionicons name="expand" size={20} color={Colors.gray[700]} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
