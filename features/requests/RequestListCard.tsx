import { CompactTripCard } from '@/components/trip/CompactTripCard';
import { styles } from '@/components/trip/CompactListCard.styles';
import { Colors } from '@/constants/styles';
import { getRegisteredVehicleTypeLabel } from '@/constants/vehicleTypes';
import { homePriceLabel, homeRequestDepartureLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import { placeName } from '@/features/home/homeModel';
import type { TripRequest } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

const statuses: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: Colors.gray[700] },
  offers_received: { label: 'Offres reçues', color: Colors.info },
  driver_selected: { label: 'Conducteur sélectionné', color: Colors.success },
  cancelled: { label: 'Annulée', color: Colors.danger },
  expired: { label: 'Expirée', color: Colors.gray[600] },
};

type Props = {
  request: TripRequest;
  onOpen: (requestId: string) => void;
  own?: boolean;
  featured?: boolean;
  canAccept?: boolean;
};

export const RequestListCard = React.memo(function RequestListCard({
  request, onOpen, own = false, featured = false, canAccept = false,
}: Props) {
  const status = statuses[request.status] || statuses.pending;
  const offersCount = own
    ? request.offers?.filter(offer => offer.status === 'pending').length ?? 0
    : request.offers?.length ?? 0;
  const name = own
    ? (request.selectedDriverId ? request.selectedDriverName || 'Conducteur Zwanga' : undefined)
    : request.passengerName || 'Passager Zwanga';
  const vehicle = request.vehicleType && getRegisteredVehicleTypeLabel(request.vehicleType);
  const budget = Number(request.maxPricePerSeat);
  const hasBudget = Number.isFinite(budget) && budget > 0;
  return (
    <View style={[styles.card, featured && styles.featured]}>
      <CompactTripCard
        embedded
        label={status.label}
        labelColor={status.color}
        departure={placeName(request.departure)}
        arrival={placeName(request.arrival)}
        priceText={hasBudget ? homePriceLabel(budget) : undefined}
        priceHint={hasBudget ? 'max / place' : undefined}
        metadata={`${homeRequestDepartureLabel(request.departureDateMin, request.departureDateMax)} · ${homeSeatsLabel(request.numberOfSeats)}`}
        secondary={[name, vehicle, own && request.tripId ? 'Course créée' : null].filter(Boolean).join(' · ')}
        avatarName={name}
        avatarUri={own ? request.selectedDriverAvatar : request.passengerAvatar}
        badge={offersCount > 0 ? `${offersCount} offre${offersCount > 1 ? 's' : ''}` : undefined}
        accessibilityLabel={own && request.tripId ? 'Suivre la course' : 'Ouvrir la demande'}
        onPress={() => onOpen(request.id)}
      />
      {!own && canAccept && (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.action, styles.primary]} accessibilityRole="button"
            accessibilityLabel="Ouvrir la demande pour l’accepter" onPress={() => onOpen(request.id)}>
            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.white} />
            <Text style={[styles.actionText, styles.primaryText]}>Accepter</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});
