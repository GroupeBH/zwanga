import { RequestRouteMapData } from './requestDetailModel';
import { styles } from '../screen-styles/app/request/detail/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { LatLng } from 'react-native-maps';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';

export type CollapsibleRouteMapProps = {
  arrivalName: string;
  departureName: string;
  mapData: RequestRouteMapData | null;
  routeCoordinates: LatLng[];
};

export function CollapsibleRouteMap({
  arrivalName,
  departureName,
  mapData,
  routeCoordinates,
}: CollapsibleRouteMapProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const mapRef = useRef<MapView>(null);

  const fitMapToRoute = useCallback(() => {
    if (!mapData) return;

    const visibleCoordinates =
      routeCoordinates.length > 1 ? routeCoordinates : mapData.fallbackCoordinates;

    requestAnimationFrame(() => {
      mapRef.current?.fitToCoordinates(visibleCoordinates, {
        edgePadding: { top: 34, right: 34, bottom: 34, left: 34 },
        animated: false,
      });
    });
  }, [mapData, routeCoordinates]);

  useEffect(() => {
    if (isExpanded) {
      fitMapToRoute();
    }
  }, [fitMapToRoute, isExpanded]);

  const toggleMap = useCallback(() => {
    setIsExpanded((currentValue) => !currentValue);
  }, []);

  if (!mapData) {
    return (
      <View
        accessibilityLabel="Carte indisponible pour ce trajet"
        style={[styles.driverMapIconButton, styles.driverMapIconButtonDisabled]}
      >
        <Ionicons name="map-outline" size={16} color={Colors.gray[400]} />
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isExpanded ? 'Masquer la carte du trajet' : 'Afficher la carte du trajet'}
        accessibilityState={{ expanded: isExpanded }}
        onPress={toggleMap}
        style={({ pressed }) => [
          styles.driverMapIconButton,
          isExpanded && styles.driverMapIconButtonActive,
          pressed && styles.driverMapIconButtonPressed,
        ]}
      >
        <Ionicons
          name={isExpanded ? 'map' : 'map-outline'}
          size={20}
          color={isExpanded ? Colors.white : Colors.primaryLight}
        />
      </Pressable>

      {isExpanded && (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutUp.duration(160)}
          style={styles.driverInlineMapFrame}
        >
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.driverInlineMap}
            mapType="standard"
            initialRegion={mapData.initialRegion}
            onMapReady={fitMapToRoute}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            <Polyline
              coordinates={routeCoordinates.length > 0 ? routeCoordinates : mapData.fallbackCoordinates}
              strokeColor={Colors.primary}
              strokeWidth={5}
              lineDashPattern={routeCoordinates.length > 0 ? undefined : [4, 4]}
            />
            <Marker
              coordinate={mapData.departureCoordinate}
              title="Départ"
              description={departureName}
            >
              <View style={[styles.driverMapMarker, styles.driverMapMarkerDeparture]}>
                <View style={styles.driverMapMarkerCore} />
              </View>
            </Marker>
            <Marker
              coordinate={mapData.arrivalCoordinate}
              title="Destination"
              description={arrivalName}
            >
              <View style={[styles.driverMapMarker, styles.driverMapMarkerArrival]}>
                <Ionicons name="flag" size={13} color={Colors.white} />
              </View>
            </Marker>
          </MapView>
          <View pointerEvents="none" style={styles.driverMapCaption}>
            <Ionicons name="navigate" size={12} color={Colors.primaryDark} />
            <Text style={styles.driverMapCaptionText}>Itinéraire demandé</Text>
          </View>
        </Animated.View>
      )}
    </>
  );
}
