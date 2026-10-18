import { getInitials, placeName, vehicleLabel } from '@/features/home/homeModel';
import { homeDepartureLabel, homeRequestDepartureLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import type { Trip, TripRequest } from '@/types';
import { getRegisteredVehicleTypeLabel } from '@/constants/vehicleTypes';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from '@/features/home/HomeSuggestionCard.styles';

type TripProps = {
  kind: 'trip';
  item: Trip;
  distanceMeters?: null;
  booked?: boolean;
  onOpen: (id: string) => void;
};

type RequestProps = {
  kind: 'request';
  item: TripRequest;
  distanceMeters?: number | null;
  booked?: never;
  onOpen: (id: string) => void;
};

type Props = TripProps | RequestProps;

export const HomeSuggestionCard = React.memo(function HomeSuggestionCard({ kind, item, onOpen, distanceMeters, booked }: Props) {
  const isTrip = kind === 'trip';
  const trip = isTrip ? item as Trip : null;
  const request = isTrip ? null : item as TripRequest;
  const departure = placeName(item.departure);
  const arrival = placeName(item.arrival);
  const displayName = isTrip
    ? (trip?.driverName?.trim() || 'Conducteur Zwanga')
    : (request?.passengerName?.trim() || 'Client Zwanga');
  const rawAmount = isTrip ? trip?.price : request?.maxPricePerSeat;
  const amount = rawAmount == null ? Number.NaN : Number(rawAmount);
  const hasAmount = Number.isFinite(amount) && amount > 0;
  const isFree = isTrip && amount === 0;
  const amountLabel = hasAmount ? `${amount.toLocaleString('fr-FR')} FC` : isFree ? 'Gratuit' : 'À préciser';
  const requestIsNow = request && Date.parse(request.departureDateMin) <= Date.now()
    && Date.parse(request.departureDateMax) >= Date.now();
  const timeLabel = isTrip
    ? homeDepartureLabel(trip!.departureTime).replace(/ (\d{1,2}:\d{2})$/, ' · $1')
    : requestIsNow ? 'Maintenant' : homeDepartureLabel(request!.departureDateMin).replace(/ (\d{1,2}:\d{2})$/, ' · $1');
  const fullTimeLabel = isTrip ? timeLabel : homeRequestDepartureLabel(request!.departureDateMin, request!.departureDateMax);
  const metadata = isTrip
    ? `${homeSeatsLabel(trip!.availableSeats)} · ${vehicleLabel[trip!.vehicleType || 'car']}`
    : [homeSeatsLabel(request!.numberOfSeats), request!.vehicleType && getRegisteredVehicleTypeLabel(request!.vehicleType)]
      .filter(Boolean).join(' · ');
  const rating = isTrip ? Number(trip?.driverRating) : Number.NaN;
  const distanceLabel = !isTrip && Number.isFinite(distanceMeters)
    ? distanceMeters! < 1000
      ? `${Math.round(distanceMeters! / 10) * 10} m`
      : `${(distanceMeters! / 1000).toFixed(1).replace('.', ',')} km`
    : null;
  const reviews = trip?.driver?.totalRatings;
  const identityDetail = isTrip && Number.isFinite(rating) && rating > 0
    ? `★ ${rating.toFixed(1).replace('.', ',')}${typeof reviews === 'number' && reviews > 0 ? ` (${reviews} avis)` : ''} · ${metadata}`
    : [metadata, distanceLabel].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={isTrip
        ? `Voir le trajet de ${departure} à ${arrival}`
        : `Voir la commande de ${departure} à ${arrival}`}
      accessibilityHint={`${displayName}. ${fullTimeLabel}. ${amountLabel}. ${metadata}. Ouvre les détails pour confirmer votre choix.`}
      style={styles.card}
      onPress={() => onOpen(item.id)}
    >
      <View style={styles.cardTop}>
        <Text style={styles.time} numberOfLines={1}>{timeLabel}</Text>
        <View style={[styles.pricePill, isFree && styles.freePricePill]}>
          <Text style={[styles.priceText, isFree && styles.freePriceText]} numberOfLines={1}>
            {amountLabel}{hasAmount && !isTrip ? ' max' : ''}
          </Text>
        </View>
      </View>

      <View style={styles.route}>
        <View style={styles.routeLine} />
        <View style={styles.routeRow}>
          <View style={styles.departureDot} />
          <Text style={styles.place} numberOfLines={2}>{departure}</Text>
        </View>
        <View style={[styles.routeRow, styles.arrivalRow]}>
          <View style={styles.arrivalDot} />
          <Text style={styles.place} numberOfLines={2}>{arrival}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitial}>{getInitials(displayName).slice(0, 1)}</Text>
        </View>
        <View style={styles.personCopy}>
          <Text style={styles.personName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.personDetail} numberOfLines={2}>{identityDetail}</Text>
        </View>
        <View style={[styles.actionPill, isTrip ? styles.tripAction : styles.requestAction]}>
          <Text style={styles.actionText}>{isTrip ? booked ? 'Voir' : 'Réserver' : 'Accepter'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});
