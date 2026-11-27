import { memo } from 'react';
import { Text, View } from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { RoutePointMarker } from '@/components/maps/RoutePointMarker';
import { ACTION_COLORS } from '@/constants/actionColors';
import { getMapCoordinate } from '@/features/trip-request/requestFormModel';
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
      {departure && <RoutePointMarker kind="departure" coordinate={departure} title="Départ" />}
      {arrival && <RoutePointMarker kind="arrival" coordinate={arrival} title="Destination" />}
      {form.routeCoordinates.length > 1 && <Polyline coordinates={form.routeCoordinates} strokeWidth={4} strokeColor={ACTION_COLORS.orange} />}
    </MapView>}
    <View style={s.mapStatus}>
      <Text style={s.label}>{form.isRouteLoading ? 'Calcul de l’itinéraire…'
        : departure && arrival ? form.routeDistanceLabel || 'Itinéraire à confirmer'
          : arrival ? 'Votre destination' : departure ? 'Votre point de départ' : 'Aperçu du trajet'}</Text>
    </View>
  </View>;
});
