import { usePassengerNavigationData } from '../../hooks/passenger-navigation/usePassengerNavigationData';
import { usePassengerNavigationState } from '../../hooks/passenger-navigation/usePassengerNavigationState';
import {
  usePassengerNavigationPresentation,
} from '../../hooks/passenger-navigation/usePassengerNavigationPresentation';
import {
  usePassengerNavigationInterruption,
} from '../../hooks/passenger-navigation/usePassengerNavigationInterruption';
import { styles } from '../screen-styles/app/booking/navigate/detail/index';
import { RideRecoveryControl } from '@/features/ride-recovery/RideRecoveryControl';
import { PausedPassengerRideNotice } from '@/components/trip/PausedPassengerRideNotice';
import { isAwaitingPassengerPickup } from './pickupArrivalEstimate';
import { Colors } from '@/constants/styles';
import { getTripInterruptionReasonLabel } from '@/utils/tripInterruption';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInUp } from '@/utils/reanimated';

interface PassengerNavigationInfoCardProps {
  data: ReturnType<typeof usePassengerNavigationData>;
  state: ReturnType<typeof usePassengerNavigationState>;
  presentation: ReturnType<typeof usePassengerNavigationPresentation>;
  interruption: ReturnType<typeof usePassengerNavigationInterruption>;
  tripActions: { handleShareTrip: () => Promise<void>; confirmCancelPassengerTrip: () => void; };
}

