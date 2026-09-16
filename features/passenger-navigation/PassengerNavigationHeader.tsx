import { Colors } from '@/constants/styles';
import { NavigationAssistanceButtons } from '@/features/navigation/NavigationAssistanceButtons';
import type { useNavigationAssistance } from '@/hooks/navigation/useNavigationAssistance';
import type { usePassengerNavigationController } from '@/hooks/passenger-navigation/usePassengerNavigationController';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  model: ReturnType<typeof usePassengerNavigationController>;
  assistance: ReturnType<typeof useNavigationAssistance>;
}
export function PassengerNavigationHeader({ model, assistance }: Props) {
  const { data, state, presentation, tripActions } = model;
  const title = presentation.tripStatus === 'waiting_pickup' ? 'En attente de récupération' :
    presentation.tripStatus === 'pickup_confirmation_needed' ? 'Récupération détectée' :
    presentation.tripStatus === 'in_transit' ? 'En route' :
    presentation.tripStatus === 'awaiting_dropoff_confirmation' ? 'Arrivée détectée' :
    presentation.tripStatus === 'completed' ? 'Arrivé' : 'Suivi du trajet';
  return <View onLayout={state.onHeaderLayout} style={[styles.header, {
    paddingTop: data.insets.top + 8,
    paddingLeft: Math.max(data.insets.left, 12), paddingRight: Math.max(data.insets.right, 12),
  }]}>
    <View style={styles.row}>
      <TouchableOpacity style={styles.iconButton} onPress={state.navigateBackSafely}
        accessibilityRole="button" accessibilityLabel="Quitter la navigation">
        <Ionicons name="arrow-back" size={24} color={Colors.gray[800]} />
      </TouchableOpacity>
      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        {state.isSocketConnected && !data.offlineBooking && !data.offlineTrip && <Text style={styles.live}>En direct</Text>}
        {(data.offlineBooking || data.offlineTrip) && <Text style={styles.subtitle}>Hors connexion</Text>}
      </View>
      <TouchableOpacity style={styles.iconButton} onPress={() => void tripActions.handleShareTrip()}
        disabled={data.isCreatingTripShareLink} accessibilityRole="button" accessibilityLabel="Partager le trajet">
        {data.isCreatingTripShareLink ? <ActivityIndicator size="small" color={Colors.primary} /> :
          <Ionicons name="share-social-outline" size={23} color={Colors.primary} />}
      </TouchableOpacity>
    </View>
    <View style={styles.row}>
      <View style={styles.driver}>
        <Text style={styles.subtitle}>Votre conducteur</Text>
        <Text style={styles.name} numberOfLines={1}>{data.trip?.driverName || 'Conducteur'}</Text>
      </View>
      <NavigationAssistanceButtons role="passenger" onContact={assistance.openContacts} onSos={assistance.openSos} disabled={!assistance.enabled} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, backgroundColor: Colors.white,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingBottom: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.gray[50], alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, minWidth: 0, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: Colors.gray[900], textAlign: 'center' },
  live: { fontSize: 12, fontWeight: '600', color: Colors.successDark, marginTop: 3 },
  driver: { flex: 1, minWidth: 0 },
  subtitle: { color: Colors.gray[600], fontSize: 12 },
  name: { color: Colors.gray[900], fontWeight: '600', fontSize: 14, marginTop: 3 },
});
