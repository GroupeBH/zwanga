import { placeName, vehicleLabel } from '@/features/home/homeModel';
import { homeDepartureLabel, homePriceLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import type { TripPreviewCardProps } from '@/features/home/homeTypes';
import React from 'react';
import { CompactTripCard } from '@/components/trip/CompactTripCard';

export const TripPreviewCard = React.memo(function TripPreviewCard({
  cardWidth, isBooked, isSelected, onOpen, trip,
}: TripPreviewCardProps) {
  const rating = Number(trip.driverRating);
  const driverName = trip.driverName || 'Conducteur Zwanga';
  const ratingLabel = Number.isFinite(rating) && rating > 0 ? `★ ${rating.toFixed(1)}` : 'Nouveau conducteur';
  return (
    <CompactTripCard
      width={cardWidth}
      selected={isSelected}
      label={homeDepartureLabel(trip.departureTime)}
      priceText={homePriceLabel(trip.price)}
      priceHint={trip.price > 0 ? '/ place' : undefined}
      departure={placeName(trip.departure)}
      arrival={placeName(trip.arrival)}
      metadata={`${homeSeatsLabel(trip.availableSeats, true)} · ${vehicleLabel[trip.vehicleType || 'car']}`}
      secondary={`${driverName} · ${ratingLabel}`}
      avatarName={driverName}
      avatarUri={trip.driverAvatar?.trim() || trip.driver?.profilePicture}
      badge={isBooked ? 'Réservé' : undefined}
      accessibilityLabel={`Voir le trajet de ${placeName(trip.departure)} à ${placeName(trip.arrival)}`}
      onPress={() => onOpen(trip.id)}
    />
  );
});
