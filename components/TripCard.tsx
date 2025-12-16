import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import type { Trip } from '@/types';
import { formatTime, formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface TripCardProps {
  trip: Trip;
  index?: number;
  onPress?: () => void;
  showReserveButton?: boolean;
  showDetailsButton?: boolean;
}

export function TripCard({ trip, index = 0, onPress, showReserveButton = false, showDetailsButton = true }: TripCardProps) {
  const router = useRouter();
  const calculatedArrivalTime = useTripArrivalTime(trip);

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/trip/${trip.id}`);
    }
  };

  const arrivalTimeDisplay = calculatedArrivalTime 
    ? formatTime(calculatedArrivalTime.toISOString())
    : formatTime(trip.arrivalTime);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 100)}
      style={styles.tripCard}
    >
      <View style={styles.tripHeader}>
        <View style={styles.tripDriverInfo}>
          <View style={styles.avatar} />
          <View style={styles.tripDriverDetails}>
            <Text style={styles.driverName}>{trip.driverName}</Text>
            <View style={styles.driverMeta}>
              <Ionicons name="star" size={14} color={Colors.secondary} />
              <Text style={styles.driverRating}>{trip.driverRating}</Text>
              <View style={styles.dot} />
              <Text style={styles.vehicleInfo}>{trip.vehicleInfo}</Text>
            </View>
          </View>
        </View>
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>
            {trip.price === 0 ? 'Gratuit' : `${trip.price} FC`}
          </Text>
        </View>
      </View>

      <View style={styles.tripRoute}>
        <View style={styles.routeRow}>
          <Ionicons name="location" size={16} color={Colors.success} />
          <Text style={styles.routeText}>{trip.departure.name}</Text>
          <View style={styles.timeContainer}>
            <Text style={styles.routeDateLabel}>
              {formatDateWithRelativeLabel(trip.departureTime, false)}
            </Text>
            <Text style={styles.routeTime}>
              {formatTime(trip.departureTime)}
            </Text>
          </View>
        </View>

        <View style={styles.routeRow}>
          <Ionicons name="navigate" size={16} color={Colors.primary} />
          <Text style={styles.routeText}>{trip.arrival.name}</Text>
          <View style={styles.timeContainer}>
            {calculatedArrivalTime && (
              <Text style={styles.routeDateLabel}>
                {formatDateWithRelativeLabel(calculatedArrivalTime.toISOString(), false)}
              </Text>
            )}
            <Text style={styles.routeTime}>
              {arrivalTimeDisplay}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.tripFooter}>
        <View style={styles.tripFooterLeft}>
          <Ionicons name="people" size={16} color={Colors.gray[600]} />
          <Text style={styles.seatsText}>
            {trip.availableSeats} places disponibles
          </Text>
        </View>
        {showReserveButton && (
          <TouchableOpacity
            style={styles.reserveButton}
            onPress={handlePress}
          >
            <Text style={styles.reserveButtonText}>Réserver</Text>
          </TouchableOpacity>
        )}
        {showDetailsButton && (
          <TouchableOpacity
            style={styles.detailsButton}
            onPress={handlePress}
          >
            <Text style={styles.detailsButtonText}>Voir détails</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tripCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Colors.shadowSm,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  tripDriverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[300],
    marginRight: Spacing.md,
  },
  tripDriverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    marginLeft: Spacing.xs,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[400],
    marginHorizontal: Spacing.sm,
  },
  vehicleInfo: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  priceBadge: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  priceText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  tripRoute: {
    marginBottom: Spacing.md,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  routeText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    marginLeft: Spacing.sm,
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  routeDateLabel: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
    marginBottom: 2,
  },
  routeTime: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seatsText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginLeft: Spacing.xs,
  },
  reserveButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  reserveButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginRight: Spacing.xs,
  },
});

