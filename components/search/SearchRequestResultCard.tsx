import { CompactTripCard } from '@/components/trip/CompactTripCard';
import { homeRequestDepartureLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import { formatPrice, getPlaceName, getTripRequestVehicleName } from '@/features/search/searchModel';
import type { TripRequest } from '@/types';
import React from 'react';

export type SearchRequestResultCardProps = {
  request: TripRequest;
  disabled?: boolean;
  onPress: (request: TripRequest) => void;
};

export const SearchRequestResultCard = React.memo(function SearchRequestResultCard({
  request, disabled = false, onPress,
}: SearchRequestResultCardProps) {
  const budget = Number(request.maxPricePerSeat);
  const hasBudget = Number.isFinite(budget) && budget > 0;
  const offersCount = request.offers?.length ?? 0;
  return (
    <CompactTripCard
      searchAppearance="request"
      disabled={disabled}
      label={homeRequestDepartureLabel(request.departureDateMin, request.departureDateMax)}
      departure={getPlaceName(request.departure)}
      arrival={getPlaceName(request.arrival)}
      priceText={hasBudget ? formatPrice(budget) : 'À proposer'}
      priceHint={hasBudget ? 'max / place' : undefined}
      metadataPrefix={homeSeatsLabel(request.numberOfSeats)}
      metadata={getTripRequestVehicleName(request)}
      secondary={`Demande de ${request.passengerName || 'Passager Zwanga'}`}
      badge={offersCount > 0 ? `${offersCount} offre${offersCount > 1 ? 's' : ''}` : undefined}
      accessibilityLabel={`Voir la demande de ${getPlaceName(request.departure)} à ${getPlaceName(request.arrival)}`}
      onPress={() => onPress(request)}
    />
  );
});
