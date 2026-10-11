import { Colors } from '@/constants/styles';
import { REQUEST_MAP_MARKER_ANCHOR } from '@/features/trip-request/requestFormModel';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useState } from 'react';
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

type Props = Pick<RequestTripController, 'arrivalAddress' | 'arrivalLocation' | 'arrivalReference' | 'departureAddress' | 'departureLocation' | 'departureReference' | 'isRouteLoading' | 'routeCoordinates' | 'routeDistanceLabel' | 'routePreviewRegion' | 'setRequestFormStep'>;

export const RequestRoutePreview = memo(function RequestRoutePreview({
  arrivalAddress,
  arrivalLocation,
  arrivalReference,
  departureAddress,
  departureLocation,
  departureReference,
  isRouteLoading,
  routeCoordinates,
  routeDistanceLabel,
  routePreviewRegion,
  setRequestFormStep
}: Props) {
  const [showMap, setShowMap] = useState(false);
  return (<View style={styles.routeSummary}>
    <View style={styles.routeSummaryHeader}>
      <Text style={styles.routeSummaryTitle}>Votre trajet</Text>
      <TouchableOpacity onPress={() => setRequestFormStep('route')} style={styles.routeSummaryAction}
        accessibilityRole="button" accessibilityLabel="Modifier le départ et la destination">
        <Text style={styles.routeSummaryActionText}>Modifier</Text>
      </TouchableOpacity>
    </View>
    <View style={styles.offerRouteRow}>
      <Ionicons name="navigate" size={16} color={Colors.success} />
      <View style={styles.offerRouteCopy}>
        <Text style={styles.offerRouteText} numberOfLines={2}>{departureAddress}</Text>
        {!!departureReference.trim() && <Text style={styles.offerRouteReference}>Référence : {departureReference.trim()}</Text>}
      </View>
    </View>
    <View style={styles.offerRouteDivider} />
    <View style={styles.offerRouteRow}>
      <Ionicons name="flag" size={16} color={Colors.primary} />
      <View style={styles.offerRouteCopy}>
        <Text style={styles.offerRouteText} numberOfLines={2}>{arrivalAddress}</Text>
        {!!arrivalReference.trim() && <Text style={styles.offerRouteReference}>Référence : {arrivalReference.trim()}</Text>}
      </View>
    </View>
    <View style={styles.routeSummaryFooter}>
      <View style={styles.routeSummaryDistance}>
        {isRouteLoading && <ActivityIndicator color={Colors.primary} size="small" />}
        <Text style={styles.routeStatusText}>
          {isRouteLoading ? 'Calcul du trajet…' : routeDistanceLabel || 'Distance à confirmer'}
        </Text>
      </View>
      <TouchableOpacity onPress={() => setShowMap(value => !value)} style={styles.routeSummaryAction}
        accessibilityRole="button" accessibilityState={{ expanded: showMap }}>
        <Text style={styles.routeSummaryActionText}>{showMap ? 'Masquer la carte' : 'Voir la carte'}</Text>
        <Ionicons name={showMap ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.primaryDark} />
      </TouchableOpacity>
    </View>
    {showMap && <View style={styles.offerMap}>
      <MapView style={styles.mapPreviewMap} provider={PROVIDER_GOOGLE} region={routePreviewRegion}
        scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false}>
        {departureLocation && <Marker coordinate={{ latitude: departureLocation.latitude, longitude: departureLocation.longitude }}
          anchor={REQUEST_MAP_MARKER_ANCHOR} image={requestMapMarkerImages.departure} title="Départ" tracksViewChanges={false} />}
        {arrivalLocation && <Marker coordinate={{ latitude: arrivalLocation.latitude, longitude: arrivalLocation.longitude }}
          anchor={REQUEST_MAP_MARKER_ANCHOR} image={requestMapMarkerImages.arrival} title="Destination" tracksViewChanges={false} />}
        {routeCoordinates.length > 1 && <Polyline coordinates={routeCoordinates} strokeColor={Colors.primaryDark} strokeWidth={5} />}
      </MapView>
    </View>}
  </View>);
});
