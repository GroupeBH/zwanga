import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { getRegisteredVehicleTypeLabel } from '@/constants/vehicleTypes';
import { homeDepartureLabel, homePriceLabel, homeRequestDepartureLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import { formatPrice, getInitials, placeName, vehicleLabel } from '@/features/home/homeModel';
import { styles } from '@/features/home/HomeSuggestionCard.styles';
import type { Trip, TripRequest } from '@/types';

export type HomeSuggestion = { kind: 'trip'; trip: Trip; isBooked: boolean } | { kind: 'request'; request: TripRequest };
type Props = { item: HomeSuggestion; onOpen: (id: string) => void };
export const HomeSuggestionCard = React.memo(function HomeSuggestionCard({ item, onOpen }: Props) {
  const trip = item.kind === 'trip' ? item.trip : null;
  const request = item.kind === 'request' ? item.request : null;
  const record = trip ?? request!;
  const person = trip ? trip.driverName || 'Conducteur Zwanga' : request?.passengerName || 'Passager Zwanga';
  const avatar = trip ? trip.driverAvatar?.trim() || trip.driver?.profilePicture : request?.passengerAvatar;
  const budget = Number(request?.maxPricePerSeat);
  const price = trip ? homePriceLabel(trip.price) : budget > 0 && Number.isFinite(budget) ? formatPrice(budget) : 'À discuter';
  const rating = Number(trip?.driverRating);
  const details = trip ? [Number.isFinite(rating) && rating > 0 ? `★ ${rating.toFixed(1).replace('.', ',')}` : null,
    homeSeatsLabel(trip.availableSeats), vehicleLabel[trip.vehicleType || 'car']].filter(Boolean).join(' · ')
    : [homeSeatsLabel(request!.numberOfSeats), request?.vehicleType && getRegisteredVehicleTypeLabel(request.vehicleType)].filter(Boolean).join(' · ');
  const booked = item.kind === 'trip' && item.isBooked;
  return <TouchableOpacity style={styles.card} activeOpacity={0.85} accessibilityRole="button"
    accessibilityLabel={`${request ? 'Voir le client' : booked ? 'Voir le trajet réservé' : 'Réserver un trajet'} : ${placeName(record.departure)} vers ${placeName(record.arrival)}, ${price}`}
    accessibilityHint={request ? 'Ouvrir les détails pour contacter le passager ou accepter.' : 'Ouvrir les détails du trajet avant de confirmer.'}
    onPress={() => onOpen(record.id)}>
    <View style={styles.top}>
      <Text style={styles.when}>{trip ? homeDepartureLabel(trip.departureTime)
        : homeRequestDepartureLabel(request!.departureDateMin, request!.departureDateMax)}</Text>
      <View style={[styles.price, trip?.price === 0 && styles.free]}>
        <Text style={[styles.priceText, trip?.price === 0 && styles.freeText]}>{price}</Text>
        {(trip ? trip.price > 0 : budget > 0 && Number.isFinite(budget)) && <Text style={styles.priceHint}>{request ? 'max / place' : '/ place'}</Text>}
      </View>
    </View>
    <View style={styles.route}>
      <View style={styles.routeRow}><View style={styles.startDot} /><Text style={styles.place} numberOfLines={2}>{placeName(record.departure)}</Text></View>
      <View style={styles.routeLine} />
      <View style={styles.routeRow}><View style={styles.endDot} /><Text style={styles.place} numberOfLines={2}>{placeName(record.arrival)}</Text></View>
    </View>
    <View style={styles.bottom}>
      <View style={styles.person}>
        {avatar ? <Image source={{ uri: avatar }} style={styles.avatar} />
          : <View style={styles.avatar}><Text style={styles.initials}>{getInitials(person)}</Text></View>}
        <View style={styles.personCopy}><Text style={styles.name} numberOfLines={1}>{person}</Text><Text style={styles.detail}>{details}</Text></View>
      </View>
      <View style={[styles.action, request && styles.clientAction, booked && styles.bookedAction]}>
        <Text style={[styles.actionText, booked && styles.bookedText]}>{request ? 'Voir' : booked ? 'Réservé' : 'Réserver'}</Text>
      </View>
    </View>
  </TouchableOpacity>;
});
