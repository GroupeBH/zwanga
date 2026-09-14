import { Colors } from '@/constants/styles';
import { REQUEST_MAP_MARKER_ANCHOR } from '@/features/trip-request/requestFormModel';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import {
  ActivityIndicator,
  type ImageRequireSource,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';

const requestMapMarkerImages: Record<'departure' | 'arrival', ImageRequireSource> = {
  departure: require('@/assets/images/map-markers/trip-detail-marker-departure.png'),
  arrival: require('@/assets/images/map-markers/trip-detail-marker-arrival.png'),
};

type Props = Pick<RequestTripController, 'arrivalAddress' | 'arrivalLocation' | 'departureAddress' | 'departureLocation' | 'isRouteLoading' | 'routeCoordinates' | 'routeDistanceLabel' | 'routePreviewRegion' | 'setRequestFormStep'>;

export const RequestRoutePreview = memo(function RequestRoutePreview({
  arrivalAddress,
  arrivalLocation,
  departureAddress,
  departureLocation,
  isRouteLoading,
  routeCoordinates,
  routeDistanceLabel,
  routePreviewRegion,
  setRequestFormStep
}: Props) {
  return (<View style={styles.offerMap}>
    <MapView
      style={styles.mapPreviewMap}
      provider={PROVIDER_GOOGLE}
      region={routePreviewRegion}
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
    >
      {departureLocation ? (
        <Marker
          coordinate={{
            latitude: departureLocation.latitude,
            longitude: departureLocation.longitude,
          }}
          anchor={REQUEST_MAP_MARKER_ANCHOR}
          image={requestMapMarkerImages.departure}
          title="Départ"
          tracksViewChanges={false}
        />
      ) : null}
      {arrivalLocation ? (
        <Marker
          coordinate={{
            latitude: arrivalLocation.latitude,
            longitude: arrivalLocation.longitude,
          }}
          anchor={REQUEST_MAP_MARKER_ANCHOR}
          image={requestMapMarkerImages.arrival}
          title="Destination"
          tracksViewChanges={false}
        />
      ) : null}
      {routeCoordinates.length > 1 ? (
        <Polyline
          coordinates={routeCoordinates}
          strokeColor={Colors.primaryDark}
          strokeWidth={5}
        />
      ) : null}
    </MapView>
    <View pointerEvents="none" style={styles.offerMapShade} />
    <TouchableOpacity
      style={styles.offerMapBack}
      onPress={() => setRequestFormStep('route')}
      activeOpacity={0.85}
    >
      <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
    </TouchableOpacity>
    <View style={styles.offerRouteCard}>
      <View style={styles.offerRouteRow}>
        <Ionicons name="navigate" size={16} color={Colors.success} />
        <Text style={styles.offerRouteText} numberOfLines={1}>{departureAddress}</Text>
      </View>
      <View style={styles.offerRouteDivider} />
      <View style={styles.offerRouteRow}>
        <Ionicons name="flag" size={16} color={Colors.primary} />
        <Text style={styles.offerRouteText} numberOfLines={1}>{arrivalAddress}</Text>
      </View>
    </View>
    <View pointerEvents="none" style={styles.routeStatusBadge}>
      {isRouteLoading ? (
        <ActivityIndicator color={Colors.primary} size="small" />
      ) : (
        <Ionicons
          name={routeCoordinates.length > 1 ? 'git-branch' : 'map-outline'}
          size={15}
          color={Colors.primary}
        />
      )}
      <Text style={styles.routeStatusText}>
        {isRouteLoading
          ? 'Calcul itinéraire'
          : routeDistanceLabel
            ? routeDistanceLabel
            : routeCoordinates.length > 1
              ? 'Itinéraire prêt'
              : 'Zone estimée'}
      </Text>
    </View>
  </View>);
});
