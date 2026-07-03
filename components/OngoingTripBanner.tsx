import { getFloatingBannerBottomOffset } from '@/constants/navigation';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  startOngoingTripTracking,
  stopOngoingTripTracking,
} from '@/services/ongoingTripNotification';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetMyTripsQuery } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { formatTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from '@/utils/reanimated';
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

  // Récupérer les trajets de l'utilisateur (comme conducteur)
  const { data: myTrips } = useGetMyTripsQuery(undefined, {
    skip: !user,
    // Pas de polling : les trajets en cours changent rarement de statut
    // RTK Query invalide automatiquement le cache via les tags après startTrip, updateTrip, etc.
    refetchOnMountOrArgChange: true, // Refetch seulement au montage ou si les args changent
  });

  // Récupérer les réservations de l'utilisateur (comme passager)
  const { data: myBookings } = useGetMyBookingsQuery(undefined, {
    skip: !user,
    // Pas de polling : les réservations changent rarement de statut
    // RTK Query invalide automatiquement le cache via les tags après acceptBooking, updateBookingStatus, etc.
    refetchOnMountOrArgChange: true, // Refetch seulement au montage ou si les args changent
  });

  // Fonction helper pour vérifier si un trajet est expiré
  const isTripExpired = (trip: { departureTime?: string | null }): boolean => {
    if (!trip.departureTime) return false;
    const departureDate = new Date(trip.departureTime);
    const now = new Date();
    return departureDate < now;
  };

  // Trouver un trajet en cours
  const ongoingTrip = useMemo(() => {
    if (!user) return null;

    // Chercher un trajet en cours comme conducteur
    const driverOngoingTrip = myTrips?.find((trip) => {
      // Exclure les trajets expirés
      if (isTripExpired(trip)) {
        return false;
      }
      return trip.status === 'ongoing';
    });
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
        // Exclure les trajets expirés
        if (booking.trip && isTripExpired(booking.trip)) {
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

  // Ref pour suivre le trajet précédent
  const previousTripIdRef = useRef<string | null>(null);

  // Démarrer/arrêter le suivi de notification permanente
  useEffect(() => {
    const currentTripId = ongoingTrip?.trip.id ?? null;
    
    // Si le trajet a changé
    if (currentTripId !== previousTripIdRef.current) {
      // Arrêter le suivi précédent si nécessaire
      if (previousTripIdRef.current) {
        stopOngoingTripTracking();
      }
      
      // Démarrer le nouveau suivi si un trajet est en cours
      if (ongoingTrip) {
        startOngoingTripTracking({
          tripId: ongoingTrip.trip.id,
          departure: ongoingTrip.trip.departure.name,
          arrival: ongoingTrip.trip.arrival.name,
          role: ongoingTrip.role,
          departureTime: ongoingTrip.trip.departureTime,
        });
      }
      
      previousTripIdRef.current = currentTripId;
    }

    // Cleanup au démontage
    return () => {
      if (previousTripIdRef.current) {
        stopOngoingTripTracking();
        previousTripIdRef.current = null;
      }
    };
  }, [ongoingTrip]);

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

    if (pathname?.includes(`/trip/navigate/${ongoingTrip.trip.id}`)) {
      return true;
    }

    // Masquer sur la navigation passager
    if (pathname?.startsWith('/booking/navigate/')) {
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
    } else {
      translateY.value = withTiming(100, {
        duration: 300,
        easing: Easing.inOut(Easing.ease),
      });
    }
  }, [shouldHide, ongoingTrip, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
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

  const gradientColors = ['#FFFFFF', '#FFF7F2', '#FFF1E8'] as const;
  const iconName = isDriver ? 'car-sport' : 'navigate-circle';
  const roleLabel = isDriver ? 'Conducteur' : 'Passager';
  const roleAccent = isDriver ? Colors.primary : Colors.infoDark;

  const bottomPadding = getFloatingBannerBottomOffset(insets.bottom);

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: bottomPadding },
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
          <View style={styles.accentRail} />

          <View style={styles.content}>
            <View style={styles.iconWrapper}>
              <View
                style={[
                  styles.iconContainer,
                  {
                    backgroundColor: roleAccent + '14',
                    borderColor: roleAccent + '25',
                  },
                ]}
              >
                <Ionicons name={iconName} size={22} color={roleAccent} />
              </View>
            </View>

            <View style={styles.textContainer}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {isDriver ? 'Trajet en cours' : 'Vous êtes en route'}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: roleAccent + '14' }]}>
                  <Text style={[styles.statusBadgeText, { color: roleAccent }]}>
                    {roleLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.routeRow}>
                <View style={styles.routeDot} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {trip.departure.name}
                </Text>
              </View>

              <View style={styles.routeRow}>
                <Ionicons name="navigate" size={14} color={Colors.primary} style={styles.routeIcon} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {trip.arrival.name}
                </Text>
              </View>

              {trip.departureTime && (
                <View style={styles.timeRow}>
                  <Ionicons name="time-outline" size={14} color={Colors.gray[500]} style={styles.routeIcon} />
                  <Text style={styles.timeText}>
                    Départ à {formatTime(trip.departureTime)}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.chevronContainer}>
              <Ionicons name="chevron-forward" size={22} color={Colors.primary} />
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
    borderWidth: 1,
    borderColor: Colors.primary + '24',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  gradient: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  accentRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: Colors.primary,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.lg + Spacing.xs,
    paddingRight: Spacing.md,
    paddingVertical: Spacing.md,
  },
  iconWrapper: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
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
    color: Colors.gray[900],
    flexShrink: 1,
    letterSpacing: 0,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  statusBadgeText: {
    fontSize: FontSizes.xs - 1,
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  routeIcon: {
    marginRight: Spacing.xs,
  },
  routeDot: {
    width: 7,
    height: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    marginRight: Spacing.xs + 1,
  },
  routeText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[800],
    flex: 1,
    fontWeight: FontWeights.medium,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  timeText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
  },
  chevronContainer: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
});

