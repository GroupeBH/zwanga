import { TripShareAction } from '@/components/trip/TripShareAction';
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
  const recovery = data.isTripOngoing && !hasUrgentDropoff && Boolean(data.bookings?.length) ? <View style={styles.confirmation}>
    <RideRecoveryControl tripId={data.tripId} bookings={data.bookings} actor="driver"
      condensed
      fix={mapState.currentLocation ? { ...mapState.currentLocation.coords, recordedAt: mapState.currentLocation.timestamp, accuracy: mapState.currentLocation.coords.accuracy ?? undefined } : null}
      destination={data.tripArrivalCoordinate} />
  </View> : null;
  return <View pointerEvents="box-none" style={[styles.panel, {
    top: data.insets.top + 8, left: Math.max(data.insets.left, 12), right: Math.max(data.insets.right, 12),
    maxHeight: hasPendingBooking || hasUrgentDropoff ? pendingLayout.panelMaxHeight : layout.panelMaxHeight,
  }]}>
    <View style={styles.header}>
      <TouchableOpacity style={styles.back} onPress={model.handleExitNavigation} hitSlop={8}
        accessibilityRole="button" accessibilityLabel="Quitter la navigation">
        <Ionicons name="close" size={28} color={Colors.white} />
      </TouchableOpacity>
      <View style={styles.info}>
        <View style={styles.summary}>
          <Text style={styles.duration}>{model.presentation.displayedDurationText}</Text>
          <View style={[styles.connection, live && styles.connected]}>
            <Text style={[styles.connectionText, live && styles.connectedText]}>
              {offline ? 'Hors connexion' : live ? 'En direct' : 'Connexion…'}
            </Text>
          </View>
        </View>
        <View style={styles.metrics}>
          <Text style={styles.metric}>{model.presentation.displayedDistanceText}</Text>
          {model.presentation.displayedEtaText && <Text style={styles.metric}>Arrivée à {model.presentation.displayedEtaText}</Text>}
        </View>
      </View>
    </View>
    <View style={styles.actions}>
      {!hasPendingBooking && !hasUrgentDropoff && <TripShareAction compact inline onShare={model.tripActions.handleShareTrip} disabled={data.isCreatingTripShareLink} />}
      <NavigationAssistanceButtons inline role="driver" onContact={assistance.openContacts} onSos={assistance.openSos} disabled={!assistance.enabled} />
    </View>
    {(data.isTripOngoing || data.trip?.status === 'completed') && (hasUrgentDropoff || hasPendingBooking ? <DriverNavigationPassengersBar
      onContact={assistance.openContact}
      foundation={model.session.foundation} passengerPresentation={model.passengerPresentation} bookingActions={model.bookingActions} />
      : <ScrollView style={styles.scroll} contentContainerStyle={styles.details}
      showsVerticalScrollIndicator bounces={false}>
      {data.trip?.status === 'completed' && <DriverDropoffReceipts bookings={data.bookings ?? EMPTY_BOOKINGS} tripId={data.tripId} active={data.isScreenActive} />}
      {(mapState.waypoints.length > 0 || passengers.activePendingBooking) && <DriverNavigationPassengersBar
        onContact={assistance.openContact}
        foundation={model.session.foundation} passengerPresentation={model.passengerPresentation} bookingActions={model.bookingActions} />}
    </ScrollView>)}
    {recovery}
  </View>;
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', gap: 8, zIndex: 40 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  back: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: '#26363D' },
  info: { flex: 1, minWidth: 0, backgroundColor: '#26363D', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  duration: { color: Colors.white, fontSize: 20, fontWeight: '800', flexShrink: 1 },
  connection: { borderRadius: 12, backgroundColor: '#435159', paddingHorizontal: 8, paddingVertical: 5, flexShrink: 1 },
  connected: { backgroundColor: '#234F44' },
  connectionText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  connectedText: { color: '#8EE8BA' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  metric: { color: '#E3EAED', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  confirmation: { flexShrink: 0, minWidth: 130, backgroundColor: Colors.white, borderRadius: 16, padding: 8 },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  details: { gap: 6, paddingBottom: 2 },
});
