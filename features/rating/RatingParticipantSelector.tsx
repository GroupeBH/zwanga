import { RateTargetType } from './ratingTypes';
import { styles } from '../screen-styles/app/rate/detail/index';
import { Colors, FontSizes, Spacing } from '@/constants/styles';
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
  passengers: { id: string; name: string; seats: number; }[];
  isTripPassenger: boolean;
  setRateTargetType: React.Dispatch<React.SetStateAction<RateTargetType>>;
  setSelectedPassenger: React.Dispatch<React.SetStateAction<string | null>>;
  bookingsLoading: boolean;
  bookingsError: ReturnType<typeof useGetTripBookingsQuery>['error'];
  refetchBookings: ReturnType<typeof useGetTripBookingsQuery>['refetch'];
}

export function RatingParticipantSelector({
  isTripDriver,
  rateTargetType,
  trip,
  selectedPassenger,
  passengers,
  isTripPassenger,
  setRateTargetType,
  setSelectedPassenger,
  bookingsLoading,
  bookingsError,
  refetchBookings,
}: RatingParticipantSelectorProps) {
  return (
    <View style={styles.driverCard}>
      <View style={styles.driverInfo}>
        <View style={styles.driverAvatar} />
        <View style={styles.driverDetails}>
          <Text style={styles.driverName}>
            {isTripDriver 
              ? 'Choisissez un passager'
              : rateTargetType === 'driver'
              ? trip?.driverName ?? 'Conducteur'
              : selectedPassenger 
              ? passengers.find(p => p.id === selectedPassenger)?.name ?? 'Passager'
              : 'Choisissez qui évaluer'}
          </Text>
          <View style={styles.driverMeta}>
            <Ionicons name="star" size={16} color={Colors.secondary} />
            <Text style={styles.driverMetaText}>
              {isTripDriver
                ? 'Attribuez une note à vos passagers'
                : rateTargetType === 'driver'
                ? `${trip?.driverRating?.toFixed?.(1) ?? '—'} · ${
                    trip?.vehicleInfo ?? 'Véhicule à confirmer'
                  }`
                : 'Attribuez une note à ce passager'}
            </Text>
          </View>
          {trip && (
            <Text style={styles.driverTrip}>
              {trip.departure?.name ?? 'Départ'} → {trip.arrival?.name ?? 'Arrivée'}
            </Text>
          )}
        </View>
      </View>
      
      {/* Sélection pour les passagers : conducteur ou autres passagers */}
      {isTripPassenger && (
        <View style={styles.dropSection}>
          <Text style={styles.dropLabel}>Qui souhaitez-vous évaluer ?</Text>
          
          {/* Option pour noter le conducteur */}
          <TouchableOpacity
            style={[
              styles.targetOption,
              rateTargetType === 'driver' && styles.targetOptionActive,
              { marginBottom: Spacing.sm }
            ]}
            onPress={() => {
              setRateTargetType('driver');
              setSelectedPassenger(null);
            }}
          >
            <Ionicons
              name="car"
              size={20}
              color={rateTargetType === 'driver' ? Colors.white : Colors.gray[600]}
            />
            <View style={styles.targetOptionContent}>
              <Text
                style={[
                  styles.targetOptionText,
                  rateTargetType === 'driver' && styles.targetOptionTextActive,
                ]}
              >
                {trip?.driverName ?? 'Conducteur'}
              </Text>
              <Text
                style={[
                  styles.targetOptionSubtext,
                  rateTargetType === 'driver' && styles.targetOptionSubtextActive,
                ]}
              >
                Évaluer le conducteur
              </Text>
            </View>
            {rateTargetType === 'driver' && (
              <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
            )}
          </TouchableOpacity>

          {/* Liste des autres passagers */}
          {passengers.length > 0 && (
            <>
              <Text style={[styles.dropLabel, { marginTop: Spacing.md, marginBottom: Spacing.sm }]}>
                Autres passagers
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.passengerChips}
              >
                {passengers.map((passenger) => {
                  const active = rateTargetType === 'passenger' && selectedPassenger === passenger.id;
                  return (
                    <TouchableOpacity
                      key={passenger.id}
                      style={[styles.passengerChip, active && styles.passengerChipActive]}
                      onPress={() => {
                        setRateTargetType('passenger');
                        setSelectedPassenger(passenger.id);
                      }}
                    >
                      <Ionicons
                        name="person"
                        size={16}
                        color={active ? Colors.white : Colors.gray[600]}
                      />
                      <Text
                        style={[
                          styles.passengerChipText,
                          active && styles.passengerChipTextActive,
                        ]}
                      >
                        {passenger.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}
        </View>
      )}

      {/* Sélection pour le conducteur : liste des passagers */}
      {isTripDriver && (
        <View style={styles.dropSection}>
          <Text style={styles.dropLabel}>Sélectionner un passager</Text>
          {bookingsLoading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.emptyPassengerText}>Chargement des passagers...</Text>
            </View>
          ) : passengers.length === 0 ? (
            <View>
              <Text style={styles.emptyPassengerText}>
                {bookingsError 
                  ? 'Impossible de charger les passagers. Veuillez réessayer.'
                  : 'Aucun passager à évaluer pour ce trajet.'}
              </Text>
              {bookingsError && (
                <TouchableOpacity
                  style={[styles.retryButton, { marginTop: Spacing.md }]}
                  onPress={() => refetchBookings()}
                >
                  <Ionicons name="refresh" size={16} color={Colors.primary} />
                  <Text style={styles.retryButtonText}>Réessayer</Text>
                </TouchableOpacity>
              )}
              {bookingsError && trip?.passengers && trip.passengers.length > 0 && (
                <Text style={[styles.emptyPassengerText, { marginTop: Spacing.sm, fontSize: FontSizes.sm }]}>
                  Utilisation des données du trajet comme alternative.
                </Text>
              )}
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.passengerChips}
            >
              {passengers.map((passenger) => {
                const active = rateTargetType === 'passenger' && selectedPassenger === passenger.id;
                return (
                  <TouchableOpacity
                    key={passenger.id}
                    style={[styles.passengerChip, active && styles.passengerChipActive]}
                    onPress={() => {
                      setRateTargetType('passenger');
                      setSelectedPassenger(passenger.id);
                    }}
                  >
                    <Ionicons
                      name="person"
                      size={16}
                      color={active ? Colors.white : Colors.gray[600]}
                    />
                    <Text
                      style={[
                        styles.passengerChipText,
                        active && styles.passengerChipTextActive,
                      ]}
                    >
                      {passenger.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}
