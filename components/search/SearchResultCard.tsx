import { CompactTripCard } from '@/components/trip/CompactTripCard';
import { homeDepartureLabel, homePriceLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import { getPlaceName, getVehicleName } from '@/features/search/searchModel';
import type { Trip } from '@/types';
import React from 'react';

export type SearchResultCardProps = {
  trip: Trip;
  disabled?: boolean;
  onPress: (trip: Trip) => void;
};

export const SearchResultCard = React.memo(function SearchResultCard({
  trip, disabled = false, onPress,
}: SearchResultCardProps) {
  const rating = Number(trip.driverRating);
  const driverName = trip.driverName || 'Conducteur Zwanga';
  const ratingLabel = Number.isFinite(rating) && rating > 0 ? `★ ${rating.toFixed(1)}` : 'Nouveau conducteur';
  return (
    <CompactTripCard
      searchAppearance="trip"
      unavailable={!Number.isFinite(trip.availableSeats) || trip.availableSeats <= 0}
      disabled={disabled}
      label={homeDepartureLabel(trip.departureTime)}
      departure={getPlaceName(trip.departure)}
      arrival={getPlaceName(trip.arrival)}
      priceText={homePriceLabel(trip.price)}
      priceHint={trip.price > 0 ? '/ place' : undefined}
      metadataPrefix={homeSeatsLabel(trip.availableSeats, true)}
      metadata={getVehicleName(trip)}
      secondary={`${driverName} · ${ratingLabel}`}
      avatarName={driverName}
      avatarUri={trip.driverAvatar?.trim() || trip.driver?.profilePicture}
      accessibilityLabel={`Voir le trajet de ${getPlaceName(trip.departure)} à ${getPlaceName(trip.arrival)}`}
      onPress={() => onPress(trip)}
    />
  );
});
