import { useDriverNavigationFoundation } from '../../hooks/driver-navigation/useDriverNavigationFoundation';
import { formatSeatCount, formatPendingBookingPayment } from './navigationPresentation';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors } from '@/constants/styles';
import { DriverInterruptionPrompt } from './DriverInterruptionPrompt';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
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

      {foundation.passengers.activePendingBooking && (
        <View style={styles.pendingBookingPrompt}>
          <View style={styles.pendingBookingHeader}>
            <View style={styles.pendingBookingIcon}>
              <Ionicons name="person-add-outline" size={18} color={Colors.primary} />
            </View>
            <View style={styles.pendingBookingTitleWrap}>
              <Text style={styles.pendingBookingEyebrow}>
                Nouvelle réservation
                {foundation.passengers.pendingBookingQueueCount > 0 ? ` +${foundation.passengers.pendingBookingQueueCount}` : ''}
              </Text>
              <Text style={styles.pendingBookingTitle} numberOfLines={1}>
                {foundation.passengers.activePendingBooking.passengerName || 'Passager'}
              </Text>
            </View>
            <View style={styles.pendingBookingSeatPill}>
              <Ionicons name="people-outline" size={14} color={Colors.primaryDark} />
              <Text style={styles.pendingBookingSeatText}>
                {formatSeatCount(foundation.passengers.activePendingBooking.numberOfSeats)}
              </Text>
            </View>
          </View>

          <View style={styles.pendingBookingRoute}>
            <View style={styles.pendingBookingRouteRow}>
              <View style={[styles.pendingBookingRouteDot, styles.pendingBookingPickupDot]} />
              <Text style={styles.pendingBookingRouteLabel} numberOfLines={1}>
                {foundation.passengers.activePendingBookingPickupLabel}
              </Text>
            </View>
            <View style={styles.pendingBookingRouteRow}>
              <View style={[styles.pendingBookingRouteDot, styles.pendingBookingDropoffDot]} />
              <Text style={styles.pendingBookingRouteLabel} numberOfLines={1}>
                {foundation.passengers.activePendingBookingDropoffLabel}
              </Text>
            </View>
          </View>

          <View style={styles.pendingBookingFooter}>
            <Text style={styles.pendingBookingPaymentText} numberOfLines={1}>
              {formatPendingBookingPayment(foundation.passengers.activePendingBooking, foundation.data.trip?.price)}
            </Text>
            <View style={styles.pendingBookingActions}>
              <TouchableOpacity
                style={[
                  styles.pendingBookingActionButton,
                  styles.pendingBookingRejectButton,
                  foundation.passengers.isProcessingPendingBooking && styles.pendingBookingActionDisabled,
                ]}
                onPress={() => void bookingActions.handleRejectPendingBooking(foundation.passengers.activePendingBooking)}
                disabled={foundation.data.isAcceptingBooking || foundation.data.isRejectingBooking || foundation.passengers.isProcessingPendingBooking}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Refuser la réservation"
              >
                {foundation.passengers.isProcessingPendingBooking && foundation.data.isRejectingBooking ? (
                  <ActivityIndicator size="small" color={Colors.danger} />
                ) : (
                  <>
                    <Ionicons name="close" size={18} color={Colors.danger} />
                    <Text style={styles.pendingBookingRejectText}>Refuser</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.pendingBookingActionButton,
                  styles.pendingBookingAcceptButton,
                  foundation.passengers.isProcessingPendingBooking && styles.pendingBookingActionDisabled,
                ]}
                onPress={() => void bookingActions.handleAcceptPendingBooking(foundation.passengers.activePendingBooking)}
                disabled={foundation.data.isAcceptingBooking || foundation.data.isRejectingBooking || foundation.passengers.isProcessingPendingBooking}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Accepter la réservation"
              >
                {foundation.passengers.isProcessingPendingBooking && foundation.data.isAcceptingBooking ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color={Colors.white} />
                    <Text style={styles.pendingBookingAcceptText}>Accepter</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {foundation.passengers.activeDriverInterruptionRequest && (
        <View style={styles.driverInterruptionStatusCard}>
          <Ionicons name="hourglass-outline" size={19} color={Colors.warning} />
          <View style={styles.driverInterruptionStatusCopy}>
            <Text style={styles.driverInterruptionStatusTitle}>
              Interruption demandee
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
