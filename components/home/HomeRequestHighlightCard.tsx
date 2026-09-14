import { Colors } from '@/constants/styles';
import { styles } from '@/features/home/HomeActivityCards.styles';
import { placeName } from '@/features/home/homeModel';
import { formatRequestDistance } from '@/features/trip-request/requestPriority';
import type { TripRequest } from '@/types';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type Props = {
  request: TripRequest;
  distanceMeters: number | null;
  onOpen: (requestId: string) => void;
};

export const HomeRequestHighlightCard = React.memo(function HomeRequestHighlightCard({ request, distanceMeters, onOpen }: Props) {
  const distanceLabel = formatRequestDistance(distanceMeters);
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`Voir la demande à accepter, de ${placeName(request.departure)} à ${placeName(request.arrival)}${distanceLabel ? `, ${distanceLabel}` : ''}`}
      style={[styles.activeRequestCard, styles.highlightedRequestCard]}
      onPress={() => onOpen(request.id)}
    >
      <View style={styles.activeRequestIcon}>
        <Ionicons name="hand-right-outline" size={19} color={Colors.primary} />
      </View>
      <View style={styles.activeRequestText}>
        <Text style={styles.activeRequestLabel} numberOfLines={1}>Demande à accepter</Text>
        <Text style={styles.activeRequestRoute} numberOfLines={1}>
          {placeName(request.departure)} vers {placeName(request.arrival)}
        </Text>
        <Text style={styles.driverReservationRoute} numberOfLines={1}>
          {distanceLabel ? `${distanceLabel} · ` : ''}{request.numberOfSeats} place{request.numberOfSeats > 1 ? 's' : ''}
        </Text>
        <Text style={styles.driverReservationRoute} numberOfLines={1}>
          {formatDateWithRelativeLabel(request.departureDateMin, true)}
        </Text>
      </View>
      <View style={styles.driverReservationAction}>
        <Text style={styles.activeRequestLabel}>Voir</Text>
        <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
      </View>
    </TouchableOpacity>
  );
});
