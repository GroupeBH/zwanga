import { useDriverNavigationFoundation } from '../../hooks/driver-navigation/useDriverNavigationFoundation';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors } from '@/constants/styles';
import { DriverInterruptionPrompt } from './DriverInterruptionPrompt';
import { DriverPendingBookingPrompt } from './DriverPendingBookingPrompt';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Booking } from '@/types';

interface DriverNavigationPassengersBarProps {
  onContact: (passengerId: string) => void;
  foundation: ReturnType<typeof useDriverNavigationFoundation>;
  passengerPresentation: { passengerStats: { totalPassengers: number; pendingPickups: number; pendingDropoffs: number; completedPickups: number; completedDropoffs: number; inVehicle: number; passengers: { name: string; pickedUp: boolean; droppedOff: boolean; id: string; }[]; }; fitVehicleAndPassengers: () => void; };
  bookingActions: { handleRejectPendingBooking: (booking: Booking) => Promise<void>; handleAcceptPendingBooking: (booking: Booking) => Promise<void>; handleRejectPassengerInterruption: (booking: Booking) => void; handleConfirmPassengerInterruption: (booking: Booking) => void; };
}

export function DriverNavigationPassengersBar({
  foundation,
  passengerPresentation,
  bookingActions,
  onContact,
}: DriverNavigationPassengersBarProps) {
  const interruption = foundation.passengers.activePassengerInterruptionBooking;
  if (interruption) {
    const processing = foundation.mapState.processingBookingId === interruption.id;
    return <DriverInterruptionPrompt booking={interruption}
      queuedCount={foundation.passengers.pendingPassengerInterruptionQueueCount}
      busy={processing || foundation.data.isConfirmingPassengerInterruption || foundation.data.isRejectingPassengerInterruption}
      confirming={processing && foundation.data.isConfirmingPassengerInterruption}
      rejecting={processing && foundation.data.isRejectingPassengerInterruption}
      onConfirm={bookingActions.handleConfirmPassengerInterruption}
      onReject={bookingActions.handleRejectPassengerInterruption} />;
  }
  const pending = foundation.passengers.activePendingBooking;
  if (pending) {
    const processing = foundation.passengers.isProcessingPendingBooking;
    return <DriverPendingBookingPrompt booking={pending}
      queuedCount={foundation.passengers.pendingBookingQueueCount}
      pickupLabel={foundation.passengers.activePendingBookingPickupLabel}
      dropoffLabel={foundation.passengers.activePendingBookingDropoffLabel}
      tripPrice={foundation.data.trip?.price}
      busy={foundation.data.isAcceptingBooking || foundation.data.isRejectingBooking || processing}
      accepting={processing && foundation.data.isAcceptingBooking}
      rejecting={processing && foundation.data.isRejectingBooking}
      onAccept={bookingActions.handleAcceptPendingBooking}
      onContact={onContact}
      onReject={bookingActions.handleRejectPendingBooking} />;
  }
  const { waypoints, currentWaypointIndex } = foundation.mapState;
  const next = waypoints[currentWaypointIndex];
  const stats = passengerPresentation.passengerStats;
  const showNext = next && !next.completed;
  const allStopsCompleted = waypoints.every(point => point.completed);
  const nextLabel = next?.type === 'pickup' ? 'À récupérer' : 'Arrivée à destination';
  return (
    <View style={compact.bar}>
      {waypoints.length > 0 && <View style={compact.row}>
        {showNext ? <TouchableOpacity style={compact.stop} activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel={`${nextLabel} : ${next.passenger.name || 'Passager'}. ${next.address || 'Point sur la carte'}`}
          accessibilityHint="Affiche le détail du prochain arrêt. Ne valide pas l’étape."
          onPress={() => {
            foundation.refs.waypointModalVisibleRef.current = true;
            foundation.mapState.setActiveWaypoint(next);
            foundation.mapState.setWaypointModalVisible(true);
          }}>
          <Text style={compact.eyebrow}>{nextLabel}</Text>
          <Text style={compact.name} numberOfLines={1}>{next.passenger.name || 'Passager'}</Text>
          <Text style={compact.address} numberOfLines={1}>{next.address || 'Voir le point sur la carte'}</Text>
        </TouchableOpacity> : <View style={compact.finished}>
          <Ionicons name={allStopsCompleted ? 'checkmark-circle-outline' : 'list-outline'} size={22} color={allStopsCompleted ? Colors.successDark : Colors.gray[600]} />
          <Text style={compact.name}>{allStopsCompleted ? 'Arrêts effectués' : 'Vos arrêts'}</Text>
        </View>}
        <TouchableOpacity style={compact.passengers} accessibilityRole="button"
          accessibilityLabel={`Voir les ${stats.totalPassengers} passagers, ${stats.inVehicle} à bord, ${stats.pendingPickups} à récupérer`}
          onPress={() => foundation.mapState.setPassengersPanelVisible(true)}>
          <View style={compact.count}>
            <Ionicons name="people-outline" size={18} color={Colors.primaryDark} />
            <Text style={compact.countText}>{stats.totalPassengers}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.gray[500]} />
          </View>
          <Text style={compact.caption}>Passagers</Text>
          {stats.inVehicle > 0 && <Text style={compact.caption}>{stats.inVehicle} à bord</Text>}
        </TouchableOpacity>
      </View>}

      {foundation.passengers.activeDriverInterruptionRequest && (
        <View style={styles.driverInterruptionStatusCard}>
          <Ionicons name="hourglass-outline" size={19} color={Colors.warning} />
          <View style={styles.driverInterruptionStatusCopy}>
            <Text style={styles.driverInterruptionStatusTitle}>
              Interruption demandée
            </Text>
            <Text style={styles.driverInterruptionStatusText}>
              {foundation.passengers.activeDriverInterruptionConfirmedCount}/{foundation.passengers.activeDriverInterruptionRequiredCount} réservation(s) confirmée(s) par leur titulaire.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const compact = StyleSheet.create({
  bar: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 16, padding: 8, gap: 8 },
  stop: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', gap: 2, paddingHorizontal: 4 },
  eyebrow: { color: Colors.primaryDark, fontSize: 12, fontWeight: '600' },
  name: { color: Colors.gray[900], fontSize: 15, fontWeight: '700', flexShrink: 1 },
  address: { color: Colors.gray[600], fontSize: 12 },
  passengers: { minWidth: 80, maxWidth: '45%', minHeight: 44, padding: 4, borderLeftWidth: 1, borderLeftColor: Colors.gray[200], alignItems: 'center', gap: 2 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countText: { color: Colors.primaryDark, fontSize: 15, fontWeight: '700' },
  caption: { color: Colors.gray[600], fontSize: 11, textAlign: 'center' },
  finished: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 4 },
});
