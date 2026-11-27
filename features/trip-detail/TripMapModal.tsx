import { TRIP_DETAIL_MAP_PROVIDER } from './tripDetailModel';
import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { RideModal as Modal } from '@/features/navigation/RideModal';
import MapView, { Polyline } from 'react-native-maps';
import { RoutePointMarker } from '@/components/maps/RoutePointMarker';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useNavigationMapLifecycle } from '@/hooks/navigation/useNavigationMapLifecycle';
import { useStableMapRoute } from '@/hooks/maps/useStableMapRoute';
import { useRouteOverviewCamera } from '@/hooks/maps/useRouteOverviewCamera';
import type { RouteLocationLabels } from '@/utils/routeLocationLabels';
import type { MapCoordinate } from '@/utils/tripCoordinates';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface TripMapModalProps {
  mapModalVisible: true;
  setMapModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  insets: EdgeInsets;
  mapRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  routeMapCoordinates: MapCoordinate[];
  hasDetailedRouteMapCoordinates: boolean;
  departureCoordinate: MapCoordinate;
  routeLabels: RouteLocationLabels;
  arrivalCoordinate: MapCoordinate;
  passengerDestinationMarkers: { id: string; coordinate: MapCoordinate; title: string; description: string }[];
}
const PADDING = { top: 70, bottom: 70, left: 36, right: 36 };

export function TripMapModal({ mapModalVisible, setMapModalVisible, insets, mapRegion, routeMapCoordinates,
  hasDetailedRouteMapCoordinates, departureCoordinate, routeLabels, arrivalCoordinate, passengerDestinationMarkers }: TripMapModalProps) {
  const mapRef = useRef<MapView>(null);
  const active = useScreenIsActive();
  const { width, height } = useWindowDimensions();
  const lifecycle = useNavigationMapLifecycle({ screenKey: 'trip-route-modal', enabled: active && mapModalVisible, mapRef });
  const fallback = useMemo(() => [departureCoordinate, arrivalCoordinate], [departureCoordinate, arrivalCoordinate]);
  const coordinates = useStableMapRoute(routeMapCoordinates.length >= 2 ? routeMapCoordinates : fallback, hasDetailedRouteMapCoordinates);
  const routeKey = `${departureCoordinate.latitude}:${departureCoordinate.longitude}:${arrivalCoordinate.latitude}:${arrivalCoordinate.longitude}`;
  const camera = useRouteOverviewCamera({ routeKey, coordinates, isReady: lifecycle.isMapReady,
    edgePadding: PADDING, mapLayoutRef: lifecycle.mapLayoutRef, runMapCommand: lifecycle.runMapCommand,
    layoutKey: `${width}:${height}:${insets.top}:${insets.bottom}` });
  return <Modal visible={mapModalVisible} animationType="fade" transparent onRequestClose={() => setMapModalVisible(false)}>
    <View style={styles.mapModalOverlay}>
      <View style={[styles.mapModalContent, { marginTop: Math.max(insets.top, 20), marginBottom: Math.max(insets.bottom, 20) }]}>
        {lifecycle.shouldRenderMap && <MapView ref={mapRef} provider={TRIP_DETAIL_MAP_PROVIDER} style={styles.fullscreenMap}
          mapType="standard" initialRegion={mapRegion} onMapReady={lifecycle.onMapReady} onLayout={lifecycle.onMapLayout}
          onPanDrag={camera.onPanDrag} onTouchStart={camera.onPanDrag} onRegionChangeComplete={camera.onRegionChangeComplete}
          moveOnMarkerPress={false} toolbarEnabled={false} showsPointsOfInterest={false}>
          {hasDetailedRouteMapCoordinates && coordinates.length >= 2 && <Polyline coordinates={coordinates} strokeColor={Colors.primary} strokeWidth={4}
            lineDashPattern={hasDetailedRouteMapCoordinates ? undefined : [4, 4]} />}
          <RoutePointMarker kind="departure" coordinate={departureCoordinate} title={`Départ · ${routeLabels.departure.title}`}
            description={routeLabels.departure.address} />
          <RoutePointMarker kind="arrival" coordinate={arrivalCoordinate} title={`Arrivée · ${routeLabels.arrival.title}`}
            description={routeLabels.arrival.address} />
          {passengerDestinationMarkers.map(marker => <RoutePointMarker key={`passenger-dest-fullscreen-${marker.id}`}
            kind="passenger" coordinate={marker.coordinate} title={marker.title} description={marker.description} />)}
        </MapView>}
        {!lifecycle.isMapReady && <View pointerEvents="none" style={local.loading}><ActivityIndicator color={Colors.primary} /></View>}
        {!hasDetailedRouteMapCoordinates && <View style={local.notice} pointerEvents="none"><Text>Tracé routier indisponible</Text></View>}
        <TouchableOpacity style={styles.closeMapButton} onPress={() => setMapModalVisible(false)} activeOpacity={0.82}
          accessibilityRole="button" accessibilityLabel="Fermer la carte" hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.white} />
        </TouchableOpacity>
        <TouchableOpacity style={local.recenter} onPress={camera.recenter} disabled={!lifecycle.isMapReady}
          accessibilityState={{ disabled: !lifecycle.isMapReady }} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel="Recentrer l’itinéraire">
          <Ionicons name="locate-outline" size={23} color="#1E294A" />
        </TouchableOpacity>
      </View>
    </View>
  </Modal>;
}
const local = StyleSheet.create({
  notice: { position: 'absolute', bottom: 76, left: 16, right: 16, borderRadius: 16,
    backgroundColor: '#FFFFFF', padding: 12, alignItems: 'center' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  recenter: { position: 'absolute', bottom: 16, right: 16, width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
});
