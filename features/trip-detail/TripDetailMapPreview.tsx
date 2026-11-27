import { useTripDetailController } from '../../hooks/trip-detail/useTripDetailController';
import {
  TRIP_DETAIL_MAP_PROVIDER,
} from './tripDetailModel';
import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { RoutePointMarker } from '@/components/maps/RoutePointMarker';
import { tripDetailMapHeight } from './tripDetailLayout';

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
      accessibilityRole="button"
      accessibilityLabel="Agrandir la carte du trajet"
    >
      <View style={[styles.mapPreview, { height: tripDetailMapHeight(model.data.viewportHeight, model.data.isTripDriver) }]}>
        <MapView
          provider={TRIP_DETAIL_MAP_PROVIDER}
          style={styles.mapView}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          toolbarEnabled={false}
          showsPointsOfInterest={false}
          region={model.mapPresentation.mapRegion}
        >
          {model.mapPresentation.hasDetailedRouteMapCoordinates && model.mapPresentation.routeMapCoordinates.length >= 2 && (
            <Polyline
              coordinates={model.mapPresentation.routeMapCoordinates}
              strokeColor={Colors.primary}
              strokeWidth={4}
              lineDashPattern={model.mapPresentation.hasDetailedRouteMapCoordinates ? undefined : [1, 1]}
            />
          )}

          <RoutePointMarker kind="departure"
            coordinate={model.route.departureCoordinate}
            title={`Départ · ${model.presentation.routeLabels.departure.title}`}
            description={model.presentation.routeLabels.departure.address}
          />

          <RoutePointMarker kind="arrival"
            coordinate={model.route.arrivalCoordinate}
            title={`Arrivée · ${model.presentation.routeLabels.arrival.title}`}
            description={model.presentation.routeLabels.arrival.address}
          />

          {/* Destinations des passagers */}
          {model.mapPresentation.passengerDestinationMarkers.map((marker) => (
            <RoutePointMarker kind="passenger"
              key={`passenger-dest-${marker.id}`}
              coordinate={marker.coordinate}
              title={marker.title}
              description={marker.description}
            />
          ))}
        </MapView>

        {!model.data.isTripDriver && model.access.showPassengerSecurityAccess && !model.access.isPassengerSecurityLocked &&
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="SOS, contacter les urgences"
            onPress={event => { event.stopPropagation(); model.safety.openSosModal(); }}
            style={{ position: 'absolute', left: 16, bottom: 90, minHeight: 44, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, backgroundColor: '#D9291C', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="call-outline" size={20} color="#FFFFFF" /><Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>SOS</Text>
          </TouchableOpacity>}
        <View style={[styles.expandButton, model.data.isTripDriver && styles.ownerMapExpand]}>
          <View style={styles.expandButtonInner}>
            {/* L'icône suit l'état affiché : chargement, tracé disponible ou tracé indisponible. */}
            {model.bookingState.isLoadingRoute
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name={model.mapPresentation.hasDetailedRouteMapCoordinates ? 'expand' : 'map-outline'} size={16} color={Colors.gray[700]} />}
            <Text style={styles.mapOverlayText}>{model.bookingState.isLoadingRoute ? 'Calcul de l’itinéraire…'
              : model.mapPresentation.hasDetailedRouteMapCoordinates ? 'Voir l’itinéraire' : 'Tracé routier indisponible'}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
