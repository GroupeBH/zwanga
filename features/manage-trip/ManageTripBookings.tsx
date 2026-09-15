import { useManageTripState } from '../../hooks/manage-trip/useManageTripState';
import { BOOKING_STATUS_CONFIG, hasPassengerBoarded } from './manageTripModel';
import { styles } from '../screen-styles/app/trip/manage/detail/index';
import { Colors, Spacing } from '@/constants/styles';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

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
                style={styles.avatar}
                onPress={() => state.router.push(`/passenger/${booking.passengerId}`)}
                activeOpacity={0.7}
              >
                <Text style={{ color: Colors.white, fontWeight: 'bold' }}>
                  {(booking.passengerName || 'P').charAt(0)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bookingInfo}
                onPress={() => state.router.push(`/passenger/${booking.passengerId}`)}
                activeOpacity={0.7}
              >
                <Text style={styles.bookingName}>{booking.passengerName}</Text>
                <Text style={styles.bookingMeta}>
                  {booking.numberOfSeats} place(s) • {(booking.numberOfSeats * (trip?.price ?? 0)).toLocaleString()} FC
                </Text>
                {booking.passengerDestination && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                    <Ionicons name="location-outline" size={12} color={Colors.gray[500]} />
                    <Text style={{ fontSize: 11, color: Colors.gray[500] }} numberOfLines={1}>
                      Vers: {booking.passengerDestination}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flexDirection: 'column', alignItems: 'flex-end', gap: Spacing.xs }}>
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
                    onPress={() => state.router.push(`/rate/${trip.id}?passengerId=${booking.passengerId}`)}
                  >
                    <Ionicons name="star" size={14} color={Colors.white} />
                    <Text style={[styles.rateButtonInCardText, { color: Colors.white }]}>Noter</Text>
                  </TouchableOpacity>
                )}
                {/* Bouton pour voir le profil du passager */}
                <TouchableOpacity
                  style={[styles.viewProfileButton]}
                  onPress={() => state.router.push(`/passenger/${booking.passengerId}`)}
                >
                  <Ionicons name="person-outline" size={14} color={Colors.primary} />
                  <Text style={[styles.viewProfileButtonText, { color: Colors.primary }]}>Profil</Text>
                </TouchableOpacity>
              </View>
            </View>

            {booking.status === 'pending' && (
              <View style={styles.bookingFooter}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={() => bookingsActions.openRejectModal(booking)}
                  disabled={state.isAccepting || state.isRejecting}
                >
                  <Text style={[styles.actionText, { color: Colors.danger }]}>Refuser</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.acceptButton]}
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
                  onPress={() => {
                    state.setSelectedPassengerPhone(booking.passengerPhone || null);
                    state.setSelectedPassengerName(booking.passengerName || null);
                    state.setContactModalVisible(true);
                  }}
                >
                  <Ionicons name="chatbubble-ellipses" size={18} color={Colors.primary} />
                  <Text style={[styles.actionText, { color: Colors.primary }]}>Contacter</Text>
                </TouchableOpacity>

                {!trip.tripRequestId &&
                  !hasPassengerBoarded(booking) &&
                  (trip.status === 'upcoming' || trip.status === 'ongoing') && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.cancelBookingButton]}
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
                    <Text style={[styles.bookingStatusText, { color: Colors.info }]}>A prendre en charge</Text>
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
