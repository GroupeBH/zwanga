import { formatPrice, getTripRequestStatusMeta, placeName } from '@/features/home/homeModel';
import { homeRequestDepartureLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import type { TripRequestPreviewCardProps } from '@/features/home/homeTypes';
import React from 'react';
import { CompactTripCard } from '@/components/trip/CompactTripCard';
import { getRegisteredVehicleTypeLabel } from '@/constants/vehicleTypes';

export const TripRequestPreviewCard = React.memo(function TripRequestPreviewCard({
  cardWidth, onOpen, request,
}: TripRequestPreviewCardProps) {
  const passengerName = request.passengerName?.trim() || 'Passager Zwanga';
  const pendingOffers = request.offers?.filter(offer => offer.status === 'pending').length ?? 0;
  const budget = Number(request.maxPricePerSeat);
  const hasBudget = Number.isFinite(budget) && budget > 0;
  return (
    <CompactTripCard
      width={cardWidth}
      label={homeRequestDepartureLabel(request.departureDateMin, request.departureDateMax)}
      priceText={hasBudget ? formatPrice(budget) : undefined}
      priceHint={hasBudget ? 'max / place' : undefined}
      departure={placeName(request.departure)}
      arrival={placeName(request.arrival)}
      metadata={[homeSeatsLabel(request.numberOfSeats), request.vehicleType && getRegisteredVehicleTypeLabel(request.vehicleType)].filter(Boolean).join(' · ')}
      secondary={`${passengerName} · ${getTripRequestStatusMeta(request.status).label}`}
      avatarName={passengerName}
      avatarUri={request.passengerAvatar}
      badge={pendingOffers > 0 ? `${pendingOffers} offre${pendingOffers > 1 ? 's' : ''}` : undefined}
      accessibilityLabel={`Voir la demande de ${placeName(request.departure)} à ${placeName(request.arrival)}`}
      onPress={() => onOpen(request.id)}
    />
  );
});
