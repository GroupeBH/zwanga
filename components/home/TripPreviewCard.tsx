import { Colors } from '@/constants/styles';
import { formatPrice, getInitials, HOME_COLORS, placeName, vehicleIcon, vehicleLabel } from '@/features/home/homeModel';
import type { TripPreviewCardProps } from '@/features/home/homeTypes';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import { formatDateTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Image,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { styles } from '@/features/home/TripPreviewCard.styles';
export const TripPreviewCard = React.memo(function TripPreviewCard({
  cardWidth,
  isBooked,
  isSelected,
  onOpen,
  trip,
}: TripPreviewCardProps) {
  const calculatedArrivalTime = useTripArrivalTime(trip);
  const parsedRating = Number(trip.driverRating);
  const hasDriverRating = Number.isFinite(parsedRating) && parsedRating > 0;
  const arrivalDateTime = calculatedArrivalTime
    ? formatDateTime(calculatedArrivalTime.toISOString())
    : formatDateTime(trip.arrivalTime);
  const tripVehicleType = trip.vehicleType || 'car';
  const driverName = trip.driverName || 'Conducteur Zwanga';
  const seatsLabel = `${trip.availableSeats} place${trip.availableSeats > 1 ? 's' : ''}`;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`Voir le trajet de ${placeName(trip.departure)} à ${placeName(trip.arrival)}`}
      onPress={() => onOpen(trip.id)}
      style={[styles.tripPreviewCard, isSelected && styles.tripPreviewCardSelected, { width: cardWidth }]}
    >
      <View style={styles.tripPreviewTopRow}>
        <View style={styles.tripDriverInline}>
          {trip.driverAvatar ? (
            <Image source={{ uri: trip.driverAvatar }} style={styles.tripPreviewAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.tripPreviewAvatar, styles.tripPreviewAvatarFallback]}>
              <Text style={styles.tripPreviewAvatarText}>{getInitials(driverName)}</Text>
            </View>
          )}
          <View style={styles.tripPreviewDriverCopy}>
            <Text style={styles.tripPreviewDriverName} numberOfLines={1}>
              {driverName}
            </Text>
            <View style={styles.tripPreviewMetaRow}>
              <Ionicons
                name={hasDriverRating ? 'star' : 'star-outline'}
                size={12}
                color={hasDriverRating ? Colors.secondary : Colors.gray[400]}
              />
              <Text style={styles.tripPreviewRating}>{hasDriverRating ? parsedRating.toFixed(1) : 'Nouveau'}</Text>
            </View>
          </View>
        </View>
        <View style={styles.tripPreviewPriceBlock}>
          <Text
            style={styles.tripPreviewPrice}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {formatPrice(trip.price)}
          </Text>
          {trip.price > 0 && <Text style={styles.tripPreviewPriceNote}>par place</Text>}
        </View>
      </View>

      <View style={styles.tripPreviewRoute}>
        <View style={styles.tripPreviewRail}>
          <View style={[styles.tripPreviewRouteDot, styles.tripPreviewStartDot]} />
          <View style={styles.tripPreviewRouteLine} />
          <View style={[styles.tripPreviewRouteDot, styles.tripPreviewEndDot]} />
        </View>
        <View style={styles.tripPreviewRouteCopy}>
          <View>
            <Text style={styles.tripPreviewRouteLabel}>DÉPART - {formatDateTime(trip.departureTime)}</Text>
            <Text style={styles.tripPreviewRouteText} numberOfLines={1}>
              {placeName(trip.departure)}
            </Text>
          </View>
          <View>
            <Text style={styles.tripPreviewRouteLabel}>ARRIVÉE ESTIMÉE - {arrivalDateTime}</Text>
            <Text style={styles.tripPreviewRouteText} numberOfLines={1}>
              {placeName(trip.arrival)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.tripPreviewFooter}>
        <View style={styles.tripPreviewChips}>
          <View style={styles.tripPreviewChip}>
            <Text style={styles.tripPreviewChipText} numberOfLines={1}>{seatsLabel}</Text>
          </View>
          <View style={styles.tripPreviewVehicleChip}>
            <Ionicons name={vehicleIcon[tripVehicleType]} size={13} color={HOME_COLORS.navy} />
            <Text style={styles.tripPreviewVehicleText} numberOfLines={1}>{vehicleLabel[tripVehicleType]}</Text>
          </View>
          {isBooked && (
            <View style={styles.tripPreviewBookedChip}>
              <Text style={styles.tripPreviewBookedText}>Réservé</Text>
            </View>
          )}
        </View>
        <View style={styles.tripPreviewOpenButton}>
          <Ionicons name="chevron-forward" size={22} color={Colors.white} />
        </View>
      </View>
    </TouchableOpacity>
  );
});
