import { RateTargetType } from './ratingTypes';
import { styles } from '../screen-styles/app/rate/detail/index';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { Trip } from '@/types';
import type { useGetTripBookingsQuery } from '@/store/api/bookingApi';

interface RatingParticipantSelectorProps {
  isTripDriver: boolean;
  rateTargetType: RateTargetType;
  trip: Trip | undefined;
  selectedPassenger: string | null;
  passengers: { id: string; name: string; seats: number }[];
  isTripPassenger: boolean;
  setRateTargetType: React.Dispatch<React.SetStateAction<RateTargetType>>;
  setSelectedPassenger: React.Dispatch<React.SetStateAction<string | null>>;
  bookingsLoading: boolean;
  bookingsError: ReturnType<typeof useGetTripBookingsQuery>['error'];
  refetchBookings: () => unknown;
  disabled?: boolean;
}

/** Drivers rate completed passengers; passengers rate their driver, not strangers. */
export function RatingParticipantSelector({
  isTripDriver, trip, selectedPassenger, passengers, setSelectedPassenger,
  bookingsLoading, bookingsError, refetchBookings, disabled = false,
}: RatingParticipantSelectorProps) {
  const selected = passengers.find(passenger => passenger.id === selectedPassenger);
  return <View style={styles.driverCard}>
    <View style={styles.driverInfo}>
      <View style={styles.driverAvatar}>
        <Ionicons name={isTripDriver ? 'person-outline' : 'car-outline'} size={28} color={Colors.primary} />
      </View>
      <View style={styles.driverDetails}>
        <Text style={styles.driverName}>{isTripDriver ? selected?.name ?? 'Passagers du trajet' : trip?.driverName ?? 'Votre conducteur'}</Text>
        <Text style={styles.driverMetaText}>{isTripDriver
          ? `${passengers.length} passager${passengers.length > 1 ? 's' : ''} à noter` : 'Votre avis sur ce trajet'}</Text>
        {trip && <Text style={styles.driverTrip}>{trip.departure?.name ?? 'Départ'} → {trip.arrival?.name ?? 'Arrivée'}</Text>}
      </View>
    </View>
    {isTripDriver && <View style={styles.dropSection}>
      {bookingsLoading ? <Text style={styles.emptyPassengerText}>Chargement des passagers…</Text>
        : bookingsError ? <View>
          <Text style={styles.emptyPassengerText}>Impossible d’actualiser les passagers.</Text>
          <TouchableOpacity style={[styles.retryButton, { marginTop: Spacing.sm }]} disabled={disabled}
            accessibilityRole="button" onPress={() => refetchBookings()}>
            <Ionicons name="refresh" size={16} color={Colors.primary} />
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View> : passengers.length === 0 ? <Text style={styles.emptyPassengerText}>Aucun passager à noter pour le moment.</Text> : null}
      {passengers.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.passengerChips}>
        {passengers.map(passenger => {
          const selected = selectedPassenger === passenger.id;
          return <TouchableOpacity key={passenger.id} disabled={disabled}
            accessibilityRole="button" accessibilityState={{ selected, disabled }}
            style={[styles.passengerChip, selected && styles.passengerChipActive]}
            onPress={() => setSelectedPassenger(passenger.id)}>
            <Ionicons name="person" size={16} color={selected ? Colors.white : Colors.gray[600]} />
            <Text style={[styles.passengerChipText, selected && styles.passengerChipTextActive]}>{passenger.name}</Text>
          </TouchableOpacity>;
        })}
      </ScrollView>}
    </View>}
  </View>;
}
