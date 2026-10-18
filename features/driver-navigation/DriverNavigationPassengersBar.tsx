import { useDriverNavigationFoundation } from '../../hooks/driver-navigation/useDriverNavigationFoundation';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors } from '@/constants/styles';
import { DriverInterruptionPrompt } from './DriverInterruptionPrompt';
import { DriverPendingBookingPrompt } from './DriverPendingBookingPrompt';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Booking } from '@/types';

interface DriverNavigationPassengersBarProps {
  onContact: (passengerId: string) => void;
  foundation: ReturnType<typeof useDriverNavigationFoundation>;
  passengerPresentation: { passengerStats: { totalPassengers: number; pendingPickups: number; pendingDropoffs: number; completedPickups: number; completedDropoffs: number; inVehicle: number; passengers: { name: string; pickedUp: boolean; droppedOff: boolean; id: string; }[]; }; fitVehicleAndPassengers: () => void; };
  bookingActions: { handleRejectPendingBooking: (booking: Booking) => Promise<void>; handleAcceptPendingBooking: (booking: Booking) => Promise<void>; handleRejectPassengerInterruption: (booking: Booking) => void; handleConfirmPassengerInterruption: (booking: Booking) => void; };
}

export function DriverNavigationPassengersBar({
  foundation,
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
  const showNext = next && !next.completed;
  const allStopsCompleted = waypoints.every(point => point.completed);
  const nextLabel = next?.type === 'pickup' ? 'Allez chercher le passager' : 'Emmenez le passager à l’arrivée';
  return (
    <View style={compact.bar}>
      <View style={compact.row}>
        <Text style={compact.eyebrow} accessibilityRole="header">{showNext ? nextLabel
          : allStopsCompleted ? 'Allez à l’arrivée du trajet' : 'Vérifiez le prochain passager'}</Text>
      </View>
      {showNext ? <View style={compact.stop}>
        <Text style={compact.name}>{next.passenger.name || 'Passager'}</Text>
        <Text style={compact.address}>{next.address || 'Contactez le passager pour connaître le lieu.'}</Text>
      </View> : allStopsCompleted ? <Text style={compact.address}>
        {foundation.data.trip?.arrival?.address || foundation.data.trip?.arrival?.name || 'Suivez la carte jusqu’à l’arrivée.'}
      </Text> : <Text style={compact.address}>Dans « Plus », ouvrez « Les arrêts ».</Text>}

      {foundation.passengers.activeDriverInterruptionRequest && (
        <View style={styles.driverInterruptionStatusCard}>
          <Ionicons name="hourglass-outline" size={19} color={Colors.warning} />
          <View style={styles.driverInterruptionStatusCopy}>
            <Text style={styles.driverInterruptionStatusTitle}>
              Les passagers doivent répondre
            </Text>
            <Text style={styles.driverInterruptionStatusText}>
              {foundation.passengers.activeDriverInterruptionConfirmedCount}/{foundation.passengers.activeDriverInterruptionRequiredCount} passager(s) ont confirmé.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const compact = StyleSheet.create({
  bar: { gap: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8 },
  stop: { minWidth: 0, gap: 3 },
  eyebrow: { color: Colors.primaryDark, fontSize: 14, lineHeight: 20, fontWeight: '700', flexShrink: 1 },
  name: { color: Colors.gray[900], fontSize: 22, lineHeight: 27, fontWeight: '700' },
  address: { color: Colors.gray[700], fontSize: 16, lineHeight: 22 },
});
