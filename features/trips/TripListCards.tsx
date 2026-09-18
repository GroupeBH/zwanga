import { CompactTripCard } from '@/components/trip/CompactTripCard';
import { Colors } from '@/constants/styles';
import { homeDepartureLabel, homePriceLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import { getPlaceName, getVehicleName } from '@/features/search/searchModel';
import type { Booking, Trip } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from './TripListCards.styles';

export function canManagePublishedTrip(trip: Trip) {
  if (trip.status === 'completed') return false;

  if (trip.status !== 'ongoing' && trip.departureTime) {
    const departureTime = new Date(trip.departureTime).getTime();
    if (Number.isFinite(departureTime) && departureTime < Date.now()) return false;
  }

  return trip.status === 'upcoming' || trip.status === 'ongoing';
}

export function getTripStatusBadge(trip: Trip): TripStatusBadge {
  const departureTime = trip.departureTime ? new Date(trip.departureTime).getTime() : Number.NaN;
  const isExpired =
    trip.status !== 'ongoing' &&
    Number.isFinite(departureTime) &&
    departureTime < Date.now();

  if (isExpired && trip.status !== 'completed') {
    return { bgColor: Colors.gray[200], textColor: Colors.gray[600], label: 'Expiré' };
  }

  switch (trip.status) {
    case 'upcoming':
      return { bgColor: 'rgba(247, 184, 1, 0.1)', textColor: Colors.secondary, label: 'À venir' };
    case 'ongoing':
      return { bgColor: 'rgba(52, 152, 219, 0.1)', textColor: Colors.info, label: 'En cours' };
    case 'completed':
      return { bgColor: 'rgba(46, 204, 113, 0.1)', textColor: Colors.success, label: 'Terminé' };
    default:
      return { bgColor: Colors.gray[200], textColor: Colors.gray[600], label: trip.status };
  }
}

export function getBookingStatusBadge(booking: Booking): TripStatusBadge {
  switch (booking.status) {
    case 'pending':
      return { bgColor: 'rgba(247, 184, 1, 0.1)', textColor: Colors.secondary, label: 'En attente' };
    case 'accepted':
      return { bgColor: 'rgba(46, 204, 113, 0.1)', textColor: Colors.success, label: 'Confirmée' };
    case 'rejected':
      return { bgColor: 'rgba(239, 68, 68, 0.1)', textColor: Colors.danger, label: 'Refusée' };
    case 'cancelled':
      return { bgColor: 'rgba(156, 163, 175, 0.1)', textColor: Colors.gray[600], label: 'Annulée' };
    case 'completed':
      return { bgColor: 'rgba(46, 204, 113, 0.1)', textColor: Colors.success, label: 'Terminée' };
    case 'no_show':
      return { bgColor: 'rgba(59, 130, 246, 0.1)', textColor: Colors.info, label: 'Non embarqué' };
    case 'boarding_uncertain':
      return { bgColor: 'rgba(245, 158, 11, 0.1)', textColor: Colors.warning, label: 'Embarquement non confirmé' };
    default:
      return { bgColor: Colors.gray[200], textColor: Colors.gray[600], label: booking.status };
  }
}

export type TripStatusBadge = { bgColor: string; textColor: string; label: string };

export type PublishedTripCardProps = {
  canManage: boolean;
  onDelete: (trip: Trip) => void;
  onDetails: (tripId: string) => void;
  onEdit: (trip: Trip) => void;
  status: TripStatusBadge;
  trip: Trip;
};

function tripIdentity(trip: Trip) {
  const name = trip.driverName || 'Conducteur Zwanga';
  const rating = Number(trip.driverRating);
  return {
    avatarName: name,
    avatarUri: trip.driverAvatar?.trim() || trip.driver?.profilePicture,
    secondary: [name, Number.isFinite(rating) && rating > 0 ? `★ ${rating.toFixed(1)}` : null,
      getVehicleName(trip)].filter(Boolean).join(' · '),
  };
}

export const PublishedTripCard = React.memo(function PublishedTripCard({
  canManage, onDelete, onDetails, onEdit, status, trip,
}: PublishedTripCardProps) {
  return (
    <View style={styles.card}>
      <CompactTripCard
        embedded
        {...tripIdentity(trip)}
        label={status.label}
        labelColor={status.textColor}
        departure={getPlaceName(trip.departure)}
        arrival={getPlaceName(trip.arrival)}
        metadata={`${homeDepartureLabel(trip.departureTime)} · ${homeSeatsLabel(trip.availableSeats, true)}`}
        priceText={homePriceLabel(trip.price)}
        priceHint={trip.price > 0 ? '/ place' : undefined}
        accessibilityLabel="Gérer ce trajet"
        onPress={() => onDetails(trip.id)}
      />
      {(canManage || !trip.tripRequestId) && (
        <View style={styles.actions}>
          {canManage && (
            <TouchableOpacity style={styles.action} accessibilityRole="button"
              accessibilityLabel="Modifier ce trajet" onPress={() => onEdit(trip)}>
              <Ionicons name="create-outline" size={16} color={Colors.primary} />
              <Text style={styles.actionText}>Modifier</Text>
            </TouchableOpacity>
          )}
          {!trip.tripRequestId && (
            <TouchableOpacity style={[styles.action, styles.danger]} accessibilityRole="button"
              accessibilityLabel="Supprimer ce trajet" onPress={() => onDelete(trip)}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              <Text style={[styles.actionText, styles.dangerText]}>Supprimer</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
});

export type BookingTripCardProps = {
  booking: Booking;
  onDetails: (tripId: string) => void;
  status: TripStatusBadge;
};

export const BookingTripCard = React.memo(function BookingTripCard({
  booking, onDetails, status,
}: BookingTripCardProps) {
  const trip = booking.trip;
  if (!trip) return null;
  // Same displayed estimate as before; this card never changes the saved fare.
  const total = trip.price * booking.numberOfSeats;
  return (
    <View style={styles.card}>
      <CompactTripCard
        embedded
        {...tripIdentity(trip)}
        label={status.label}
        labelColor={status.textColor}
        departure={getPlaceName(trip.departure)}
        arrival={booking.passengerDestination || getPlaceName(trip.arrival)}
        metadata={`${homeDepartureLabel(trip.departureTime)} · ${homeSeatsLabel(booking.numberOfSeats)}`}
        priceText={homePriceLabel(total)}
        priceHint={total > 0 ? 'total' : undefined}
        accessibilityLabel="Voir le trajet réservé"
        onPress={() => onDetails(trip.id)}
      />
    </View>
  );
});
