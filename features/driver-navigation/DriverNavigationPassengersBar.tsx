import { useDriverNavigationFoundation } from '../../hooks/driver-navigation/useDriverNavigationFoundation';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors } from '@/constants/styles';
import { DriverInterruptionPrompt } from './DriverInterruptionPrompt';
import { DriverPendingBookingPrompt } from './DriverPendingBookingPrompt';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { Booking } from '@/types';

interface DriverNavigationPassengersBarProps {
  foundation: ReturnType<typeof useDriverNavigationFoundation>;
  passengerPresentation: { passengerStats: { totalPassengers: number; pendingPickups: number; pendingDropoffs: number; completedPickups: number; completedDropoffs: number; inVehicle: number; passengers: { name: string; pickedUp: boolean; droppedOff: boolean; id: string; }[]; }; fitVehicleAndPassengers: () => void; };
  bookingActions: { handleRejectPendingBooking: (booking: Booking) => Promise<void>; handleAcceptPendingBooking: (booking: Booking) => Promise<void>; handleRejectPassengerInterruption: (booking: Booking) => void; handleConfirmPassengerInterruption: (booking: Booking) => void; };
}

export function DriverNavigationPassengersBar({
  foundation,
  passengerPresentation,
  bookingActions,
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
      onReject={bookingActions.handleRejectPendingBooking} />;
  }
  return (
    <View style={styles.passengersBar}>
      {/* Stats des passagers */}
      {foundation.mapState.waypoints.length > 0 && (
        <TouchableOpacity
          style={styles.passengersStatsButton}
          onPress={() => foundation.mapState.setPassengersPanelVisible(true)}
        >
        <View style={styles.passengersBadge}>
          <Ionicons name="people" size={16} color={Colors.white} />
          <Text style={styles.passengersBadgeText}>{passengerPresentation.passengerStats.totalPassengers}</Text>
        </View>
        <View style={styles.passengersStatsInfo}>
          {passengerPresentation.passengerStats.inVehicle > 0 && (
            <View style={styles.inVehicleBadge}>
              <Ionicons name="car" size={12} color={Colors.white} />
              <Text style={styles.inVehicleText}>{passengerPresentation.passengerStats.inVehicle} à bord</Text>
            </View>
          )}
          {passengerPresentation.passengerStats.pendingPickups > 0 && (
            <Text style={styles.pendingText}>
              {passengerPresentation.passengerStats.pendingPickups} à prendre en charge
            </Text>
          )}
        </View>
        <Ionicons name="chevron-up" size={20} color={Colors.gray[500]} />
        </TouchableOpacity>
      )}

      {/* Prochain waypoint compact */}
      {foundation.mapState.currentWaypointIndex < foundation.mapState.waypoints.length && !foundation.mapState.waypoints[foundation.mapState.currentWaypointIndex].completed && (
        <TouchableOpacity 
          style={[
            styles.nextWaypointCompact,
            { borderLeftColor: foundation.mapState.waypoints[foundation.mapState.currentWaypointIndex].type === 'pickup' ? Colors.secondary : Colors.success }
          ]}
          activeOpacity={0.8}
          onPress={() => {
            foundation.refs.waypointModalVisibleRef.current = true;
            foundation.mapState.setActiveWaypoint(foundation.mapState.waypoints[foundation.mapState.currentWaypointIndex]);
            foundation.mapState.setWaypointModalVisible(true);
          }}
        >
          <View style={styles.nextWaypointInfo}>
            <Text style={styles.nextWaypointType}>
              {foundation.mapState.waypoints[foundation.mapState.currentWaypointIndex].type === 'pickup' ? 'Lieu de prise en charge' : "Point d'arrivée"}
            </Text>
            <Text style={styles.nextWaypointName} numberOfLines={1}>
              {foundation.mapState.waypoints[foundation.mapState.currentWaypointIndex].passenger.name}
            </Text>
          </View>
          <View
            style={[
              styles.gpsStatusPill,
              {
                backgroundColor:
                  foundation.mapState.waypoints[foundation.mapState.currentWaypointIndex].type === 'pickup'
                    ? Colors.secondary + '15'
                    : Colors.success + '15',
                borderColor:
                  foundation.mapState.waypoints[foundation.mapState.currentWaypointIndex].type === 'pickup'
                    ? Colors.secondary
                    : Colors.success,
              }
            ]}
          >
            <Ionicons
              name="locate"
              size={14}
              color={
                foundation.mapState.waypoints[foundation.mapState.currentWaypointIndex].type === 'pickup'
                  ? Colors.secondary
                  : Colors.success
              }
            />
            <Text
              style={[
                styles.gpsStatusPillText,
                {
                  color:
                    foundation.mapState.waypoints[foundation.mapState.currentWaypointIndex].type === 'pickup'
                      ? Colors.secondary
                      : Colors.success,
                },
              ]}
            >
              Suivi actif
            </Text>
          </View>
        </TouchableOpacity>
      )}

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
