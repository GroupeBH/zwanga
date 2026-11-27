import { useTripDetailData } from '../../hooks/trip-detail/useTripDetailData';
import { useTripDetailBookingState } from '../../hooks/trip-detail/useTripDetailBookingState';
import { useTripDetailAccess } from '../../hooks/trip-detail/useTripDetailAccess';
import { styles } from '../screen-styles/app/trip/detail/index';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { Colors, Spacing } from '@/constants/styles';
import { isTripExpired } from './tripDetailAvailability';
import { bookingPassengerTotal, bookingProposalPrice } from './bookingPriceProposal';
import { PickupDriverChange } from '@/features/request-detail/ChangeRequestDriverButton';
import { isAwaitingPassengerPickup } from '@/features/passenger-navigation/pickupArrivalEstimate';
import { rideColors } from '@/features/ride-design/rideDesign';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';

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
  /** Hauteur réelle du footer, pour réserver la place sous le contenu défilant. */
  onHeightChange?: (height: number) => void;
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
  onHeightChange,
}: TripDetailActionsFooterProps) {
  const [changingDriver, setChangingDriver] = useState(false);
  const { height, fontScale } = useWindowDimensions();
  const activeBooking = activity.activeBooking;
  const trip = data.trip;
  if (!trip) return null;
  return (
    <View
      style={[styles.stickyFooter, { paddingBottom: Math.max(data.insets.bottom, 10) + 10, maxHeight: height * (fontScale > 1.3 ? 0.5 : 0.45) }]}
      onLayout={onHeightChange ? event => onHeightChange(Math.round(event.nativeEvent.layout.height)) : undefined}
    >
      <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{(() => {
        // Vérifier si le trajet est expiré (date de départ passée)
        const isExpired = isTripExpired(trip);
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
              {(trip.canReprogram || trip.status === 'upcoming' || trip.status === 'ongoing') && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.ownerEditButton]}
                  onPress={editor.openEditModal}
                  accessibilityRole="button"
                  accessibilityLabel={trip.canReprogram ? 'Modifier et reprogrammer ce trajet' : 'Modifier ce trajet'}
                >
                  <Ionicons name="create-outline" size={20} color={Colors.gray[800]} style={{ marginRight: 8 }} />
                  <Text style={[styles.actionButtonText, styles.ownerEditButtonText]}>Modifier</Text>
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
                    {activeBooking.status !== 'accepted' && <View style={styles.bookingCardHeader}>
                      <View style={styles.bookingHeaderIdentity}>
                        <View style={styles.bookingHeaderIcon}>
                          <Ionicons name="ticket-outline" size={20} color={Colors.primary} />
                        </View>
                        <View style={styles.bookingHeaderCopy}>
                          <Text style={styles.bookingCardTitle}>Ma réservation</Text>
                          <Text style={styles.bookingCardSubtitle}>
                            {activeBooking.numberOfSeats} place{activeBooking.numberOfSeats > 1 ? 's' : ''}{' • '}
                            {activeBooking.status === 'pending' && bookingProposalPrice(activeBooking) !== null ? 'Prix proposé : ' : 'Total : '}
                            {bookingPassengerTotal(activeBooking, trip.price).toLocaleString('fr-FR')} FC
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
                    </View>}

                    {/* Indicateur de confirmation en attente */}
                    {activeBooking.status === 'accepted' && (
                      <>
                        {activeBooking.pickedUp && !activeBooking.droppedOff && (
                          <View style={styles.confirmationBanner}>
                            <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                            <Text style={styles.confirmationBannerText}>
                              Embarquement confirmé · En route
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
                          disabled={bookingState.isInitiatingBookingPayment || changingDriver}
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

                      {trip.tripRequestId && isAwaitingPassengerPickup(activeBooking, trip) && (
                        <PickupDriverChange key={`${trip.id}:${activeBooking.id}`} requestId={trip.tripRequestId}
                          booking={activeBooking} trip={trip} onPendingChange={setChangingDriver}
                          active={data.isScreenActive && !bookingState.isCancellingBooking && !bookingState.isInitiatingBookingPayment}
                          onChanged={data.returnToRequest} />
                      )}
                      <View style={[styles.bookingSecondaryActionsRow, { flexDirection: 'column' }]}>
                        {/* Le passager peut consulter l'arrivée dès l'acceptation. */}
                        {activeBooking.status === 'accepted' && ['upcoming', 'ongoing'].includes(trip.status) &&
                          !activeBooking.droppedOff &&
                          !(activeBooking.droppedOffConfirmedByPassenger && !activeBooking.droppedOff) && (
                            <TouchableOpacity
                              activeOpacity={0.82}
                              style={[styles.bookingActionButton, styles.bookingActionNavigation, { minHeight: 54, height: 'auto', paddingVertical: 14, borderRadius: 28, backgroundColor: rideColors.orange, borderColor: rideColors.orange }]}
                              onPress={() => data.router.push(`/booking/navigate/${activeBooking.id}`)}
                              accessibilityRole="button"
                              disabled={changingDriver}
                              accessibilityLabel={!activeBooking.pickedUp ? 'Voir l’arrivée estimée du conducteur' : 'Suivre le trajet'}
                            >
                              <Ionicons name="navigate" size={18} color={Colors.white} />
                              <Text style={[styles.bookingActionText, styles.bookingActionNavigationText]}>
                                {!activeBooking.pickedUp ? 'Voir l’arrivée' : 'Suivre'}
                              </Text>
                            </TouchableOpacity>
                          )}

                        {!activeBooking.pickedUp && !activeBooking.pickedUpAt && !activeBooking.pickedUpConfirmedByPassenger &&
                          !(activeBooking.droppedOffConfirmedByPassenger && !activeBooking.droppedOff) && (
                            <TouchableOpacity
                              activeOpacity={0.82}
                              style={[styles.bookingActionButton, { borderWidth: 0, minHeight: 44, height: 'auto', paddingVertical: 10 }]}
                              onPress={bookingSubmission.confirmCancelBooking}
                              disabled={bookingState.isCancellingBooking || changingDriver}
                            >
                              {bookingState.isCancellingBooking ? <ActivityIndicator size="small" color={Colors.danger} /> : (
                                <>
                                  <Text style={[styles.bookingActionText, styles.bookingActionDangerText]}>Annuler la réservation</Text>
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
                  <Ionicons name="close-circle" size={20} color={Colors.gray[500]} />
                  <Text style={[styles.actionButtonText, styles.actionButtonTextDisabled]}>Complet • Plus de places disponibles</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: rideColors.ink, shadowOpacity: 0, elevation: 0 }]}
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
                  <Ionicons
                    name={trip.status === 'completed' ? 'checkmark-circle-outline' : trip.status === 'cancelled' ? 'close-circle-outline' : 'time-outline'}
                    size={20}
                    color={Colors.gray[500]}
                  />
                  <Text style={[styles.actionButtonText, styles.actionButtonTextDisabled]}>
                    {trip.status === 'completed' ? 'Trajet terminé' : trip.status === 'cancelled' ? 'Trajet annulé' : 'Trajet expiré'}
                  </Text>
                </View>
              )}
            </View>
          );
        }

        return null;
      })()}</ScrollView>
    </View>
  );
}
