import { CompactTripCard } from '@/components/trip/CompactTripCard';
import { styles } from '@/components/trip/CompactListCard.styles';
import { Colors } from '@/constants/styles';
import { homeDepartureLabel, homePriceLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import { getPlaceName } from '@/features/search/searchModel';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import type { Router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { type BookingTab, STATUS_CONFIG } from './bookingsModel';

export interface BookingCardActions {
  activeTab: BookingTab;
  router: Router;
  setSelectedDriverPhone: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedDriverName: React.Dispatch<React.SetStateAction<string | null>>;
  setContactModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  handleCancel: (bookingId: string) => void;
  isCancelling: boolean;
}

export const BookingListCard = React.memo(function BookingListCard({
  booking, activeTab, router, setSelectedDriverPhone, setSelectedDriverName,
  setContactModalVisible, handleCancel, isCancelling,
}: BookingCardActions & { booking: Booking }) {
  const trip = booking.trip;
  // Preserve the existing expiry and action rules; no fare or booking mutation here.
  const isExpired = Boolean(trip?.status !== 'ongoing' && trip?.departureTime
    && new Date(trip.departureTime) < new Date());
  const status = isExpired && (booking.status === 'pending' || booking.status === 'accepted')
    ? { label: 'Expirée', color: Colors.gray[600] }
    : STATUS_CONFIG[booking.status] || { label: booking.status || 'Inconnu', color: Colors.gray[600] };
  const active = activeTab === 'active' && !isExpired;
  const accepted = active && booking.status === 'accepted';
  const pickupSync = booking.pickedUp && !booking.pickedUpConfirmedByPassenger;
  const arrivalSync = booking.droppedOffConfirmedByPassenger && !booking.droppedOff;
  const canFollow = accepted && trip?.status === 'ongoing';
  const canContact = accepted && trip?.driver?.phone && !pickupSync && !arrivalSync;
  const canCancel = active && (booking.status === 'pending' || booking.status === 'accepted')
    && !pickupSync && !arrivalSync;
  const canRate = booking.status === 'completed' && booking.droppedOffConfirmedByPassenger && trip?.id;
  const driverName = trip?.driverName || 'Conducteur Zwanga';
  const total = trip ? booking.numberOfSeats * trip.price : undefined;

  return (
    <View style={styles.card}>
      <CompactTripCard
        embedded
        label={status.label}
        labelColor={status.color}
        departure={trip ? getPlaceName(trip.departure) : 'Départ à préciser'}
        arrival={booking.passengerDestination || (trip ? getPlaceName(trip.arrival) : 'Destination à préciser')}
        priceText={homePriceLabel(total)}
        priceHint={total !== undefined && total > 0 ? 'total estimé' : undefined}
        metadata={`${homeDepartureLabel(trip?.departureTime)} · ${homeSeatsLabel(booking.numberOfSeats)}`}
        avatarName={trip ? driverName : undefined}
        avatarUri={trip?.driverAvatar?.trim() || trip?.driver?.profilePicture}
        secondary={trip ? driverName : undefined}
        accessibilityLabel="Voir le trajet réservé"
        onPress={() => router.push(`/trip/${booking.tripId}`)}
      />
      {accepted && pickupSync && <Text style={styles.notice}>Prise en charge détectée. Synchronisation en cours.</Text>}
      {accepted && arrivalSync && <Text style={styles.notice}>Arrivée détectée. Finalisation en cours.</Text>}
      {accepted && booking.pickedUp && booking.pickedUpConfirmedByPassenger
        && !booking.droppedOffConfirmedByPassenger && !booking.droppedOff
        && <Text style={styles.notice}>Arrivée en cours</Text>}
      {(canFollow || canContact || canCancel || canRate) && (
        <View style={styles.actions}>
          {canFollow && (
            <TouchableOpacity style={[styles.action, styles.primary]} accessibilityRole="button"
              onPress={() => router.push(`/booking/navigate/${booking.id}`)}>
              <Ionicons name="navigate" size={16} color={Colors.white} />
              <Text style={[styles.actionText, styles.primaryText]}>Suivre le trajet</Text>
            </TouchableOpacity>
          )}
          {canRate && (
            <TouchableOpacity style={styles.action} accessibilityRole="button"
              onPress={() => router.push(`/rate/${trip!.id}`)}>
              <Ionicons name="star-outline" size={16} color={Colors.primary} />
              <Text style={styles.actionText}>Noter le conducteur</Text>
            </TouchableOpacity>
          )}
          {canContact && (
            <TouchableOpacity style={styles.action} accessibilityRole="button" onPress={() => {
              setSelectedDriverPhone(trip!.driver!.phone!);
              setSelectedDriverName(trip!.driverName);
              setContactModalVisible(true);
            }}>
              <Ionicons name="logo-whatsapp" size={16} color={Colors.success} />
              <Text style={[styles.actionText, styles.contact]}>WhatsApp</Text>
            </TouchableOpacity>
          )}
          {canCancel && (
            <TouchableOpacity style={[styles.action, styles.danger]} accessibilityRole="button"
              accessibilityLabel="Annuler la réservation" accessibilityState={{ disabled: isCancelling, busy: isCancelling }}
              onPress={isCancelling ? undefined : () => handleCancel(booking.id)} disabled={isCancelling}>
              {isCancelling ? <ActivityIndicator size="small" color={Colors.danger} /> : <>
                <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                <Text style={[styles.actionText, styles.dangerText]}>Annuler</Text>
              </>}
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
});
