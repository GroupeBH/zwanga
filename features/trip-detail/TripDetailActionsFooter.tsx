import { useTripDetailData } from '../../hooks/trip-detail/useTripDetailData';
import { useTripDetailBookingState } from '../../hooks/trip-detail/useTripDetailBookingState';
import { useTripDetailAccess } from '../../hooks/trip-detail/useTripDetailAccess';
import { styles } from '../screen-styles/app/trip/detail/index';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { Colors, Spacing } from '@/constants/styles';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

interface TripDetailActionsFooterProps {
  data: ReturnType<typeof useTripDetailData>;
  access: ReturnType<typeof useTripDetailAccess>;
  activity: { activeBooking: Booking | null; bookingForTrip: Booking | null; canTrackTrip: boolean; refreshBookingLists: () => void; onRefresh: () => Promise<void>; driverReviewAverage: number; driverReviewCount: number; dismissTripGuide: () => void; };
  editor: { closeEditModal: () => void; openEditModal: () => void; };
  pricing: { estimatedTotal: number; canPayActiveBooking: boolean; activeBookingPaymentAmount: number; adjustBookingSeats: (delta: number) => void; handleBookingSeatsChange: (value: string) => void; };
  payment: { handlePayActiveBooking: () => Promise<void>; };
  bookingState: ReturnType<typeof useTripDetailBookingState>;
  bookingSubmission: { confirmCancelBooking: () => void; handleConfirmBooking: () => Promise<void>; };
  bookingLocation: { defaultPassengerOriginSelection: MapLocationSelection | null; openBookingModal: () => void; passengerOriginDisplay: string; passengerDestinationDisplay: string; };
}

