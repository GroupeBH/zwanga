import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigationMapLifecycle } from '@/hooks/navigation/useNavigationMapLifecycle';
import { useLocationPermissionPulse } from '@/hooks/home/useLocationPermissionPulse';
import { getVehicleTrackingMarkerImage } from '@/components/TrackingMapMarkers';
import type { MapCoordinate } from '@/utils/tripCoordinates';
import { searchVehicleAppearance, type RequestVehicleMarker } from './requestSearchModel';

export function RequestSearchMap({ requestId, active, departure, position, vehicles }: {
  requestId: string; active: boolean; departure: MapCoordinate | null; position: MapCoordinate | null;
  vehicles: RequestVehicleMarker[];
}) {
  const mapRef = useRef<MapView>(null);
  const lifecycle = useNavigationMapLifecycle({ screenKey: requestId, enabled: active && !!departure, mapRef });
  const { runMapCommand, isMapReady } = lifecycle;
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const projection = useRef(0);
  const invalidateProjection = useCallback(() => { projection.current++; }, []);
  const onMapMove = useCallback(() => { invalidateProjection(); setPoint(null); }, [invalidateProjection]);
  const latitude = position?.latitude, longitude = position?.longitude;
  const projectPosition = useCallback(() => {
    const generation = ++projection.current;
    setPoint(null);
    if (!isMapReady || latitude === undefined || longitude === undefined) return;
    runMapCommand(map => {
      void map.pointForCoordinate({ latitude, longitude }).then(value => {
        if (projection.current === generation && Number.isFinite(value.x) && Number.isFinite(value.y)) setPoint(value);
      }).catch(() => {});
    });
  }, [isMapReady, latitude, longitude, runMapCommand]);
  useEffect(() => {
    projectPosition();
    return invalidateProjection;
  }, [projectPosition, invalidateProjection]);
  const opacity = useLocationPermissionPulse(active && isMapReady && !!point);
  const departureLat = departure?.latitude, departureLng = departure?.longitude;
  const recenter = useCallback(() => {
    if (departureLat === undefined || departureLng === undefined) return;
    runMapCommand(map => map.fitToCoordinates([
      { latitude: departureLat - 0.046, longitude: departureLng - 0.046 },
      { latitude: departureLat + 0.046, longitude: departureLng + 0.046 },
    ], { edgePadding: { top: 35, bottom: 55, left: 30, right: 30 }, animated: false }));
  }, [departureLat, departureLng, runMapCommand]);
  useEffect(() => { if (isMapReady) recenter(); }, [isMapReady, recenter]);
  return <View style={s.frame}>
    {lifecycle.shouldRenderMap && departure ? <MapView
      ref={mapRef} style={StyleSheet.absoluteFill} provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      initialRegion={{ ...departure, latitudeDelta: 0.11, longitudeDelta: 0.11 }}
      onMapReady={lifecycle.onMapReady} onLayout={lifecycle.onMapLayout}
      onRegionChange={onMapMove} onRegionChangeComplete={projectPosition}
      showsMyLocationButton={false} showsCompass={false} showsPointsOfInterest={false} rotateEnabled={false} pitchEnabled={false}
    >
      {vehicles.map(vehicle => {
        const appearance = searchVehicleAppearance(vehicle);
        return <Marker key={vehicle.id} coordinate={{ latitude: vehicle.latitude, longitude: vehicle.longitude }} tracksViewChanges={false}
          image={getVehicleTrackingMarkerImage(appearance.imageType)} anchor={{ x: 0.5, y: 0.5 }}
          title={appearance.title} description={appearance.description} opacity={appearance.opacity} />;
      })}
      <Marker key="departure" coordinate={departure} title="Votre départ choisi" tracksViewChanges={false}
        image={require('@/assets/images/map-markers/trip-detail-marker-departure.png')} anchor={{ x: 0.5, y: 0.86 }} />
      {position && <Marker key="position" coordinate={position} title="Votre position" zIndex={10} tracksViewChanges={false}
        image={require('@/assets/images/map-markers/home-position-dot.png')} anchor={{ x: 0.5, y: 0.5 }} />}
    </MapView> : <View style={s.placeholder}><Ionicons name="map-outline" size={32} color="#687681" />
      <Text style={s.note}>{departure ? 'Ouverture de la carte…' : 'Ajoutez un point de départ sur la carte pour voir les conducteurs.'}</Text></View>}
    {!!point && !!position && active && isMapReady && <Animated.View pointerEvents="none" style={[s.pulse,
      { left: point.x - 23, top: point.y - 23, opacity }]} />}
    <View pointerEvents="none" style={s.legend}><View style={s.dot} /><Text style={s.legendText}>{position ? 'Votre position' : 'Votre départ choisi'}</Text></View>
    {departure && <Pressable accessibilityRole="button" accessibilityLabel="Recentrer la carte autour du départ" onPress={recenter} style={s.center}>
      <Ionicons name="locate-outline" size={24} color="#1E2A4A" />
    </Pressable>}
  </View>;
}
const s = StyleSheet.create({
  frame: { flex: 1, minHeight: 180, backgroundColor: '#E9EFED', overflow: 'hidden' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  note: { fontSize: 14, lineHeight: 21, color: '#536071', textAlign: 'center' },
  pulse: { position: 'absolute', width: 46, height: 46, borderRadius: 23, borderWidth: 7, borderColor: '#FF6B35' },
  legend: { position: 'absolute', bottom: 22, left: 16, borderRadius: 24, backgroundColor: '#FFFFFF', padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E64B14' },
  legendText: { fontSize: 13, fontWeight: '600', color: '#202734' },
  center: { position: 'absolute', right: 16, bottom: 20, width: 46, height: 46, backgroundColor: '#FFFFFF',
    borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
