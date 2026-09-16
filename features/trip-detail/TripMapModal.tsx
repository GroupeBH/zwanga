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
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Callout, Marker, Polyline } from 'react-native-maps';
import type { Trip } from '@/types';
import type { MapCoordinate } from '@/utils/tripCoordinates';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface TripMapModalProps {
  mapModalVisible: true;
  setMapModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  insets: EdgeInsets;
  mapRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number; };
  routeMapCoordinates: { latitude: number; longitude: number; }[];
  hasDetailedRouteMapCoordinates: boolean;
  departureCoordinate: MapCoordinate;
  trip: Trip | undefined;
  arrivalCoordinate: MapCoordinate;
  passengerDestinationMarkers: { id: string; coordinate: { latitude: number; longitude: number; }; title: string; description: string; }[];
}

export function TripMapModal({
  mapModalVisible,
  setMapModalVisible,
  insets,
  mapRegion,
  routeMapCoordinates,
  hasDetailedRouteMapCoordinates,
  departureCoordinate,
  trip,
  arrivalCoordinate,
  passengerDestinationMarkers,
}: TripMapModalProps) {
  return (
    <Modal visible={mapModalVisible} animationType="fade" transparent onRequestClose={() => setMapModalVisible(false)}>
      <View style={styles.mapModalOverlay}>
        <View
          style={[
            styles.mapModalContent,
            {
              marginTop: Math.max(insets.top, 20),
              marginBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          <MapView
            provider={TRIP_DETAIL_MAP_PROVIDER}
            style={styles.fullscreenMap}
            mapType="standard"
            initialRegion={mapRegion}
          >
            {routeMapCoordinates.length >= 2 && (
              <Polyline
                coordinates={routeMapCoordinates}
                strokeColor={Colors.primary}
                strokeWidth={5}
                lineDashPattern={hasDetailedRouteMapCoordinates ? undefined : [1, 1]}
              />
            )}

            <Marker
              coordinate={departureCoordinate}
              anchor={USE_ANDROID_MAP_MARKER_IMAGES ? ANDROID_TRIP_DETAIL_MARKER_ANCHOR : undefined}
              image={USE_ANDROID_MAP_MARKER_IMAGES ? androidTripDetailMarkerImages.departure : undefined}
              pinColor={USE_ANDROID_MAP_MARKER_IMAGES ? undefined : Colors.success}
              title="Départ"
              description={trip?.departure?.address}
              tracksViewChanges={false}
            >
              {USE_CUSTOM_MAP_MARKERS ? (
                <>
              <View style={styles.markerStartCircle}>
                <Ionicons name="location" size={20} color={Colors.white} />
              </View>
              <Callout>
                <View>
                  <Text style={{ fontWeight: 'bold' }}>Départ</Text>
                  <Text>{trip?.departure?.address}</Text>
                </View>
              </Callout>
                </>
              ) : null}
            </Marker>

            <Marker
              coordinate={arrivalCoordinate}
              anchor={USE_ANDROID_MAP_MARKER_IMAGES ? ANDROID_TRIP_DETAIL_MARKER_ANCHOR : undefined}
              image={USE_ANDROID_MAP_MARKER_IMAGES ? androidTripDetailMarkerImages.arrival : undefined}
              pinColor={USE_ANDROID_MAP_MARKER_IMAGES ? undefined : Colors.primary}
              title="Arrivée"
              description={trip?.arrival?.address}
              tracksViewChanges={false}
            >
              {USE_CUSTOM_MAP_MARKERS ? (
                <>
              <View style={styles.markerEndCircle}>
                <Ionicons name="navigate" size={20} color={Colors.white} />
              </View>
              <Callout>
                <View>
                  <Text style={{ fontWeight: 'bold' }}>Arrivée</Text>
                  <Text>{trip?.arrival?.address}</Text>
                </View>
              </Callout>
                </>
              ) : null}
            </Marker>

            {/* Destinations des passagers */}
            {passengerDestinationMarkers.map((marker) => (
              <Marker
                key={`passenger-dest-fullscreen-${marker.id}`}
                coordinate={marker.coordinate}
                anchor={USE_ANDROID_MAP_MARKER_IMAGES ? ANDROID_TRIP_DETAIL_MARKER_ANCHOR : undefined}
                image={USE_ANDROID_MAP_MARKER_IMAGES ? androidTripDetailMarkerImages.passenger : undefined}
                pinColor={USE_ANDROID_MAP_MARKER_IMAGES ? undefined : Colors.secondary}
                title={marker.title}
                description={marker.description}
                tracksViewChanges={false}
              >
                {USE_CUSTOM_MAP_MARKERS ? (
                  <>
                    <View style={styles.markerPassengerDestCircle}>
                      <Ionicons name="person" size={16} color={Colors.white} />
                    </View>
                    <Callout>
                      <View>
                        <Text style={{ fontWeight: 'bold' }}>{marker.title}</Text>
                        <Text>{marker.description}</Text>
                      </View>
                    </Callout>
                  </>
                ) : null}
              </Marker>
            ))}
          </MapView>

          <TouchableOpacity
            style={styles.closeMapButton}
            onPress={() => setMapModalVisible(false)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Fermer la carte"
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          >
            <Ionicons name="close" size={24} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
