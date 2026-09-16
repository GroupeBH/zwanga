import { styles } from '../screen-styles/app/tabs/trips/index';
import { Colors, FontWeights, Spacing } from '@/constants/styles';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import type { Booking, Trip } from '@/types';
import { formatDateTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';

export function ArrivalTimeBlock({ trip }: { trip: Trip }) {
  const calculatedArrivalTime = useTripArrivalTime(trip);
  const arrivalDateTimeDisplay = calculatedArrivalTime
    ? formatDateTime(calculatedArrivalTime.toISOString())
    : formatDateTime(trip.arrivalTime);

  return (
    <View style={styles.timeContainer}>
      <Text style={styles.routeDateLabel}>Arrivée estimée</Text>
      <Text style={styles.routeTime}>{arrivalDateTimeDisplay}</Text>
    </View>
  );
}

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

export const PublishedTripCard = React.memo(function PublishedTripCard({
  canManage,
  onDelete,
  onDetails,
  onEdit,
  status,
  trip,
}: PublishedTripCardProps) {
  return (
    <View style={styles.tripCard}>
      <View style={styles.tripHeader}>
        <View style={styles.tripDriverInfo}>
          {trip.driverAvatar ? (
            <Image source={{ uri: trip.driverAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar} />
          )}
          <View style={styles.tripDriverDetails}>
            <Text style={styles.driverName}>{trip.driverName}</Text>
            <View style={styles.driverMeta}>
              <Ionicons name="star" size={14} color={Colors.secondary} />
              <Text style={styles.driverRating}>{trip.driverRating}</Text>
              {trip.vehicle || trip.vehicleInfo ? (
                <>
                  <View style={styles.dot} />
                  <Text style={styles.vehicleInfo}>
                    {trip.vehicle
                      ? `${trip.vehicle.brand} ${trip.vehicle.model}${trip.vehicle.color ? ` • ${trip.vehicle.color}` : ''}`
                      : trip.vehicleInfo}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
          <Text style={[styles.statusText, { color: status.textColor }]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.routeContainer}>
        <View style={styles.routeRow}>
          <Ionicons name="location" size={16} color={Colors.success} />
          <Text style={styles.routeText}>{trip.departure.name}</Text>
          <View style={styles.timeContainer}>
            <Text style={styles.routeDateLabel}>Départ</Text>
            <Text style={styles.routeTime}>{formatDateTime(trip.departureTime)}</Text>
          </View>
        </View>
        <View style={styles.routeDivider} />
        <View style={styles.routeRow}>
          <Ionicons name="navigate" size={16} color={Colors.primary} />
          <Text style={styles.routeText}>{trip.arrival.name}</Text>
          <ArrivalTimeBlock trip={trip} />
        </View>
      </View>

      <View style={styles.tripFooter}>
        <View style={styles.tripFooterLeft}>
          <View style={styles.infoItem}>
            <Ionicons name="people" size={16} color={Colors.gray[600]} />
            <Text style={styles.infoText}>{trip.availableSeats} places</Text>
          </View>
          <View style={[styles.infoItem, { marginLeft: Spacing.lg }]}>
            <Ionicons name="cash" size={16} color={Colors.gray[600]} />
            {trip.price === 0 ? (
              <Text style={[styles.infoText, { color: Colors.success, fontWeight: FontWeights.bold }]}>Gratuit</Text>
            ) : (
              <Text style={styles.infoText}>{trip.price} FC</Text>
            )}
          </View>
        </View>
        <TouchableOpacity style={styles.detailsButton} onPress={() => onDetails(trip.id)}>
          <Text style={styles.detailsButtonText}>Détails</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.ownerActionsRow}>
        <TouchableOpacity
          style={[styles.ownerActionButton, !canManage && styles.ownerActionDisabled]}
          onPress={() => onEdit(trip)}
          disabled={!canManage}
        >
          <Ionicons name="create-outline" size={16} color={Colors.primary} />
          <Text style={styles.ownerActionText}>Modifier</Text>
        </TouchableOpacity>
        {!trip.tripRequestId && (
          <TouchableOpacity
            style={[styles.ownerActionButton, styles.ownerActionDanger, { marginRight: 0 }]}
            onPress={() => onDelete(trip)}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            <Text style={[styles.ownerActionText, styles.ownerActionDangerText]}>Supprimer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

export type BookingTripCardProps = {
  booking: Booking;
  onDetails: (tripId: string) => void;
  status: TripStatusBadge;
};

export const BookingTripCard = React.memo(function BookingTripCard({
  booking,
  onDetails,
  status,
}: BookingTripCardProps) {
  const trip = booking.trip;
  if (!trip) return null;

  return (
    <View style={styles.tripCard}>
      <View style={styles.tripHeader}>
        <View style={styles.tripDriverInfo}>
          {trip.driverAvatar ? (
            <Image source={{ uri: trip.driverAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar} />
          )}
          <View style={styles.tripDriverDetails}>
            <Text style={styles.driverName}>{trip.driverName}</Text>
            <View style={styles.driverMeta}>
              <Ionicons name="star" size={14} color={Colors.secondary} />
              <Text style={styles.driverRating}>{trip.driverRating}</Text>
              {trip.vehicle || trip.vehicleInfo ? (
                <>
                  <View style={styles.dot} />
                  <Text style={styles.vehicleInfo}>
                    {trip.vehicle
                      ? `${trip.vehicle.brand} ${trip.vehicle.model}${trip.vehicle.color ? ` • ${trip.vehicle.color}` : ''}`
                      : trip.vehicleInfo}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
          <Text style={[styles.statusText, { color: status.textColor }]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.routeContainer}>
        <View style={styles.routeRow}>
          <Ionicons name="location" size={16} color={Colors.success} />
          <Text style={styles.routeText}>{trip.departure.name}</Text>
          <View style={styles.timeContainer}>
            <Text style={styles.routeDateLabel}>Départ</Text>
            <Text style={styles.routeTime}>{formatDateTime(trip.departureTime)}</Text>
          </View>
        </View>
        <View style={styles.routeDivider} />
        <View style={styles.routeRow}>
          <Ionicons name="navigate" size={16} color={Colors.primary} />
          <Text style={styles.routeText}>{booking.passengerDestination || trip.arrival.name}</Text>
          <ArrivalTimeBlock trip={trip} />
        </View>
      </View>

      <View style={styles.tripFooter}>
        <View style={styles.tripFooterLeft}>
          <View style={styles.infoItem}>
            <Ionicons name="people" size={16} color={Colors.gray[600]} />
            <Text style={styles.infoText}>
              {booking.numberOfSeats} place{booking.numberOfSeats > 1 ? 's' : ''}
            </Text>
          </View>
          <View style={[styles.infoItem, { marginLeft: Spacing.lg }]}>
            <Ionicons name="cash" size={16} color={Colors.gray[600]} />
            {trip.price === 0 ? (
              <Text style={[styles.infoText, { color: Colors.success, fontWeight: FontWeights.bold }]}>Gratuit</Text>
            ) : (
              <Text style={styles.infoText}>{trip.price * booking.numberOfSeats} FC</Text>
            )}
          </View>
        </View>
        <TouchableOpacity style={styles.detailsButton} onPress={() => onDetails(trip.id)}>
          <Text style={styles.detailsButtonText}>Détails</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
});
