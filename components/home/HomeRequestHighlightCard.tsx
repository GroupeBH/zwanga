import { formatPrice, placeName } from '@/features/home/homeModel';
import { homeDistanceLabel, homeRequestDepartureLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import { formatRequestDistance } from '@/features/trip-request/requestPriority';
import type { TripRequest } from '@/types';
import React from 'react';
import type { AccessibilityProps } from 'react-native';
import { CompactTripCard } from '@/components/trip/CompactTripCard';
import { getRegisteredVehicleTypeLabel } from '@/constants/vehicleTypes';

type Props = {
  request: TripRequest;
  distanceMeters: number | null;
  onOpen: (requestId: string) => void;
} & Pick<AccessibilityProps, 'accessibilityActions' | 'onAccessibilityAction'>;

export const HomeRequestHighlightCard = React.memo(function HomeRequestHighlightCard({
  request, distanceMeters, onOpen, accessibilityActions, onAccessibilityAction,
}: Props) {
  const passengerName = request.passengerName?.trim() || 'Passager Zwanga';
  const distance = homeDistanceLabel(distanceMeters);
  const distanceDescription = formatRequestDistance(distanceMeters);
  const budget = Number(request.maxPricePerSeat);
  const hasBudget = Number.isFinite(budget) && budget > 0;
  return (
    <CompactTripCard
      inlineRoute
      priorityAppearance="request"
      label={distance ? `Demande · ${distance}` : 'Demande à accepter'}
      priceText={hasBudget ? formatPrice(budget) : undefined}
      priceHint={hasBudget ? 'max / place' : undefined}
      departure={placeName(request.departure)}
      arrival={placeName(request.arrival)}
      metadata={[homeRequestDepartureLabel(request.departureDateMin, request.departureDateMax), homeSeatsLabel(request.numberOfSeats),
        request.vehicleType && getRegisteredVehicleTypeLabel(request.vehicleType)].filter(Boolean).join(' · ')}
      secondary={passengerName}
      avatarName={passengerName}
      avatarUri={request.passengerAvatar}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      accessibilityLabel={`Voir la demande à accepter, de ${placeName(request.departure)} à ${placeName(request.arrival)}${distanceDescription ? `, ${distanceDescription}` : ''}`}
      onPress={() => onOpen(request.id)}
    />
  );
});
