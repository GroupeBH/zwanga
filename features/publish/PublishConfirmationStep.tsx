import { type PublishStep, type PublicationSuccess, type LatLng, PUBLISH_MAP_PROVIDER } from './publishModel';
import { styles } from '../screen-styles/app/publish/index';
import type { MapLocationSelection } from '@/components/LocationPickerModal';
import { Colors } from '@/constants/styles';
import Animated, { type FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';

interface PublishConfirmationStepProps {
  acceptedPaymentModes: import('@/types').TripPaymentMode[];
  stepEntering: FadeInDown | undefined;
  publicationSuccess: PublicationSuccess;
  routePreviewRegion: Region;
  departureLocation: MapLocationSelection | null;
  arrivalLocation: MapLocationSelection | null;
  routeCoordinates: LatLng[];
  isRouteLoading: boolean;
  departureSummary: { title: string; address: string; latitude: number | undefined; longitude: number | undefined; };
  departureReference: string;
  arrivalSummary: { title: string; address: string; latitude: number | undefined; longitude: number | undefined; };
  arrivalReference: string;
  formattedFullDateTime: string;
  isRecurringTrip: boolean;
  recurringDaysSummary: string;
  formattedRecurringEndDate: string;
  selectedVehicle?: import('@/types').Vehicle;
  seats: string;
  isFreeTrip: boolean;
  price: string;
  requiresPassengerKyc: boolean;
  description: string;
  goToStep: (nextStep: PublishStep) => void;
  isSubmittingTrip: boolean;
}


export function PublishConfirmationStep(props: PublishConfirmationStepProps) {
  const [showMap, setShowMap] = useState(false);
  const { publicationSuccess, routePreviewRegion, departureLocation, arrivalLocation, routeCoordinates, isRouteLoading } = props;
  return <Animated.View entering={props.stepEntering} style={s.content}>
    <Text style={s.title}>Tout est correct ?</Text>
    <View style={s.section}>
      <View style={s.heading}><Text style={s.label}>Itinéraire et départ</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Modifier l’itinéraire et l’horaire"
          disabled={props.isSubmittingTrip} style={s.edit} onPress={() => props.goToStep('route')}>
          <Text style={s.link}>Modifier</Text>
        </TouchableOpacity>
      </View>
      {(['departure', 'arrival'] as const).map(point => {
        const summary = point === 'departure' ? props.departureSummary : props.arrivalSummary;
        const reference = point === 'departure' ? props.departureReference : props.arrivalReference;
        return <View key={point} style={s.route}>
          <Ionicons name={point === 'departure' ? 'ellipse' : 'location'} size={16}
            color={point === 'departure' ? Colors.success : Colors.primary} />
          <View style={s.copy}>
            <Text style={s.hint}>{point === 'departure' ? 'Départ' : 'Arrivée'}</Text>
            <Text style={s.place}>{summary.title}</Text>
            {!!summary.address && summary.address !== summary.title && <Text style={s.hint}>{summary.address}</Text>}
            {!!reference.trim() && <Text style={s.hint}>{reference.trim()}</Text>}
          </View>
        </View>;
      })}
      <Text style={s.date}>{props.formattedFullDateTime}</Text>
      {props.isRecurringTrip && <Text style={s.hint}>
        {props.recurringDaysSummary} · Fin : {props.formattedRecurringEndDate}
      </Text>}
    </View>
    <View style={s.section}>
      <View style={s.heading}><Text style={s.label}>Véhicule et prix</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Modifier le véhicule, les places et le prix"
          disabled={props.isSubmittingTrip} style={s.edit} onPress={() => props.goToStep('pricing')}>
          <Text style={s.link}>Modifier</Text>
        </TouchableOpacity>
      </View>
      {props.selectedVehicle && <View style={s.copy}>
        <Text style={s.place}>{props.selectedVehicle.brand} {props.selectedVehicle.model}</Text>
        <Text style={s.hint}>{props.selectedVehicle.licensePlate}</Text>
      </View>}
      <View style={s.heading}>
        <Text style={s.date}>{props.seats} place{Number(props.seats) > 1 ? 's' : ''}</Text>
        <Text style={s.price}>{props.isFreeTrip ? 'Gratuit' : `${Number(props.price).toLocaleString('fr-FR')} FC / place`}</Text>
      </View>
      {!props.isFreeTrip && <Text style={s.hint}>Paiements : {props.acceptedPaymentModes.map(mode =>
        ({ cash: 'Cash', electronic: 'Électronique', points: 'Jetons' })[mode]).join(' · ')}</Text>}
      {props.requiresPassengerKyc && <Text style={s.hint}>Passagers vérifiés uniquement</Text>}
      {!!props.description.trim() && <Text style={s.hint}>Note : {props.description.trim()}</Text>}
    </View>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showMap }} style={s.mapToggle}
      onPress={() => setShowMap(value => !value)}>
      <Ionicons name="map-outline" size={18} color={Colors.primaryDark} />
      <Text style={s.link}>{showMap ? 'Masquer la carte' : 'Voir l’itinéraire sur la carte'}</Text>
    </TouchableOpacity>
    {showMap && <View style={[styles.publishMapPreview, styles.confirmMapPreview]}>
        {publicationSuccess === null ? (
          <MapView
            style={styles.publishMapPreviewMap}
            provider={PUBLISH_MAP_PROVIDER}
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
                pinColor={Colors.success}
                title="Départ"
              />
            ) : null}
            {arrivalLocation ? (
              <Marker
                coordinate={{
                  latitude: arrivalLocation.latitude,
                  longitude: arrivalLocation.longitude,
                }}
                pinColor={Colors.primary}
                title="Destination"
              />
            ) : null}
            {routeCoordinates.length > 1 ? (
              <Polyline coordinates={routeCoordinates} strokeColor={Colors.primary} strokeWidth={5} />
            ) : null}
          </MapView>
        ) : (
          <View style={styles.publishMapPreviewMap} />
        )}
        <View pointerEvents="none" style={styles.publishMapPreviewShade} />
        {departureLocation && arrivalLocation ? (
          <View pointerEvents="none" style={styles.routeStatusBadge}>
            {isRouteLoading ? (
              <ActivityIndicator color={Colors.primary} size="small" />
            ) : (
              <Ionicons
                name={routeCoordinates.length > 1 ? 'git-branch' : 'alert-circle-outline'}
                size={15}
                color={routeCoordinates.length > 1 ? Colors.primary : Colors.gray[500]}
              />
            )}
            <Text style={styles.routeStatusText}>
              {isRouteLoading
                ? "Calcul de l'itinéraire"
                : routeCoordinates.length > 1
                  ? 'Itinéraire Google'
                  : 'Route à recalculer'}
            </Text>
          </View>
        ) : null}
      </View>}
  </Animated.View>;
}
const s = StyleSheet.create({
  content: { gap: 10 }, title: { fontSize: 20, fontWeight: '700', color: Colors.gray[900] },
  section: { backgroundColor: Colors.white, borderRadius: 14, paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.gray[700], flexShrink: 1 },
  edit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  link: { color: Colors.primaryDark, fontSize: 13, fontWeight: '600' },
  route: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  copy: { flex: 1, gap: 2, minWidth: 0 }, hint: { fontSize: 12, lineHeight: 18, color: Colors.gray[600] },
  place: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: Colors.gray[900] },
  date: { fontSize: 14, lineHeight: 20, color: Colors.gray[800] },
  price: { fontSize: 18, fontWeight: '700', color: Colors.primaryDark },
  mapToggle: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 },
});
