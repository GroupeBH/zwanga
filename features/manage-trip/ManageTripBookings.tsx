import { useManageTripState } from '../../hooks/manage-trip/useManageTripState';
import { BOOKING_STATUS_CONFIG, hasPassengerBoarded } from './manageTripModel';
import { styles as baseStyles } from '../screen-styles/app/trip/manage/detail/index';
import { bookingStyles } from './ManageTripBookings.styles';
import { CompactCardAvatar } from '@/components/trip/CompactCardAvatar';
import { ConfirmCashReceipt } from '@/features/driver-payments/ConfirmCashReceipt';
import { Colors, Spacing } from '@/constants/styles';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

const styles = { ...baseStyles, ...bookingStyles };

interface ManageTripBookingsProps {
  tracking: { visibleBookings: Booking[] | undefined; };
  state: ReturnType<typeof useManageTripState>;
  actions: { handleOpenNavigation: () => void; handleStartTrip: () => Promise<void>; handleOpenTripEdit: () => void; handleCancelTrip: () => void; handlePauseTrip: () => Promise<void>; };
  bookingsActions: { showFeedback: (type: "success" | "error", message: string | string[]) => void; openRejectModal: (booking: Booking) => void; handleAcceptBooking: (bookingId: string) => Promise<void>; handleCancelBookingBeforePickup: (booking: Booking) => void; closeRejectModal: () => void; handleRejectSubmit: () => Promise<void>; };
}

