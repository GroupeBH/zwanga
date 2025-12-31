import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetMyTripsQuery } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { formatTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type OngoingTripBannerPosition = 'top' | 'bottom';

interface OngoingTripBannerProps {
  position?: OngoingTripBannerPosition;
}

export function OngoingTripBanner({ position = 'bottom' }: OngoingTripBannerProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAppSelector(selectUser);
  const insets = useSafeAreaInsets();

  // Animation values
  const translateY = useSharedValue(100);
  const scale = useSharedValue(1);

  // Récupérer les trajets de l'utilisateur (comme conducteur)
  const { data: myTrips } = useGetMyTripsQuery(undefined, {
    skip: !user,
    pollingInterval: 10000,
  });

  // Récupérer les réservations de l'utilisateur (comme passager)
  const { data: myBookings } = useGetMyBookingsQuery(undefined, {
    skip: !user,
    pollingInterval: 10000,
  });

  // Trouver un trajet en cours
  const ongoingTrip = useMemo(() => {
    if (!user) return null;

    // Chercher un trajet en cours comme conducteur
    const driverOngoingTrip = myTrips?.find((trip) => trip.status === 'ongoing');
    if (driverOngoingTrip) {
      return {
        trip: driverOngoingTrip,
        role: 'driver' as const,
      };
    }

    // Chercher un trajet en cours comme passager
    const passengerOngoingBooking = myBookings?.find(
      (booking) => {
        if (booking.status === 'completed') {
          return false;
        }
        if (booking.status !== 'accepted') {
          return false;
        }
        if (booking.trip?.status !== 'ongoing') {
          return false;
        }
        if (booking.droppedOffConfirmedByPassenger === true) {
          return false;
        }
        return true;
      }
    );
    if (passengerOngoingBooking?.trip) {
      return {
        trip: passengerOngoingBooking.trip,
        role: 'passenger' as const,
      };
    }

    return null;
  }, [myTrips, myBookings, user]);

  // Ne pas afficher sur certaines pages
  const shouldHide = useMemo(() => {
    if (!ongoingTrip) return true;

    if (pathname?.startsWith('/auth') || pathname?.startsWith('/splash') || pathname?.startsWith('/onboarding')) {
      return true;
    }

    if (pathname?.includes(`/trip/${ongoingTrip.trip.id}`)) {
      return true;
    }

    if (pathname?.includes(`/trip/manage/${ongoingTrip.trip.id}`)) {
      return true;
    }

    return false;
  }, [pathname, ongoingTrip]);

  // Animate in/out
  useEffect(() => {
    if (!shouldHide && ongoingTrip) {
      translateY.value = withSpring(0, {
        damping: 15,
        stiffness: 100,
      });

      // Subtle pulse animation
      scale.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      translateY.value = withTiming(100, {
        duration: 300,
        easing: Easing.inOut(Easing.ease),
      });
    }
  }, [shouldHide, ongoingTrip]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value }
    ],
  }));

  if (!ongoingTrip || shouldHide) {
    return null;
  }

  const { trip, role } = ongoingTrip;
  const isDriver = role === 'driver';

  const handlePress = () => {
    if (isDriver) {
      router.push(`/trip/manage/${trip.id}`);
    } else {
      router.push(`/trip/${trip.id}`);
    }
  };

  // Gradient colors based on role
  const gradientColors = isDriver
    ? ['#6366F1', '#8B5CF6', '#A855F7'] as const // Purple gradient for driver
    : ['#0EA5E9', '#06B6D4', '#14B8A6'] as const; // Cyan/Teal gradient for passenger

  const iconName = isDriver ? 'car-sport' : 'navigate-circle';
  const statusBadgeColor = isDriver ? '#A855F7' : '#14B8A6';

  // Calculate bottom padding for tab bar
  const tabBarHeight = Platform.OS === 'ios' ? 88 : 125;
  const bottomPadding = tabBarHeight + Spacing.sm;

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: bottomPadding + insets.bottom },
        animatedStyle
      ]}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        style={styles.touchable}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {/* Glassmorphism overlay */}
          <View style={styles.glassOverlay} />

          <View style={styles.content}>
            {/* Icon with glow effect */}
            <View style={styles.iconWrapper}>
              <View style={[styles.iconGlow, { backgroundColor: statusBadgeColor }]} />
              <View style={styles.iconContainer}>
                <Ionicons name={iconName} size={24} color={Colors.white} />
              </View>
            </View>

            {/* Text content */}
            <View style={styles.textContainer}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>
                  {isDriver ? 'Trajet en cours' : 'Vous êtes en route'}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: statusBadgeColor }]}>
                  <Text style={styles.statusBadgeText}>
                    {isDriver ? 'Conducteur' : 'Passager'}
                  </Text>
                </View>
              </View>

              <View style={styles.routeRow}>
                <Ionicons name="location" size={14} color={Colors.white} style={styles.routeIcon} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {trip.departure.name}
                </Text>
              </View>

              <View style={styles.routeRow}>
                <Ionicons name="navigate" size={14} color={Colors.white} style={styles.routeIcon} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {trip.arrival.name}
                </Text>
              </View>

              {trip.departureTime && (
                <View style={styles.timeRow}>
                  <Ionicons name="time-outline" size={14} color={Colors.white} style={styles.routeIcon} />
                  <Text style={styles.timeText}>
                    Départ à {formatTime(trip.departureTime)}
                  </Text>
                </View>
              )}
            </View>

            {/* Chevron */}
            <View style={styles.chevronContainer}>
              <Ionicons name="chevron-forward" size={24} color={Colors.white} />
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 1000,
  },
  touchable: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  gradient: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  iconWrapper: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  iconGlow: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    opacity: 0.3,
    top: -4,
    left: -4,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  textContainer: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    letterSpacing: 0.3,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  statusBadgeText: {
    fontSize: FontSizes.xs - 1,
    fontWeight: FontWeights.semibold,
    color: Colors.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  routeIcon: {
    marginRight: Spacing.xs,
    opacity: 0.9,
  },
  routeText: {
    fontSize: FontSizes.sm,
    color: Colors.white,
    opacity: 0.95,
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  timeText: {
    fontSize: FontSizes.xs,
    color: Colors.white,
    opacity: 0.85,
    fontWeight: FontWeights.medium,
  },
  chevronContainer: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

