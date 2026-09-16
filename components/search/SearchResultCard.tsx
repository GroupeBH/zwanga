import { Colors } from '@/constants/styles';
import {
  formatDurationMinutes,
  formatPrice,
  getInitials,
  getPlaceName,
  getVehicleName,
  vehicleLabel,
} from '@/features/search/searchModel';
import { SEARCH_COLORS } from '@/features/search/searchTheme';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import type { Trip } from '@/types';
import { formatDateTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../features/screen-styles/app/search/index';

export type SearchResultCardProps = {
  trip: Trip;
  disabled?: boolean;
  onPress: (trip: Trip) => void;
};

export const SearchResultCard = React.memo(function SearchResultCard({
  trip,
  disabled = false,
  onPress,
}: SearchResultCardProps) {
  const calculatedArrivalTime = useTripArrivalTime(trip);
  const arrivalIso = calculatedArrivalTime?.toISOString() ?? trip.arrivalTime;
  const departureDateTime = formatDateTime(trip.departureTime);
  const arrivalDateTime = formatDateTime(arrivalIso);
  const parsedRating = Number(trip.driverRating);
  const hasRating = Number.isFinite(parsedRating) && parsedRating > 0;
  const driverName = trip.driverName || 'Conducteur Zwanga';
  const isVerified = Boolean(trip.driver?.premiumBadge || trip.driver?.premiumBadgeEnabled || trip.driver?.isPremium);
  const vehicleName = getVehicleName(trip);
  const seatsLabel = `${trip.availableSeats} place${trip.availableSeats > 1 ? 's' : ''} libre${trip.availableSeats > 1 ? 's' : ''}`;
  const routeAccent = trip.vehicleType === 'moto' ? Colors.primaryDark : trip.vehicleType === 'tricycle' ? Colors.infoDark : Colors.success;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[styles.resultCard, disabled && styles.resultCardDisabled]}
      onPress={() => onPress(trip)}
      disabled={disabled}
      accessibilityState={{ disabled }}
    >
      <View style={styles.resultTop}>
        <View style={styles.driverAvatarWrap}>
          {trip.driverAvatar ? (
            <Image source={{ uri: trip.driverAvatar }} style={styles.driverAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.driverAvatar, styles.driverAvatarFallback]}>
              <Text style={styles.driverAvatarText}>{getInitials(driverName)}</Text>
            </View>
          )}
          {isVerified && (
            <View style={styles.driverVerifiedBadge}>
              <Ionicons name="checkmark" size={12} color={Colors.white} />
            </View>
          )}
        </View>

        <View style={styles.driverCopy}>
          <Text style={styles.driverName} numberOfLines={1}>
            {driverName}
          </Text>
          <View style={styles.driverMetaRow}>
            <Ionicons name={hasRating ? 'star' : 'star-outline'} size={15} color={Colors.successDark} />
            <Text style={styles.driverMetaText}>
              {hasRating ? parsedRating.toFixed(1) : 'Nouveau'}
            </Text>
            <Text style={styles.driverMetaDot}>•</Text>
            <Text style={styles.driverMetaText}>
              {trip.driver?.totalRatings ? `${trip.driver.totalRatings} trajets` : 'Trajets récents'}
            </Text>
          </View>
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.resultPrice}>{formatPrice(trip.price)}</Text>
          {trip.price > 0 && <Text style={styles.priceUnit}>par personne</Text>}
        </View>
      </View>

      <View style={styles.tripTimingPanel}>
        <View style={[styles.timingAccent, { backgroundColor: routeAccent }]} />
        <View style={styles.departureTimeBlock}>
          <Text style={styles.departureTime}>{departureDateTime}</Text>
          <Text style={[styles.departureLabel, { color: routeAccent }]}>DÉPART</Text>
        </View>
        <View style={styles.durationBlock}>
          <View style={styles.durationLine} />
          <Text style={styles.durationText}>{formatDurationMinutes(trip.departureTime, arrivalIso)}</Text>
          <Ionicons name="car-sport" size={16} color={SEARCH_COLORS.body} />
        </View>
        <View style={styles.vehicleBlock}>
          <View style={styles.vehiclePill}>
            <Text style={styles.vehiclePillText} numberOfLines={1}>
              {vehicleName}
            </Text>
          </View>
          <Text style={styles.vehicleSubtext} numberOfLines={2}>
            {trip.description || `${vehicleLabel[trip.vehicleType || 'car']} • ${seatsLabel}`}
          </Text>
          <Text style={styles.arrivalEstimateText} numberOfLines={1}>
            Arrivée estimée {arrivalDateTime}
          </Text>
        </View>
      </View>

      <View style={styles.routeSummary}>
        <Text style={styles.routeSummaryText} numberOfLines={1}>
          {getPlaceName(trip.departure)} → {getPlaceName(trip.arrival)}
        </Text>
      </View>

      <View style={styles.resultBadges}>
        {isVerified && (
          <View style={styles.greenBadge}>
            <Ionicons name="shield-checkmark-outline" size={14} color={Colors.successDark} />
            <Text style={styles.greenBadgeText}>VÉRIFIÉ</Text>
          </View>
        )}
        {trip.price > 0 ? (
          <View style={styles.instantBadge}>
            <Ionicons name="flash" size={13} color={Colors.primaryDark} />
            <Text style={styles.instantBadgeText}>RÉSERVATION INSTANTANÉE</Text>
          </View>
        ) : (
          <View style={styles.greenBadge}>
            <Ionicons name="cash-outline" size={14} color={Colors.successDark} />
            <Text style={styles.greenBadgeText}>GRATUIT</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});