export function PassengerNavigationInfoCard({
  data,
  state,
  presentation,
  interruption,
  tripActions,
}: PassengerNavigationInfoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { height } = useWindowDimensions();
  const trip = data.trip;
  if (!trip) return null;
  const booking = data.booking;
  if (!booking) return null;
  const awaitingPickup = isAwaitingPassengerPickup(booking, trip);
  return (
    <Animated.View 
      entering={FadeInUp.duration(300).delay(100)} 
      style={[styles.infoCard, compact.panel, { maxHeight: height * (expanded ? 0.5 : 0.36) }]}
    >
      <ScrollView showsVerticalScrollIndicator contentContainerStyle={{ paddingBottom: data.insets.bottom + 8 }}>
      {/* Projection du trajet (compact) */}
      {(data.offlineBooking || data.offlineTrip) && <Text style={{ color: Colors.gray[600], fontSize: 12, marginBottom: 8 }}>Dernières informations enregistrées. La carte et le suivi en direct nécessitent une connexion.</Text>}
      {data.isTripOngoing && <RideRecoveryControl condensed tripId={data.tripId} booking={booking} actor="passenger" fix={state.recoveryFix} destination={booking.passengerDestinationCoordinates} />}
      <TouchableOpacity style={compact.summary} accessibilityRole="button" accessibilityLabel="Détails du trajet"
        accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} activeOpacity={0.7}>
        <Ionicons name="flag-outline" size={18} color={Colors.primaryDark} />
        <View style={compact.destination}>
          <Text style={compact.caption}>Destination</Text>
          <Text style={compact.address} numberOfLines={expanded ? undefined : 1}>{booking.passengerDestination || trip.arrival.address}</Text>
        </View>
        <Text style={compact.link}>{expanded ? 'Réduire' : 'Détails'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray[600]} />
      </TouchableOpacity>
      {expanded && <View style={compact.route}>
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: Colors.secondary }]} />
          <Text style={styles.routeText}>
            {booking.passengerOrigin || trip.departure.address}
          </Text>
          {!booking.pickedUp && <View style={styles.currentIndicator} />}
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: Colors.primary }]} />
          <Text style={styles.routeText}>
            {booking.passengerDestination || trip.arrival.address}
          </Text>
          {booking.pickedUp && !booking.droppedOff && <View style={styles.currentIndicator} />}
        </View>
      </View>}
      {expanded && data.isTripOngoing && <Text style={compact.caption}>La détection automatique reste active.</Text>}
      {booking.pickedUp && <Text style={compact.caption} accessibilityLiveRegion="polite">
        {booking.droppedOff ? 'Arrivée à destination confirmée' : booking.droppedOffConfirmedByPassenger
          ? 'Confirmation de l’arrivée à destination en cours' : 'En route vers votre destination'}
      </Text>}

      {!awaitingPickup && (presentation.displayedRouteDistance || presentation.displayedRouteDuration) && (
        <View style={compact.stats}>
          <View style={compact.stat}>
            <Ionicons name="navigate-outline" size={18} color={Colors.primary} />
            <Text style={styles.routeStatValue}>{presentation.displayedRouteDistance ?? '-'}</Text>
            <Text style={styles.routeStatLabel}>restants</Text>
          </View>
          {presentation.displayedRouteDuration && <>
            <View style={compact.stat}>
              <Ionicons name="time-outline" size={18} color={Colors.secondary} />
              <Text style={styles.routeStatValue}>{presentation.displayedRouteDuration ?? '-'}</Text>
              <Text style={styles.routeStatLabel}>estimées</Text>
            </View>
          </>}
        </View>
      )}

      {expanded && state.isLoadingRoute && !presentation.displayedRouteDistance && (
        <View style={styles.routeLoadingRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.routeLoadingText}>Chargement de l&apos;itinéraire...</Text>
        </View>
      )}

      {expanded && <View style={styles.statusRow}>
        {state.lastUpdate && (
          <Text style={styles.lastUpdateText}>
            Position mise à jour : {state.lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
        )}
      </View>}

      {/* This choice must remain reachable after the server pauses the trip. */}
      <PausedPassengerRideNotice booking={booking} />
      {/* État automatique du trajet */}
      {trip.status === 'ongoing' && (
        <View style={styles.actionButtons}>
          {interruption.pendingPassengerInterruptionRequest && (
            <View style={styles.interruptionStatusCard}>
              <Ionicons name="hourglass-outline" size={22} color={Colors.warning} />
              <View style={styles.interruptionStatusCopy}>
                <Text style={styles.interruptionStatusTitle}>
                  Demande d&apos;interruption envoyée
                </Text>
                <Text style={styles.interruptionStatusText}>
                  En attente de confirmation du conducteur.
                </Text>
              </View>
            </View>
          )}

          {interruption.canRequestPassengerInterruption && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.interruptionButton,
                data.isRequestingPassengerInterruption && styles.actionButtonDisabled,
              ]}
              onPress={interruption.openPassengerInterruptionDialog}
              disabled={data.isRequestingPassengerInterruption}
              activeOpacity={0.85}
            >
              {data.isRequestingPassengerInterruption ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Ionicons name="walk-outline" size={22} color={Colors.white} />
              )}
              <Text style={styles.actionButtonText}>
                {data.isRequestingPassengerInterruption
                  ? 'Envoi...'
                  : 'Descendre avant destination'}
              </Text>
            </TouchableOpacity>
          )}

          {interruption.pendingDriverInterruptionRequest && (
            <View style={styles.driverInterruptionCard}>
              <View style={styles.driverInterruptionHeader}>
                <Ionicons name="stop-circle-outline" size={22} color={Colors.danger} />
                <View style={styles.interruptionStatusCopy}>
                  <Text style={styles.driverInterruptionTitle}>
                    Le conducteur veut interrompre le trajet
                  </Text>
                  <Text style={styles.driverInterruptionText}>
                    Motif: {getTripInterruptionReasonLabel(interruption.pendingDriverInterruptionRequest.reason)}
                  </Text>
                </View>
              </View>

              {interruption.hasRespondedToDriverInterruption ? (
                <Text style={styles.driverInterruptionResponseText}>
                  Réponse envoyée : {interruption.driverInterruptionConfirmation?.status === 'confirmed' ? 'confirmée' : 'refusée'}.
                </Text>
              ) : interruption.canRespondToDriverInterruption ? (
                <View style={styles.driverInterruptionActions}>
                  <TouchableOpacity
                    style={[styles.driverInterruptionSecondaryButton, (data.isConfirmingDriverInterruption || data.isRejectingDriverInterruption) && styles.actionButtonDisabled]}
                    onPress={interruption.handleRejectDriverInterruption}
                    disabled={data.isConfirmingDriverInterruption || data.isRejectingDriverInterruption}
                    activeOpacity={0.85}
                  >
                    {data.isRejectingDriverInterruption ? (
                      <ActivityIndicator size="small" color={Colors.danger} />
                    ) : (
                      <Text style={styles.driverInterruptionSecondaryText}>Refuser</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.driverInterruptionPrimaryButton, (data.isConfirmingDriverInterruption || data.isRejectingDriverInterruption) && styles.actionButtonDisabled]}
                    onPress={interruption.handleConfirmDriverInterruption}
                    disabled={data.isConfirmingDriverInterruption || data.isRejectingDriverInterruption}
                    activeOpacity={0.85}
                  >
                    {data.isConfirmingDriverInterruption ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.driverInterruptionPrimaryText}>Confirmer</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.driverInterruptionResponseText}>
                  Aucune confirmation requise pour votre réservation.
                </Text>
              )}
            </View>
          )}

          {expanded && presentation.canCancelPassengerTrip && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.cancelTripButton,
                data.isCancellingBooking && styles.actionButtonDisabled,
              ]}
              onPress={tripActions.confirmCancelPassengerTrip}
              disabled={data.isCancellingBooking}
              activeOpacity={0.85}
            >
              {data.isCancellingBooking ? (
                <ActivityIndicator size="small" color={Colors.danger} />
              ) : (
                <Ionicons name="close-circle-outline" size={22} color={Colors.danger} />
              )}
              <Text style={styles.cancelTripButtonText}>
                {data.isCancellingBooking ? 'Annulation...' : 'Annuler ma participation'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {trip.status !== 'ongoing' && (
        <View style={styles.notStartedBadge}>
          <Ionicons name="time" size={20} color={Colors.secondary} />
          <Text style={styles.notStartedText}>
            {trip.interruptionRequest?.status === 'confirmed' ? 'Le trajet est en pause' : 'Le trajet n’a pas encore démarré'}
          </Text>
        </View>
      )}
      </ScrollView>
    </Animated.View>
  );
}

const compact = StyleSheet.create({
  panel: { position: 'relative', flexShrink: 0, padding: 12, paddingBottom: 0, shadowOpacity: 0.06, elevation: 0 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingVertical: 8 },
  destination: { flex: 1, minWidth: 0 }, caption: { fontSize: 11, color: Colors.gray[600] },
  address: { fontSize: 14, fontWeight: '600', color: Colors.gray[900] },
  link: { fontSize: 12, color: Colors.primaryDark, fontWeight: '600' },
  route: { paddingVertical: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 6 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