export function ManageTripBookings({
  tracking,
  state,
  actions,
  bookingsActions,
}: ManageTripBookingsProps) {
  const trip = state.trip;
  if (!trip) return null;
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Passagers</Text>
          <Text style={styles.sectionSubtitle}>
            {tracking.visibleBookings?.length || 0} réservation(s) au total
          </Text>
        </View>
        {(trip.status === 'upcoming' || trip.status === 'ongoing') && (
          <TouchableOpacity 
            style={styles.actionIconButton}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir la navigation"
            onPress={actions.handleOpenNavigation}
          >
            <Ionicons name="navigate" size={20} color={Colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {tracking.visibleBookings && tracking.visibleBookings.length > 0 ? (
        tracking.visibleBookings.map((booking) => (
          <View key={booking.id} style={styles.bookingCard}>
            <View style={styles.bookingHeader}>
              <TouchableOpacity
                style={styles.passengerProfile}
                onPress={() => state.router.push(`/passenger/${booking.passengerId}`)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Voir le profil de ${booking.passengerName || 'ce passager'}`}
              >
                <CompactCardAvatar name={booking.passengerName || 'Passager'} uri={booking.passengerAvatar} />
                <View style={styles.bookingInfo}>
                  <Text style={styles.bookingName} numberOfLines={1}>{booking.passengerName || 'Passager'}</Text>
                  <Text style={styles.bookingMeta}>
                    {booking.numberOfSeats} place{booking.numberOfSeats > 1 ? 's' : ''} • {(booking.numberOfSeats * (trip.price ?? 0)).toLocaleString()} FC
                  </Text>
                  {booking.passengerDestination && (
                    <Text style={styles.destination} numberOfLines={1}>
                      Vers {booking.passengerDestination}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={14} color={Colors.gray[500]} />
              </TouchableOpacity>
              <View style={styles.statusColumn}>
                <View style={[styles.statusBadge, { backgroundColor: BOOKING_STATUS_CONFIG[booking.status].background }]}>
                  <Text style={[styles.statusBadgeText, { color: BOOKING_STATUS_CONFIG[booking.status].color }]}>
                    {BOOKING_STATUS_CONFIG[booking.status].label}
                  </Text>
                </View>
                {/* Bouton de notation dans la carte du passager */}
                {booking.status === 'accepted' && (
                  (booking.droppedOff && booking.droppedOffConfirmedByPassenger) || 
                  (trip.status === 'completed')
                ) && (
                  <TouchableOpacity
                    style={[styles.rateButtonInCard, { backgroundColor: Colors.secondary }]}
                    accessibilityRole="button"
                    onPress={() => state.router.push(`/rate/${trip.id}?passengerId=${booking.passengerId}`)}
                  >
                    <Ionicons name="star" size={14} color={Colors.white} />
                    <Text style={[styles.rateButtonInCardText, { color: Colors.white }]}>Noter</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {booking.status === 'pending' && (
              <View style={styles.bookingFooter}>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: Colors.gray[100] }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Contacter ${booking.passengerName || 'le passager'} avant d’accepter`}
                  disabled={state.isAccepting || state.isRejecting}
                  onPress={() => state.setContactBookingId(booking.id)}
                >
                  <Ionicons name="call-outline" size={16} color={Colors.primary} />
                  <Text style={[styles.actionText, { color: Colors.primary }]}>Contacter</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.rejectButton]}
                  accessibilityRole="button"
                  onPress={() => bookingsActions.openRejectModal(booking)}
                  disabled={state.isAccepting || state.isRejecting}
                >
                  <Text style={[styles.actionText, { color: Colors.danger }]}>Refuser</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.acceptButton]}
                  accessibilityRole="button"
                  onPress={() => bookingsActions.handleAcceptBooking(booking.id)}
                  disabled={state.isAccepting || state.isRejecting}
                >
                  {state.processingBookingId === booking.id ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Text style={styles.actionText}>Accepter</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {booking.status === 'accepted' && (
              <View style={styles.bookingFooter}>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: Colors.gray[100] }]}
                  accessibilityRole="button"
                  onPress={() => state.setContactBookingId(booking.id)}
                >
                  <Ionicons name="chatbubble-ellipses" size={18} color={Colors.primary} />
                  <Text style={[styles.actionText, { color: Colors.primary }]}>Contacter</Text>
                </TouchableOpacity>

                {!trip.tripRequestId &&
                  !hasPassengerBoarded(booking) &&
                  (trip.status === 'upcoming' || trip.status === 'ongoing') && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.cancelBookingButton]}
                    accessibilityRole="button"
                    onPress={() => bookingsActions.handleCancelBookingBeforePickup(booking)}
                    disabled={
                      state.isCancellingBooking ||
                      state.processingBookingId === booking.id
                    }
                  >
                    {state.processingBookingId === booking.id && state.isCancellingBooking ? (
                      <ActivityIndicator size="small" color={Colors.danger} />
                    ) : (
                      <>
                        <Ionicons name="close-circle-outline" size={18} color={Colors.danger} />
                        <Text style={[styles.actionText, { color: Colors.danger }]}>Annuler</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                
                {trip.status === 'ongoing' && !booking.pickedUp && (
                  <View style={[styles.bookingStatusBadge, styles.bookingStatusBadgeInfo]}>
                    <View style={[styles.bookingStatusDot, { backgroundColor: Colors.info }]} />
                    <Text style={[styles.bookingStatusText, { color: Colors.info }]}>À prendre en charge</Text>
                  </View>
                )}

                {trip.status === 'ongoing' && booking.pickedUp && booking.pickedUpConfirmedByPassenger && booking.droppedOffConfirmedByPassenger && !booking.droppedOff && (
                  <View style={[styles.bookingStatusBadge, styles.bookingStatusBadgeSuccess]}>
                    <View style={[styles.bookingStatusDot, { backgroundColor: Colors.success }]} />
                    <Text style={[styles.bookingStatusText, { color: Colors.success }]}>Arrivée en cours</Text>
                  </View>
                )}

                {trip.status === 'ongoing' && booking.pickedUp && booking.pickedUpConfirmedByPassenger && !booking.droppedOffConfirmedByPassenger && !booking.droppedOff && (
                  <View style={[styles.bookingStatusBadge, styles.bookingStatusBadgeSecondary]}>
                    <View style={[styles.bookingStatusDot, { backgroundColor: Colors.secondary }]} />
                    <Text style={[styles.bookingStatusText, { color: Colors.secondary }]}>Trajet en cours</Text>
                  </View>
                )}
              </View>
            )}
            <ConfirmCashReceipt booking={booking} />
          </View>
        ))
      ) : (
        <View style={{ alignItems: 'center', padding: Spacing.xl }}>
          <Ionicons name="people-outline" size={48} color={Colors.gray[300]} />
          <Text style={[styles.emptyText, { marginTop: Spacing.sm }]}>
            Aucune réservation pour le moment.
          </Text>
        </View>
      )}
    </View>
  );
}
