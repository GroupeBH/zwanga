import { Colors } from '@/constants/styles';
import { homePriceLabel } from '@/features/home/homeCardPresentation';
import type { Trip } from '@/types';
import { formatDateTime } from '@/utils/dateHelpers';
import { getRouteStopLabel } from '@/utils/routeLocationLabels';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from './ManageTripSummary.styles';

type Props = {
  trip: Pick<Trip, 'departure' | 'arrival' | 'departureTime' | 'status' | 'availableSeats' | 'totalSeats' | 'price'>;
  onEditRoute?: () => void;
};

/** Display only: no subscriptions, requests, layout measurements or animations. */
export const ManageTripSummary = React.memo(function ManageTripSummary({ trip, onEditRoute }: Props) {
  const departure = getRouteStopLabel(trip.departure);
  const arrival = getRouteStopLabel(trip.arrival);
  const date = trip.departureTime && Number.isFinite(new Date(trip.departureTime).getTime())
    ? `Départ ${formatDateTime(trip.departureTime)}` : 'Horaire à préciser';
  const hasPrice = Number.isFinite(trip.price) && trip.price > 0;

  return (
    <View style={styles.card}>
      <View style={styles.dateRow}>
        <Ionicons name="time-outline" size={16} color={Colors.gray[600]} />
        <Text style={styles.date}>{date}</Text>
      </View>

      <View style={styles.route}>
        <View style={styles.stop} accessible accessibilityLabel={`Départ : ${departure.address}`}>
          <View style={styles.departureDot} />
          <Text style={styles.place} numberOfLines={2}>
            {departure.isResolved ? departure.title : 'Départ à préciser'}
          </Text>
        </View>
        <View style={styles.stop} accessible accessibilityLabel={`Arrivée : ${arrival.address}`}>
          <View style={styles.arrivalDot} />
          <Text style={styles.place} numberOfLines={2}>
            {arrival.isResolved ? arrival.title : 'Arrivée à préciser'}
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.seats} accessible
          accessibilityLabel={`${trip.availableSeats} places libres sur ${trip.totalSeats}`}>
          <Ionicons name="people-outline" size={16} color={Colors.gray[600]} />
          <Text style={styles.seatsText}>
            <Text style={styles.seatsCount}>{trip.availableSeats}/{trip.totalSeats}</Text> places libres
          </Text>
        </View>
        <Text style={styles.price}>
          {homePriceLabel(trip.price)}
          {hasPrice ? <Text style={styles.priceUnit}> / place</Text> : null}
        </Text>
      </View>

      {trip.status === 'upcoming' && onEditRoute ? (
        <TouchableOpacity style={styles.editButton} onPress={onEditRoute}
          accessibilityRole="button" accessibilityLabel="Modifier les adresses" activeOpacity={0.8}>
          <Ionicons name="create-outline" size={16} color={Colors.primaryDark} />
          <Text style={styles.editText}>Modifier les adresses</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.primaryDark} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});
