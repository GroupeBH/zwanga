import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigationMapLifecycle } from '@/hooks/navigation/useNavigationMapLifecycle';
import { useLocationPermissionPulse } from '@/hooks/home/useLocationPermissionPulse';
import { getVehicleTrackingMarkerImage } from '@/components/TrackingMapMarkers';
import type { MapCoordinate } from '@/utils/tripCoordinates';
import { searchVehicleAppearance, type RequestVehicleMarker } from './requestSearchModel';
import { clusterSearchVehicles, type SearchMapRegion } from './requestVehicleClusters';
import { requestSearchBounds } from './requestSearchViewport';

type Props = {
  requestId: string; active: boolean; departure: MapCoordinate | null; position: MapCoordinate | null;
  vehicles: RequestVehicleMarker[];
  onSelectVehicle?: (id: string) => void;
};
export const RequestSearchMap = memo(function RequestSearchMap({ requestId, active, departure, position, vehicles, onSelectVehicle }: Props) {
  const mapRef = useRef<MapView>(null);
  const lifecycle = useNavigationMapLifecycle({ screenKey: requestId, enabled: active && !!departure, mapRef });
  const { runMapCommand, isMapReady } = lifecycle;
  const initialFit = useRef({ requestId, departure, hasVehicles: false, moved: false, fitted: false });
  if (initialFit.current.requestId !== requestId || initialFit.current.departure?.latitude !== departure?.latitude ||
    initialFit.current.departure?.longitude !== departure?.longitude) {
    initialFit.current = { requestId, departure, hasVehicles: false, moved: false, fitted: false };
  }
  const onPanDrag = useCallback(() => { initialFit.current.moved = true; }, []);
  const [viewport, setViewport] = useState<{ id: string; region: SearchMapRegion } | null>(null);
  const region = useMemo(() => viewport?.id === requestId ? viewport.region : {
    latitude: departure?.latitude ?? 0, longitude: departure?.longitude ?? 0, latitudeDelta: 0.035, longitudeDelta: 0.035,
  }, [viewport, requestId, departure?.latitude, departure?.longitude]);
  const pins = useMemo(() => clusterSearchVehicles(vehicles, region), [vehicles, region]);
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
  const onMapSettled = useCallback((next: SearchMapRegion, details?: { isGesture?: boolean }) => {
    if (![next.latitude, next.longitude, next.latitudeDelta, next.longitudeDelta].every(Number.isFinite)
      || next.latitudeDelta <= 0 || next.longitudeDelta <= 0) return;
    if (details?.isGesture) initialFit.current.moved = true;
    // Recompute groups only after a gesture, never at each native map frame.
    setViewport(previous => previous?.id === requestId && Object.keys(next).every(key =>
      next[key as keyof SearchMapRegion] === previous.region[key as keyof SearchMapRegion])
      ? previous : { id: requestId, region: next });
    projectPosition();
  }, [requestId, projectPosition]);
  const onMapLayout = (event: LayoutChangeEvent) => {
    lifecycle.onMapLayout(event);
    projectPosition(); // The panel can change height without a GPS or region update.
  };
  useEffect(() => {
    projectPosition();
    return invalidateProjection;
  }, [projectPosition, invalidateProjection]);
  const opacity = useLocationPermissionPulse(active && isMapReady && !!point);
  const departureLat = departure?.latitude, departureLng = departure?.longitude;
  const recenter = useCallback((animated = true) => {
    if (departureLat === undefined || departureLng === undefined) return false;
    return runMapCommand(map => map.fitToCoordinates(requestSearchBounds({ latitude: departureLat, longitude: departureLng }, vehicles),
      { edgePadding: { top: 40, bottom: 76, left: 40, right: 40 }, animated }));
  }, [departureLat, departureLng, vehicles, runMapCommand]);
  useEffect(() => {
    if (!active) { initialFit.current.fitted = false; initialFit.current.moved = false; return; }
    const fit = initialFit.current;
    // One initial frame, then one when the first real positions arrive. Never chase polling updates or gestures.
    if (isMapReady && (!fit.fitted || (!fit.hasVehicles && vehicles.length > 0 && !fit.moved)) && recenter(false)) {
      fit.fitted = true; fit.hasVehicles = vehicles.length > 0;
    }
  }, [active, isMapReady, recenter, requestId, vehicles.length]);
  const vehicleMarkers = useMemo(() => pins.map(pin => {
    if (pin.kind === 'group') return <Marker key={`group:${pin.id}:${pin.count}`} coordinate={pin.coordinate}
      tracksViewChanges={false} anchor={{ x: 0.5, y: 0.5 }} title={`${pin.count} véhicules · positions connues`}
      description="Touchez pour agrandir cette zone" onPress={() => { initialFit.current.moved = true; runMapCommand(map => map.fitToCoordinates(pin.bounds,
        { edgePadding: { top: 40, bottom: 60, left: 40, right: 40 }, animated: true })); }}>
      <View collapsable={false} style={s.group}><Text style={s.groupCount}>{pin.count}</Text></View>
    </Marker>;
    const vehicle = pin.vehicle, appearance = searchVehicleAppearance(vehicle);
    return <Marker key={vehicle.id} coordinate={{ latitude: vehicle.latitude, longitude: vehicle.longitude }} tracksViewChanges={false}
      image={getVehicleTrackingMarkerImage(appearance.imageType)} anchor={{ x: 0.5, y: 0.5 }}
      title={appearance.title} description={appearance.description} opacity={appearance.opacity}
      onPress={() => { if (active) onSelectVehicle?.(vehicle.id); }} />;
  }), [pins, runMapCommand, active, onSelectVehicle]);
  return <View style={s.frame} testID="request-search-map">
    {lifecycle.shouldRenderMap && departure ? <MapView
      ref={mapRef} style={StyleSheet.absoluteFill} provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      initialRegion={{ ...departure, latitudeDelta: 0.035, longitudeDelta: 0.035 }}
      onMapReady={lifecycle.onMapReady} onLayout={onMapLayout}
      onRegionChange={onMapMove} onRegionChangeComplete={onMapSettled} onPanDrag={onPanDrag}
      showsMyLocationButton={false} showsCompass={false} showsPointsOfInterest={false} rotateEnabled={false} pitchEnabled={false}
    >
      {vehicleMarkers}
      <Marker key="departure" coordinate={departure} title="Votre départ choisi" tracksViewChanges={false}
        image={require('@/assets/images/map-markers/trip-detail-marker-departure.png')} anchor={{ x: 0.5, y: 0.86 }} />
      {position && <Marker key="position" coordinate={position} title="Votre position" zIndex={10} tracksViewChanges={false}
        image={require('@/assets/images/map-markers/home-position-dot.png')} anchor={{ x: 0.5, y: 0.5 }} />}
    </MapView> : <View style={s.placeholder}><Ionicons name="map-outline" size={32} color="#687681" />
      <Text style={s.note}>{departure ? 'Ouverture de la carte…' : 'Ajoutez un point de départ sur la carte pour voir les conducteurs.'}</Text></View>}
    {!!point && !!position && active && isMapReady && <Animated.View pointerEvents="none" style={[s.pulse,
      { left: point.x - 23, top: point.y - 23, opacity }]} />}
    <View pointerEvents="none" style={s.legend}><View style={s.dot} /><Text style={s.legendText}>{position ? 'Votre position' : 'Votre départ choisi'}</Text></View>
    {departure && <Pressable accessibilityRole="button" accessibilityLabel="Voir les véhicules autour du départ" onPress={() => recenter()} style={s.center}>
      <Ionicons name="locate-outline" size={24} color="#1E2A4A" />
    </Pressable>}
  </View>;
}, (a, b) => a.requestId === b.requestId && a.active === b.active && a.vehicles === b.vehicles
  && a.onSelectVehicle === b.onSelectVehicle
  && a.departure?.latitude === b.departure?.latitude && a.departure?.longitude === b.departure?.longitude
  && a.position?.latitude === b.position?.latitude && a.position?.longitude === b.position?.longitude);
const s = StyleSheet.create({
  frame: { flex: 1, minHeight: 120, backgroundColor: '#E9EFED', overflow: 'hidden' },
  group: { minWidth: 42, height: 42, paddingHorizontal: 7, borderRadius: 21, backgroundColor: '#1E2A4A',
    borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  groupCount: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
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
