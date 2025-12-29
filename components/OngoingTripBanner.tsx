import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetMyTripsQuery } from '@/store/api/tripApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { formatTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function OngoingTripBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { data: currentUser } = useGetCurrentUserQuery();
  const { data: myTrips = [] } = useGetMyTripsQuery();
  const { data: myBookings = [] } = useGetMyBookingsQuery();

  // Trouver le trajet en cours (en tant que driver)
  const ongoingTripAsDriver = useMemo(() => {
    return myTrips.find((trip) => trip.status === 'ongoing');
  }, [myTrips]);

  // Trouver le trajet en cours (en tant que passager)
  const ongoingTripAsPassenger = useMemo(() => {
    const acceptedBooking = myBookings.find(
      (booking) =>
        (booking.status === 'accepted' || booking.status === 'pending') &&
        booking.tripId &&
        booking.trip
    );
    if (acceptedBooking?.trip) {
      // Vérifier si le trajet est en cours
      if (acceptedBooking.trip.status === 'ongoing') {
        return acceptedBooking.trip;
      }
    }
    return null;
  }, [myBookings]);

  const ongoingTrip = ongoingTripAsDriver || ongoingTripAsPassenger;
  const isDriver = !!ongoingTripAsDriver;

  // Ne pas afficher le banner sur certaines pages
  if (
    !ongoingTrip ||
    !currentUser || // Pas d'utilisateur connecté
    pathname?.includes('/auth') ||
    pathname?.includes('/splash') ||
    pathname?.includes('/onboarding') ||
    pathname?.includes(`/trip/${ongoingTrip.id}`) ||
    pathname?.includes(`/trip/manage/${ongoingTrip.id}`)
  ) {
    return null;
  }

  const handlePress = () => {
    if (isDriver) {
      router.push(`/trip/manage/${ongoingTrip.id}`);
    } else {
      router.push(`/trip/${ongoingTrip.id}`);
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      exiting={FadeOutUp}
      style={[styles.banner, { paddingTop: Math.max(insets.top, Spacing.sm) + Spacing.md }]}
    >
      <TouchableOpacity
        style={styles.bannerContent}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={styles.bannerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="car-sport" size={20} color={Colors.white} />
          </View>
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle}>
              {isDriver ? 'Trajet en cours' : 'Vous êtes dans un trajet'}
            </Text>
            <Text style={styles.bannerSubtitle} numberOfLines={1}>
              {ongoingTrip.departure.name} → {ongoingTrip.arrival.name}
            </Text>
          </View>
        </View>
        <View style={styles.bannerRight}>
          <Text style={styles.bannerTime}>{formatTime(ongoingTrip.departureTime)}</Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.white} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  bannerTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  bannerTitle: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    marginBottom: 2,
  },
  bannerSubtitle: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    opacity: 0.9,
  },
  bannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  bannerTime: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    opacity: 0.9,
  },
});

