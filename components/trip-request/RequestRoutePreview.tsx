import { Colors } from '@/constants/styles';
import { RoutePointMarker } from '@/components/maps/RoutePointMarker';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';

type Props = Pick<RequestTripController, 'arrivalAddress' | 'arrivalLocation' | 'arrivalReference' | 'departureAddress' | 'departureLocation' | 'departureReference' | 'isRouteLoading' | 'routeCoordinates' | 'routeDistanceLabel' | 'routePreviewRegion'> & {
  onEditRoute: () => void;
  editDisabled: boolean;
};

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
  onEditRoute,
  editDisabled
}: Props) {
  const [showMap, setShowMap] = useState(false);
  return (<View style={styles.routeSummary}>
    <View style={styles.routeSummaryHeader}>
      <Text style={styles.routeSummaryTitle}>Votre trajet</Text>
      <TouchableOpacity onPress={onEditRoute} disabled={editDisabled} accessibilityState={{ disabled: editDisabled }}
        style={[styles.routeSummaryAction, editDisabled && styles.mainButtonDisabled]}
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
        {departureLocation && <RoutePointMarker kind="departure" coordinate={{ latitude: departureLocation.latitude, longitude: departureLocation.longitude }} title="Départ" />}
        {arrivalLocation && <RoutePointMarker kind="arrival" coordinate={{ latitude: arrivalLocation.latitude, longitude: arrivalLocation.longitude }} title="Destination" />}
        {routeCoordinates.length > 1 && <Polyline coordinates={routeCoordinates} strokeColor={Colors.primaryDark} strokeWidth={5} />}
      </MapView>
    </View>}
  </View>);
});
