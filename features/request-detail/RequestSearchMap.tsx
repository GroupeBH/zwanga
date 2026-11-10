import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigationMapLifecycle } from '@/hooks/navigation/useNavigationMapLifecycle';
import { RequestPickupBeacon } from './RequestPickupBeacon';
import { getVehicleTrackingMarkerImage } from '@/components/TrackingMapMarkers';
import type { MapCoordinate } from '@/utils/tripCoordinates';
import { searchVehicleAppearance, type RequestVehicleMarker } from './requestSearchModel';
import { clusterSearchVehicles, type SearchMapRegion } from './requestVehicleClusters';
import { requestSearchBounds } from './requestSearchViewport';

type Props = {
  requestId: string; active: boolean; departure: MapCoordinate | null; position: MapCoordinate | null;
  vehicles: RequestVehicleMarker[]; searching?: boolean;
  onSelectVehicle?: (id: string) => void;
};
export const RequestSearchMap = memo(function RequestSearchMap({ requestId, active, departure, position, vehicles, searching = true, onSelectVehicle }: Props) {
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
  const [point, setPoint] = useState<{ x: number; y: number; requestId: string; latitude: number; longitude: number } | null>(null);
  const projection = useRef(0);
  const invalidateProjection = useCallback(() => { projection.current++; }, []);
  const onMapMove = useCallback(() => { invalidateProjection(); setPoint(null); }, [invalidateProjection]);
  const latitude = departure?.latitude, longitude = departure?.longitude;
  const projectDeparture = useCallback(() => {
    const generation = ++projection.current;
    setPoint(null);
    if (!active || !isMapReady || latitude === undefined || longitude === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    runMapCommand(map => {
      void map.pointForCoordinate({ latitude, longitude }).then(value => {
        if (projection.current === generation && Number.isFinite(value.x) && Number.isFinite(value.y)) {
          setPoint({ x: value.x, y: value.y, requestId, latitude, longitude });
        }
      }).catch(() => {});
    });
  }, [active, requestId, isMapReady, latitude, longitude, runMapCommand]);
  const onMapSettled = useCallback((next: SearchMapRegion, details?: { isGesture?: boolean }) => {
    if (![next.latitude, next.longitude, next.latitudeDelta, next.longitudeDelta].every(Number.isFinite)
      || next.latitudeDelta <= 0 || next.longitudeDelta <= 0) return;
    if (details?.isGesture) initialFit.current.moved = true;
    // Recompute groups only after a gesture, never at each native map frame.
    setViewport(previous => previous?.id === requestId && Object.keys(next).every(key =>
      next[key as keyof SearchMapRegion] === previous.region[key as keyof SearchMapRegion])
      ? previous : { id: requestId, region: next });
    projectDeparture();
  }, [requestId, projectDeparture]);
  const onMapLayout = (event: LayoutChangeEvent) => {
    lifecycle.onMapLayout(event);
    projectDeparture(); // The panel can change height without a GPS or region update.
  };
  useEffect(() => {
    projectDeparture();
    return invalidateProjection;
  }, [projectDeparture, invalidateProjection]);
  const visiblePoint = point?.requestId === requestId && point.latitude === latitude && point.longitude === longitude ? point : null;
  const showLivePosition = position && departure && (Math.abs(position.latitude - departure.latitude) > 0.0002 || Math.abs(position.longitude - departure.longitude) > 0.0002);
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
      <Marker key="departure" coordinate={departure} title="Votre départ" description="Le conducteur vient vous chercher ici" zIndex={10} tracksViewChanges={false}
        image={require('@/assets/images/map-markers/home-position-dot.png')} anchor={{ x: 0.5, y: 0.5 }} />
      {showLivePosition && position && <Marker key="position" coordinate={position} title="Votre position actuelle" zIndex={9} tracksViewChanges={false}
        image={require('@/assets/images/map-markers/user-location-marker.png')} anchor={{ x: 0.5, y: 0.5 }} />}
    </MapView> : <View style={s.placeholder}><Ionicons name="map-outline" size={32} color="#687681" />
      <Text style={s.note}>{departure ? 'Ouverture de la carte…' : 'Ajoutez un point de départ sur la carte pour voir les conducteurs.'}</Text></View>}
    {visiblePoint && active && isMapReady && <RequestPickupBeacon key={requestId} point={visiblePoint} enabled={searching} />}
    <View pointerEvents="none" style={s.legend}><Ionicons name="person" size={16} color="#C9430C" /><Text style={s.legendText}>Votre départ</Text></View>
    {departure && <Pressable accessibilityRole="button" accessibilityLabel="Voir les véhicules autour du départ" onPress={() => recenter()} style={s.center}>
      <Ionicons name="locate-outline" size={24} color="#1E2A4A" />
    </Pressable>}
  </View>;
}, (a, b) => a.requestId === b.requestId && a.active === b.active && a.vehicles === b.vehicles
  && a.onSelectVehicle === b.onSelectVehicle && a.searching === b.searching
  && a.departure?.latitude === b.departure?.latitude && a.departure?.longitude === b.departure?.longitude
  && a.position?.latitude === b.position?.latitude && a.position?.longitude === b.position?.longitude);
const s = StyleSheet.create({
  frame: { flex: 1, minHeight: 120, backgroundColor: '#E9EFED', overflow: 'hidden' },
  group: { minWidth: 42, height: 42, paddingHorizontal: 7, borderRadius: 21, backgroundColor: '#1E2A4A',
    borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  groupCount: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  note: { fontSize: 14, lineHeight: 21, color: '#536071', textAlign: 'center' },
  legend: { position: 'absolute', bottom: 22, left: 16, borderRadius: 24, backgroundColor: '#FFFFFF', padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendText: { fontSize: 13, fontWeight: '600', color: '#202734' },
  center: { position: 'absolute', right: 16, bottom: 20, width: 46, height: 46, backgroundColor: '#FFFFFF',
    borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