export function TripDetailActionsFooter({
  data,
  access,
  activity,
  editor,
  pricing,
  payment,
  bookingState,
  bookingSubmission,
  bookingLocation,
}: TripDetailActionsFooterProps) {
  const activeBooking = activity.activeBooking;
  const trip = data.trip;
  if (!trip) return null;
  return (
    <View style={[styles.stickyFooter, { paddingBottom: Math.max(data.insets.bottom, 10) + 10 }]}>
      {(() => {
        // Vérifier si le trajet est expiré (date de départ passée)
        const isExpired =
          trip?.status !== 'ongoing' &&
          trip?.departureTime &&
          new Date(trip?.departureTime) < new Date();
        // Vérifier si le trajet peut être réservé (pas complété, pas annulé, pas expiré)
        const canBook = trip?.status !== 'completed' &&
          trip?.status !== 'cancelled' &&
          !isExpired &&
          (
            trip?.status === 'upcoming' ||
            (trip?.status === 'ongoing' && (access.availableSeats > 0 || Boolean(activeBooking && access.activeBookingStatus)))
          );

        if (data.isTripDriver) {
          return (
            <View style={[styles.actionsContainer, { flexDirection: 'row', gap: Spacing.sm }]}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: Colors.primary, flex: 1 }]}
                onPress={() => data.router.push(`/trip/manage/${trip?.id}`)}
              >
                <Ionicons name="settings-outline" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.actionButtonText}>Gérer le trajet</Text>
              </TouchableOpacity>
              {(trip?.status === 'upcoming' || trip?.status === 'ongoing') && !isExpired && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: Colors.secondary, flex: 1 }]}
                  onPress={editor.openEditModal}
                >
                  <Ionicons name="create-outline" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                  <Text style={styles.actionButtonText}>Modifier</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }

        if (canBook) {
          return (
            <View style={styles.actionsContainer}>
              {activeBooking && access.activeBookingStatus ? (
                activeBooking.status === 'completed' ? (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: Colors.secondary }]}
                    onPress={() => data.router.push(`/rate/${trip.id}`)}
                  >
                    <Ionicons name="star" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                    <Text style={styles.actionButtonText}>Évaluer le trajet</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.bookingCard}>
                    <View style={styles.bookingCardHeader}>
                      <View style={styles.bookingHeaderIdentity}>
                        <View style={styles.bookingHeaderIcon}>
                          <Ionicons name="ticket-outline" size={20} color={Colors.primary} />
                        </View>
                        <View style={styles.bookingHeaderCopy}>
                          <Text style={styles.bookingCardTitle}>Ma réservation</Text>
                          <Text style={styles.bookingCardSubtitle}>
                            {activeBooking.numberOfSeats} place{activeBooking.numberOfSeats > 1 ? 's' : ''}{' • '}{trip.price === 0 ? 'Gratuit' : `${trip.price} FC`}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.bookingStatusBadge,
                          { backgroundColor: access.activeBookingStatus.background },
                        ]}
                      >
                        <View
                          style={[
                            styles.bookingStatusDot,
                            { backgroundColor: access.activeBookingStatus.color },
                          ]}
                        />
                        <Text style={[styles.bookingStatusText, { color: access.activeBookingStatus.color }]}>
                          {access.activeBookingStatus.label}
                        </Text>
                      </View>
                    </View>

                    {/* Indicateur de confirmation en attente */}
                    {activeBooking.status === 'accepted' && (
                      <>
                        {activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger && (
                          <View style={styles.confirmationBanner}>
                            <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                            <Text style={styles.confirmationBannerText}>
                              Prise en charge détectée
                            </Text>
                          </View>
                        )}
                        {activeBooking.droppedOffConfirmedByPassenger && !activeBooking.droppedOff && (
                          <View style={styles.confirmationBanner}>
                            <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                            <Text style={styles.confirmationBannerText}>
                              Arrivée détectée. Finalisation automatique en cours.
                            </Text>
                          </View>
                        )}
                      </>
                    )}

                    <View style={styles.bookingActionsStack}>
                      {pricing.canPayActiveBooking && (
                        <TouchableOpacity
                          style={[styles.bookingActionButton, styles.bookingActionPrimary, styles.bookingActionPayment]}
                          onPress={payment.handlePayActiveBooking}
                          disabled={bookingState.isInitiatingBookingPayment}
                        >
                          {bookingState.isInitiatingBookingPayment ? (
                            <ActivityIndicator size="small" color={Colors.white} />
                          ) : (
                            <>
                              <Ionicons name="card-outline" size={18} color={Colors.white} />
                              <Text style={[styles.bookingActionText, styles.bookingActionPaymentText]}>
                                Payer {pricing.activeBookingPaymentAmount} FC
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}

                      {activeBooking.status === 'accepted' && activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger && (
                        <View
                          style={[styles.bookingActionButton, styles.bookingActionPrimary, styles.bookingActionConfirm]}
                        >
                          <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                          <Text style={[styles.bookingActionText, styles.bookingActionConfirmText]}>
                            À bord
                          </Text>
                        </View>
                      )}

                      {activeBooking.status === 'accepted' && activeBooking.pickedUp && activeBooking.pickedUpConfirmedByPassenger && !activeBooking.droppedOffConfirmedByPassenger && !activeBooking.droppedOff && (
                        <View
                          style={[styles.bookingActionButton, styles.bookingActionPrimary, styles.bookingActionConfirm]}
                        >
                          <Ionicons name="flag" size={19} color={Colors.white} />
                          <Text style={[styles.bookingActionText, styles.bookingActionConfirmText]}>Arrivée en cours</Text>

                        </View>
                      )}

                      <View style={styles.bookingSecondaryActionsRow}>
                        {/* Bouton Navigation - visible quand le trajet est en cours */}
                        {activeBooking.status === 'accepted' && trip.status === 'ongoing' &&
                          !(activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger) &&
                          !(activeBooking.droppedOffConfirmedByPassenger && !activeBooking.droppedOff) && (
                            <TouchableOpacity
                              activeOpacity={0.82}
                              style={[styles.bookingActionButton, styles.bookingActionSecondary, styles.bookingActionNavigation]}
                              onPress={() => data.router.push(`/booking/navigate/${activeBooking.id}`)}
                            >
                              <Ionicons name="navigate" size={18} color={Colors.white} />
                              <Text style={[styles.bookingActionText, styles.bookingActionNavigationText]}>Suivre</Text>
                            </TouchableOpacity>
                          )}

                        {activeBooking.status === 'accepted' && data.driverPhone &&
                          !(activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger) &&
                          !(activeBooking.droppedOffConfirmedByPassenger && !activeBooking.droppedOff) && (
                            <TouchableOpacity
                              activeOpacity={0.82}
                              style={[styles.bookingActionButton, styles.bookingActionSecondary, styles.bookingActionCall]}
                              onPress={() => bookingState.setContactModalVisible(true)}
                            >
                              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                              <Text style={[styles.bookingActionText, styles.bookingActionCallText]}>WhatsApp</Text>
                            </TouchableOpacity>
                          )}

                        {!(activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger) &&
                          !(activeBooking.droppedOffConfirmedByPassenger && !activeBooking.droppedOff) && (
                            <TouchableOpacity
                              activeOpacity={0.82}
                              style={[styles.bookingActionButton, styles.bookingActionSecondary, styles.bookingActionDanger]}
                              onPress={bookingSubmission.confirmCancelBooking}
                              disabled={bookingState.isCancellingBooking}
                            >
                              {bookingState.isCancellingBooking ? <ActivityIndicator size="small" color={Colors.danger} /> : (
                                <>
                                  <Ionicons name="close-circle-outline" size={18} color={Colors.danger} />
                                  <Text style={[styles.bookingActionText, styles.bookingActionDangerText]}>Annuler</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          )}
                      </View>
                    </View>
                  </View>
                )
              ) : access.availableSeats <= 0 ? (
                <View style={[styles.actionButton, styles.actionButtonDisabled]}>
                  <Ionicons name="close-circle" size={20} color={Colors.white} />
                  <Text style={styles.actionButtonText}>Complet • Plus de places disponibles</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={bookingLocation.openBookingModal}
                >
                  <Ionicons name="car-sport-outline" size={20} color={Colors.white} />
                  <Text style={styles.actionButtonText}>Réserver • {trip.price === 0 ? 'Gratuit' : `${trip.price} FC`}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }

        // Trajets terminés ou expirés
        if (trip?.status === 'completed' || trip?.status === 'cancelled' || isExpired) {
          return (
            <View style={styles.actionsContainer}>
              {activeBooking && activeBooking.status === 'completed' && activeBooking.droppedOffConfirmedByPassenger ? (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: Colors.secondary }]}
                  onPress={() => data.router.push(`/rate/${trip?.id}`)}
                >
                  <Ionicons name="star" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                  <Text style={styles.actionButtonText}>Évaluer le trajet</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.actionButton, styles.actionButtonDisabled]}>
                  <Text style={styles.actionButtonText}>
                    {trip.status === 'completed' ? 'Trajet terminé' : trip.status === 'cancelled' ? 'Trajet annulé' : 'Trajet expiré'}
                  </Text>
                </View>
              )}
            </View>
          );
        }

        return null;
      })()}
    </View>
  );
}
