import { RateTargetType } from './ratingTypes';
import { styles } from './ratingExperience.styles';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
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
  reporting?: boolean;
}

export function RatingParticipantSelector({ isTripDriver, rateTargetType, trip, selectedPassenger,
  passengers, isTripPassenger, setRateTargetType, setSelectedPassenger, bookingsLoading,
  bookingsError, refetchBookings, disabled = false, reporting = false,
}: RatingParticipantSelectorProps) {
  const selected = passengers.find(passenger => passenger.id === selectedPassenger);
  const name = rateTargetType === 'driver' ? trip?.driverName || 'Votre conducteur' : selected?.name;
  const ready = rateTargetType === 'driver' ? Boolean(trip?.driverId) : Boolean(selected);
  const options = [
    ...(isTripPassenger && trip ? [{ id: trip.driverId, name: trip.driverName || 'Conducteur', type: 'driver' as const }] : []),
    ...passengers.map(passenger => ({ ...passenger, type: 'passenger' as const })),
  ];
  const showChoices = (isTripDriver || isTripPassenger) && (options.length > 1 || !ready) && !bookingsLoading;
  return <View style={styles.participant}>
    {ready && <View style={styles.identity} testID="rating-selected-person">
      <View style={styles.avatar} accessible={false}>
        <Text style={styles.initial}>{name?.trim().charAt(0).toLocaleUpperCase() || '?'}</Text>
      </View>
      <View style={styles.identityText}>
        <Text style={styles.role}>{rateTargetType === 'driver' ? 'Votre conducteur' : 'Votre passager'}</Text>
        <Text style={styles.name}>{name}</Text>
      </View>
    </View>}
    {trip && <Text style={styles.route} numberOfLines={2}>
      {trip.departure?.name || 'Départ'} → {trip.arrival?.name || 'Arrivée'}
    </Text>}
    {!ready && <Text style={styles.hint}>
      {!trip ? 'Chargement du trajet…' : bookingsLoading ? 'Chargement des passagers…'
        : options.length ? `Choisissez la personne à ${reporting ? 'signaler' : 'noter'} ci-dessous.`
        : bookingsError ? 'Impossible de charger les passagers.' : 'Aucun passager à afficher pour ce trajet.'}
    </Text>}
    {!ready && bookingsError && <TouchableOpacity accessibilityRole="button" disabled={disabled}
      onPress={() => { void Promise.resolve().then(refetchBookings).catch(() => {}); }} style={styles.choice}>
      <Ionicons name="refresh" size={20} color={Colors.primary} /><Text style={styles.choiceText}>Réessayer</Text>
    </TouchableOpacity>}
    {showChoices && <View style={styles.choices}>
      {ready && <Text style={styles.hint}>{isTripDriver ? 'Autre passager à choisir' : 'Changer de personne'}</Text>}
      {options.map(person => {
        const checked = rateTargetType === person.type && (person.type === 'driver' || selectedPassenger === person.id);
        return <TouchableOpacity key={`${person.type}:${person.id}`} accessibilityRole="radio"
          accessibilityLabel={`${person.name}, ${person.type === 'driver' ? 'conducteur' : 'passager'}`}
          accessibilityState={{ checked, disabled }} disabled={disabled}
          style={[styles.choice, checked && styles.choiceSelected]} onPress={() => {
            setRateTargetType(person.type); setSelectedPassenger(person.type === 'driver' ? null : person.id);
          }}>
          <Text style={styles.choiceText}>{person.name}</Text>
          <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={checked ? Colors.primary : Colors.gray[600]} />
        </TouchableOpacity>;
      })}
    </View>}
  </View>;
}
