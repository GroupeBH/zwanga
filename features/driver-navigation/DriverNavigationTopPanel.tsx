import { Colors } from '@/constants/styles';
import { NavigationAssistanceButtons } from '@/features/navigation/NavigationAssistanceButtons';
import { RideRecoveryControl } from '@/features/ride-recovery/RideRecoveryControl';
import type { useNavigationAssistance } from '@/hooks/navigation/useNavigationAssistance';
import type { useDriverNavigationController } from '@/hooks/driver-navigation/useDriverNavigationController';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { DriverNavigationPassengersBar } from './DriverNavigationPassengersBar';
import { DriverDropoffReceipts } from './DriverDropoffReceipts';
import { getDriverPendingBookingLayout } from './driverPendingBookingLayout';
import { getDriverNavigationLayout } from './driverNavigationLayout';

const EMPTY_BOOKINGS: NonNullable<Props['model']['session']['foundation']['data']['bookings']> = [];

interface Props {
  model: ReturnType<typeof useDriverNavigationController>;
  assistance: ReturnType<typeof useNavigationAssistance>;
}

export function DriverNavigationTopPanel({ model, assistance }: Props) {
  const { height } = useWindowDimensions();
  const { data, mapState, passengers } = model.session.foundation;
  const offline = data.offlineTrip || data.offlineBookings;
  const live = !offline && mapState.isSocketConnected;
  const hasUrgentDropoff = Boolean(passengers.activePassengerInterruptionBooking);
  const hasPendingBooking = data.isTripOngoing && !hasUrgentDropoff && Boolean(passengers.activePendingBooking);
  const pendingLayout = getDriverPendingBookingLayout(height, data.insets.top, data.insets.bottom);
  const layout = getDriverNavigationLayout(height, data.insets.top, data.insets.bottom);
  const nextStop = mapState.waypoints[mapState.currentWaypointIndex];
  const nextPassengerId = !nextStop?.completed ? nextStop?.booking?.passengerId : undefined;
  const contactActions = <NavigationAssistanceButtons inline role="driver"
    onContact={nextPassengerId && !hasPendingBooking && !hasUrgentDropoff ? () => assistance.openContact(nextPassengerId) : assistance.openContacts}
    onSos={assistance.openSos} disabled={!assistance.enabled} />;
  const recovery = data.isTripOngoing && !hasUrgentDropoff && Boolean(data.bookings?.length) ? <View style={styles.confirmation}>
    <RideRecoveryControl tripId={data.tripId} bookings={data.bookings} actor="driver"
      condensed driverNavigation secondaryActions={contactActions} driverOverviewOnly={hasPendingBooking}
      preferredBookingId={!nextStop?.completed ? nextStop?.booking?.id : undefined}
      preferredStage={!nextStop?.completed ? nextStop?.type : undefined}
      fix={mapState.currentLocation ? { ...mapState.currentLocation.coords, recordedAt: mapState.currentLocation.timestamp, accuracy: mapState.currentLocation.coords.accuracy ?? undefined } : null}
      destination={data.tripArrivalCoordinate} />
  </View> : null;
  return <View pointerEvents="box-none" style={[styles.panel, {
    top: data.insets.top + 8, left: Math.max(data.insets.left, 12), right: Math.max(data.insets.right, 12),
    maxHeight: hasPendingBooking || hasUrgentDropoff ? pendingLayout.panelMaxHeight : layout.panelMaxHeight,
  }]}>
    <View style={styles.header}>
      <TouchableOpacity style={styles.back} onPress={model.handleExitNavigation} hitSlop={8}
        accessibilityRole="button" accessibilityLabel="Retour au trajet"
        accessibilityHint="Le trajet continue. Ce bouton ne l’arrête pas.">
        <Ionicons name="arrow-back" size={24} color={Colors.gray[800]} />
      </TouchableOpacity>
      <View style={styles.info}>
        <View style={styles.summary}>
          <Text style={styles.duration}>{data.trip?.status === 'completed' ? 'Trajet terminé' : data.isTripOngoing ? 'Trajet en cours' : 'Votre trajet'}</Text>
          <View style={styles.connection}>
            <Text style={[styles.connectionText, live && styles.connectedText]}>
              {offline ? 'Sans connexion' : live ? 'Connecté' : 'Connexion…'}
            </Text>
          </View>
        </View>
        <View style={styles.metrics}>
          <Text style={styles.metric}>{model.presentation.displayedDurationText} · {model.presentation.displayedDistanceText}</Text>
        </View>
      </View>
    </View>
    <View style={styles.journey}>
    {(data.isTripOngoing || data.trip?.status === 'completed') && (hasUrgentDropoff || hasPendingBooking ? <DriverNavigationPassengersBar
      onContact={assistance.openContact}
      foundation={model.session.foundation} passengerPresentation={model.passengerPresentation} bookingActions={model.bookingActions} />
      : <ScrollView style={[styles.scroll, mapState.waypoints.length > 0 && styles.stopsScroll]} contentContainerStyle={styles.details}
      showsVerticalScrollIndicator bounces={false}>
      {data.trip?.status === 'completed' && <DriverDropoffReceipts bookings={data.bookings ?? EMPTY_BOOKINGS} tripId={data.tripId} active={data.isScreenActive} />}
      {data.isTripOngoing && <DriverNavigationPassengersBar
        onContact={assistance.openContact}
        foundation={model.session.foundation} passengerPresentation={model.passengerPresentation} bookingActions={model.bookingActions} />}
    </ScrollView>)}
    {recovery}
    {!recovery && <View style={styles.actions}>{contactActions}</View>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', gap: 6, zIndex: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, backgroundColor: Colors.white, padding: 6 },
  back: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.gray[100] },
  info: { flex: 1, minWidth: 0, gap: 4 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  duration: { color: Colors.gray[900], fontSize: 15, fontWeight: '700', flexShrink: 1 },
  connection: { flexShrink: 1 },
  connectionText: { color: Colors.gray[600], fontSize: 11, fontWeight: '500' },
  connectedText: { color: Colors.successDark },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  metric: { color: Colors.gray[600], fontSize: 13, flexShrink: 1 },
  journey: { flexShrink: 1, minHeight: 0, backgroundColor: Colors.white, borderRadius: 20, padding: 10, gap: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexShrink: 0 },
  confirmation: { flexShrink: 0, minWidth: 130, paddingTop: 4 },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  stopsScroll: { minHeight: 64 },
  details: { gap: 6, paddingBottom: 2 },
});
