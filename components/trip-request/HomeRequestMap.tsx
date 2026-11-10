import { memo } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { ACTION_COLORS } from '@/constants/actionColors';
import { REQUEST_MAP_MARKER_ANCHOR, getMapCoordinate } from '@/features/trip-request/requestFormModel';
import { homeRequestStyles as s } from '@/features/trip-request/homeRequestStyles';
import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';

type Props = Pick<RequestTripController, 'departureLocation' | 'arrivalLocation' | 'routeCoordinates' |
  'routePreviewRegion' | 'routeDistanceLabel' | 'isRouteLoading'> & { enabled: boolean; height: number };

export const HomeRequestMap = memo(function HomeRequestMap({ enabled, height, ...form }: Props) {
  const departure = getMapCoordinate(form.departureLocation);
  const arrival = getMapCoordinate(form.arrivalLocation);
  return <View style={[s.map, { height }]} testID="home-request-map">
    {enabled && <MapView style={s.mapFill} provider={PROVIDER_GOOGLE} region={form.routePreviewRegion}
      scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false}>
      {departure && <Marker coordinate={departure} title="Départ" anchor={REQUEST_MAP_MARKER_ANCHOR}
        image={require('@/assets/images/map-markers/trip-detail-marker-departure.png')} tracksViewChanges={false} />}
      {arrival && <Marker coordinate={arrival} title="Destination" anchor={REQUEST_MAP_MARKER_ANCHOR}
        image={require('@/assets/images/map-markers/trip-detail-marker-arrival.png')} tracksViewChanges={false} />}
      {form.routeCoordinates.length > 1 && <Polyline coordinates={form.routeCoordinates} strokeWidth={4} strokeColor={ACTION_COLORS.orange} />}
    </MapView>}
    <View style={s.mapStatus}>
      <Text style={s.label}>{form.isRouteLoading ? 'Calcul de l’itinéraire…'
        : departure && arrival ? form.routeDistanceLabel || 'Itinéraire à confirmer'
          : arrival ? 'Votre destination' : departure ? 'Votre point de départ' : 'Aperçu du trajet'}</Text>
    </View>
  </View>;
});
