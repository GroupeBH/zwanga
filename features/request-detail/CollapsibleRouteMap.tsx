import { RequestRouteMapData } from './requestDetailModel';
import { styles } from '../screen-styles/app/request/detail/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LatLng } from 'react-native-maps';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useNavigationMapLifecycle } from '@/hooks/navigation/useNavigationMapLifecycle';
import { getRouteCoordinates } from '@/utils/routeApi';

export type CollapsibleRouteMapProps = {
  arrivalName: string;
  departureName: string;
  mapData: RequestRouteMapData | null;
  routeCoordinates: LatLng[];
  variant?: 'dark' | 'light';
  initiallyExpanded?: boolean;
  summary?: ReactNode;
  expandLabel?: string;
  toggleAppearance?: 'button' | 'text';
  displayMode?: 'collapsible' | 'overview';
  overviewHeight?: number;
};

export function CollapsibleRouteMap({
  arrivalName,
  departureName,
  mapData,
  routeCoordinates,
  variant = 'dark',
  initiallyExpanded = false,
  summary,
  expandLabel = 'Carte',
  toggleAppearance = 'button',
  displayMode = 'collapsible',
  overviewHeight = 280,
}: CollapsibleRouteMapProps) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const overview = displayMode === 'overview';
  const visible = overview || isExpanded;
  const mapRef = useRef<MapView>(null);
  const active = useScreenIsActive();
  const [loadedRoute, setLoadedRoute] = useState<{ key: string; coordinates: LatLng[] } | null>(null);
  const fromLat = mapData?.departureCoordinate.latitude, fromLng = mapData?.departureCoordinate.longitude;
  const toLat = mapData?.arrivalCoordinate.latitude, toLng = mapData?.arrivalCoordinate.longitude;
  const routeKey = `${fromLat}:${fromLng}:${toLat}:${toLng}`;
  const { shouldRenderMap, isMapReady, onMapReady, onMapLayout, runMapCommand } = useNavigationMapLifecycle({
    screenKey: routeKey, enabled: visible && active && !!mapData, mapRef,
  });
  const suppliedRoute = routeCoordinates.length > 1;
  useEffect(() => {
    if (!visible || !active || suppliedRoute || fromLat === undefined || fromLng === undefined || toLat === undefined || toLng === undefined) return;
    let current = true;
    void getRouteCoordinates({ latitude: fromLat, longitude: fromLng }, { latitude: toLat, longitude: toLng })
      .then(coordinates => { if (current) setLoadedRoute({ key: routeKey, coordinates: coordinates ?? [] }); }).catch(() => {});
    return () => { current = false; };
  }, [visible, active, suppliedRoute, fromLat, fromLng, toLat, toLng, routeKey]);
  const displayedCoordinates = suppliedRoute ? routeCoordinates : loadedRoute?.key === routeKey ? loadedRoute.coordinates : undefined;
  const fallbackCoordinates = useMemo(() => fromLat === undefined || fromLng === undefined || toLat === undefined || toLng === undefined
    ? [] : [{ latitude: fromLat, longitude: fromLng }, { latitude: toLat, longitude: toLng }], [fromLat, fromLng, toLat, toLng]);
  const visibleCoordinates = displayedCoordinates && displayedCoordinates.length > 1 ? displayedCoordinates : fallbackCoordinates;

  useEffect(() => {
    if (!isMapReady || visibleCoordinates.length < 2) return;
    runMapCommand(map => {
      map.fitToCoordinates(visibleCoordinates, {
        edgePadding: { top: 34, right: 34, bottom: 34, left: 34 },
        animated: false,
      });
    });
  }, [visibleCoordinates, isMapReady, runMapCommand, overviewHeight]);

  const toggleMap = useCallback(() => {
    setIsExpanded((currentValue) => !currentValue);
  }, []);
  const textToggle = variant === 'light' && toggleAppearance === 'text';

  if (!mapData) {
    if (overview) return <View style={light.unavailable} accessibilityLabel="Carte indisponible pour ce trajet">
      <Ionicons name="map-outline" size={22} color={Colors.gray[500]} />
      <Text style={light.textToggleLabel}>Carte indisponible · consultez les adresses ci-dessous.</Text>
    </View>;
    const unavailable = (
      <View
        accessibilityLabel="Carte indisponible pour ce trajet"
        style={[styles.driverMapIconButton, variant === 'light' && light.button,
          styles.driverMapIconButtonDisabled, textToggle && light.textToggle]}
      >
        <Ionicons name="map-outline" size={16} color={Colors.gray[400]} />
        {textToggle && <Text style={light.textToggleLabel}>Carte indisponible</Text>}
      </View>
    );
    return summary ? <View style={light.summaryRow}>{summary}{unavailable}</View> : unavailable;
  }

  const toggle = <Pressable
        accessibilityRole="button"
        accessibilityLabel={isExpanded ? 'Masquer la carte du trajet' : expandLabel === 'Carte' ? 'Afficher la carte du trajet' : expandLabel}
        accessibilityState={{ expanded: isExpanded }}
        onPress={toggleMap}
        style={({ pressed }) => [
          styles.driverMapIconButton,
          variant === 'light' && light.button,
          textToggle && light.textToggle,
          isExpanded && !textToggle && styles.driverMapIconButtonActive,
          pressed && styles.driverMapIconButtonPressed,
        ]}
      >
        <Ionicons
          name={isExpanded ? 'map' : 'map-outline'}
          size={20}
          color={textToggle ? Colors.gray[600] : isExpanded ? Colors.white : Colors.primaryLight}
        />
        {variant === 'light' && <Text style={[{ flexShrink: 1, color: isExpanded ? Colors.white : Colors.gray[800] },
          textToggle && light.textToggleLabel]}>{isExpanded ? 'Masquer la carte' : expandLabel}</Text>}
        {textToggle && <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gray[500]} />}
      </Pressable>;

  return (
    <>
      {!overview && (summary ? <View style={light.summaryRow}>{summary}{toggle}</View> : toggle)}
      {visible && active && (
        <View
          testID={overview ? 'request-decision-map' : undefined}
          style={[styles.driverInlineMapFrame, variant === 'light' && light.frame,
            overview && light.overview, overview && { height: overviewHeight }]}
        >
          {shouldRenderMap && <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.driverInlineMap}
            mapType="standard"
            initialRegion={mapData.initialRegion}
            onMapReady={onMapReady}
            onLayout={onMapLayout}
            rotateEnabled={false}
            pitchEnabled={false}
            showsPointsOfInterest={false}
          >
            <Polyline
              coordinates={visibleCoordinates}
              strokeColor={Colors.primary}
              strokeWidth={5}
              lineDashPattern={displayedCoordinates && displayedCoordinates.length > 2 ? undefined : [4, 4]}
            />
            <Marker
              coordinate={mapData.departureCoordinate}
              title="Départ"
              description={departureName}
              image={require('@/assets/images/map-markers/trip-detail-marker-departure.png')}
              anchor={{ x: 0.5, y: 0.86 }}
              tracksViewChanges={false}
            />
            <Marker
              coordinate={mapData.arrivalCoordinate}
              title="Destination"
              description={arrivalName}
              image={require('@/assets/images/map-markers/trip-detail-marker-arrival.png')}
              anchor={{ x: 0.5, y: 0.86 }}
              tracksViewChanges={false}
            />
          </MapView>}
          {overview && !isMapReady && <View pointerEvents="none" style={light.loading}>
            <Text style={light.loadingText}>Chargement de la carte…</Text>
          </View>}
          <View pointerEvents="none" style={styles.driverMapCaption}>
            <Ionicons name="navigate" size={12} color={Colors.primaryDark} />
            <Text style={styles.driverMapCaptionText}>{displayedCoordinates && displayedCoordinates.length > 2 ? 'Itinéraire demandé' : 'Départ et destination'}</Text>
          </View>
        </View>
      )}
    </>
  );
}
const light = StyleSheet.create({
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  button: { position: 'relative', top: 0, right: 0, width: undefined, height: undefined, minHeight: 44,
    flexDirection: 'row', gap: 8, paddingHorizontal: 14, alignSelf: 'flex-end', backgroundColor: '#F5F7FA', borderColor: '#E1E5EB' },
  textToggle: { alignSelf: 'stretch', maxWidth: '100%', paddingHorizontal: 0, paddingVertical: 6,
    borderWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.gray[200], borderRadius: 0,
    backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0 },
  textToggleLabel: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500', color: Colors.gray[700] },
  frame: { height: 154, borderRadius: 16, marginTop: 4, marginHorizontal: 0, marginBottom: 8 },
  overview: { borderRadius: 0, borderWidth: 0, marginTop: 0, marginBottom: 0, backgroundColor: '#E9EFED' },
  unavailable: { padding: 16, flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#F2F4F6' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: Colors.gray[700], fontSize: 13, backgroundColor: '#FFFFFF', padding: 10, borderRadius: 12 },
});
