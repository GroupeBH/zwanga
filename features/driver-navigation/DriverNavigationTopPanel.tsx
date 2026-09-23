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
  return <View pointerEvents="box-none" style={[styles.panel, {
    top: data.insets.top + 8, left: Math.max(data.insets.left, 12), right: Math.max(data.insets.right, 12),
    maxHeight: hasPendingBooking ? pendingLayout.panelMaxHeight : undefined,
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
      {data.isTripOngoing && !hasUrgentDropoff && <View style={styles.confirmation}>
        <RideRecoveryControl tripId={data.tripId} bookings={data.bookings} actor="driver"
          compact={hasPendingBooking || undefined}
          fix={mapState.currentLocation ? { ...mapState.currentLocation.coords, recordedAt: mapState.currentLocation.timestamp, accuracy: mapState.currentLocation.coords.accuracy ?? undefined } : null}
          destination={data.tripArrivalCoordinate} />
      </View>}
      <NavigationAssistanceButtons role="driver" onContact={assistance.openContacts} onSos={assistance.openSos} disabled={!assistance.enabled} />
    </View>
    {(data.isTripOngoing || data.trip?.status === 'completed') && (hasUrgentDropoff || hasPendingBooking ? <DriverNavigationPassengersBar
      foundation={model.session.foundation} passengerPresentation={model.passengerPresentation} bookingActions={model.bookingActions} />
      : <ScrollView style={{ flexGrow: 0, maxHeight: Math.max(80, height * 0.3) }} contentContainerStyle={styles.details}
      showsVerticalScrollIndicator bounces={false}>
      <DriverDropoffReceipts bookings={data.bookings ?? EMPTY_BOOKINGS} tripId={data.tripId} active={data.isScreenActive} />
      {model.presentation.canToggleRouteSections && <View style={styles.segments}>
        {(['next', 'remaining'] as const).map(section => <TouchableOpacity key={section}
          style={[styles.segment, mapState.routeSectionFocus === section && styles.segmentActive]}
          onPress={() => mapState.setRouteSectionFocus(section)} accessibilityRole="button"
          accessibilityState={{ selected: mapState.routeSectionFocus === section }}>
          <Text style={[styles.segmentText, mapState.routeSectionFocus === section && styles.segmentTextActive]}>
            {section === 'next' ? 'Prochain arrêt' : 'Reste du trajet'}
          </Text>
        </TouchableOpacity>)}
      </View>}
      {(mapState.waypoints.length > 0 || passengers.activePendingBooking) && <DriverNavigationPassengersBar
        foundation={model.session.foundation} passengerPresentation={model.passengerPresentation} bookingActions={model.bookingActions} />}
    </ScrollView>)}
  </View>;
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', gap: 8, zIndex: 40 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  back: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: '#26363D' },
  info: { flex: 1, minWidth: 0, backgroundColor: '#26363D', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  duration: { color: Colors.white, fontSize: 24, fontWeight: '800', flexShrink: 1 },
  connection: { borderRadius: 12, backgroundColor: '#435159', paddingHorizontal: 8, paddingVertical: 5, flexShrink: 1 },
  connected: { backgroundColor: '#234F44' },
  connectionText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  connectedText: { color: '#8EE8BA' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  metric: { color: '#E3EAED', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 8 },
  confirmation: { flex: 1, minWidth: 130, backgroundColor: Colors.white, borderRadius: 18, padding: 8 },
  details: { gap: 8, paddingBottom: 4 },
  segments: { flexDirection: 'row', gap: 4, borderRadius: 16, padding: 4, backgroundColor: Colors.white },
  segment: { flex: 1, minHeight: 44, padding: 8, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  segmentActive: { backgroundColor: Colors.primary },
  segmentText: { color: Colors.gray[700], fontWeight: '600', fontSize: 12, textAlign: 'center' },
  segmentTextActive: { color: Colors.white },
});
