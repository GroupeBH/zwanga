import { styles } from '../features/screen-styles/components/OngoingTripBanner/index';
import { getFloatingBannerBottomOffset } from '@/constants/navigation';
import { Colors } from '@/constants/styles';
import {
  getCurrentTripInfo,
  startOngoingTripTracking,
  stopOngoingTripTracking,
} from '@/services/ongoingTripNotification';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetMyTripsQuery } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { formatDateTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from '@/utils/reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type OngoingTripBannerPosition = 'top' | 'bottom';
const routeNameEmphasis = { fontWeight: '700' as const };

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
  const { data: myTrips, isLoading: myTripsLoading } = useGetMyTripsQuery(undefined, {
    skip: !user,
    // Pas de polling : les trajets en cours changent rarement de statut
    // RTK Query invalide automatiquement le cache via les tags après startTrip, updateTrip, etc.
    refetchOnMountOrArgChange: true, // Refetch seulement au montage ou si les args changent
  });

  // Récupérer les réservations de l'utilisateur (comme passager)
  const { data: myBookings, isLoading: myBookingsLoading } = useGetMyBookingsQuery(undefined, {
    skip: !user,
    // Pas de polling : les réservations changent rarement de statut
    // RTK Query invalide automatiquement le cache via les tags après acceptBooking, updateBookingStatus, etc.
    refetchOnMountOrArgChange: true, // Refetch seulement au montage ou si les args changent
  });

  // Trouver un trajet en cours
  const ongoingTrip = useMemo(() => {
    if (!user) return null;

    // Chercher un trajet en cours comme conducteur
    const driverOngoingTrip = myTrips?.find((trip) => trip.status === 'ongoing' && trip.driverId === user.id);
    if (driverOngoingTrip) {
      return {
        trip: driverOngoingTrip,
        role: 'driver' as const,
        bookingId: null,
      };
    }

    // Chercher un trajet en cours comme passager
    const passengerOngoingBooking = myBookings?.find(
      (booking) => {
        if (booking.passengerId !== user.id) {
          return false;
        }
        if (booking.status === 'completed') {
          return false;
        }
        if (booking.status !== 'accepted') {
          return false;
        }
        if (booking.trip?.status !== 'ongoing') {
          return false;
        }
        if (booking.droppedOff === true || booking.droppedOffConfirmedByPassenger === true) {
          return false;
        }
        return true;
      }
    );
    if (passengerOngoingBooking?.trip) {
      return {
        trip: passengerOngoingBooking.trip,
        role: 'passenger' as const,
        bookingId: passengerOngoingBooking.id,
      };
    }

    return null;
  }, [myTrips, myBookings, user]);

  // Ref pour suivre le trajet précédent
  const previousTripRef = useRef(getCurrentTripInfo());

  // Démarrer/arrêter le suivi de notification permanente
  useEffect(() => {
    const currentTripId = ongoingTrip?.trip?.id ?? null;

    if (!ongoingTrip && (myTripsLoading || myBookingsLoading)) {
      return;
    }
    
    // Si le trajet a changé
    if (currentTripId !== (previousTripRef.current?.tripId ?? null) ||
        ongoingTrip?.role !== previousTripRef.current?.role ||
        (ongoingTrip?.bookingId ?? null) !== (previousTripRef.current?.bookingId ?? null)) {
      // Arrêter le suivi précédent si nécessaire
      if (previousTripRef.current) {
        stopOngoingTripTracking();
      }
      
      // Démarrer le nouveau suivi si un trajet est en cours
      const nextTripInfo = ongoingTrip?.trip ? {
        tripId: ongoingTrip.trip.id,
        departure: ongoingTrip.trip.departure?.name ?? ongoingTrip.trip.departure?.address ?? 'Départ',
        arrival: ongoingTrip.trip.arrival?.name ?? ongoingTrip.trip.arrival?.address ?? 'Arrivée',
        role: ongoingTrip.role,
        ...(ongoingTrip.bookingId ? { bookingId: ongoingTrip.bookingId } : {}),
        departureTime: ongoingTrip.trip.departureTime,
      } : null;
      if (nextTripInfo) startOngoingTripTracking(nextTripInfo);
      
      previousTripRef.current = nextTripInfo;
    }
  }, [myBookingsLoading, myTripsLoading, ongoingTrip]);

  // Ne pas afficher sur certaines pages
  const shouldHide = useMemo(() => {
    const ongoingTripId = ongoingTrip?.trip?.id;
    if (!ongoingTripId) return true;

    if (pathname?.startsWith('/auth') || pathname?.startsWith('/splash') || pathname?.startsWith('/onboarding')) {
      return true;
    }

    if (pathname?.includes(`/trip/${ongoingTripId}`)) {
      return true;
    }

    if (pathname?.includes(`/trip/manage/${ongoingTripId}`)) {
      return true;
    }

    if (pathname?.includes(`/trip/navigate/${ongoingTripId}`)) {
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

  const { trip, role, bookingId } = ongoingTrip;
  const isDriver = role === 'driver';

  const handlePress = () => {
    if (isDriver) {
      router.push(`/trip/navigate/${trip.id}`);
      return;
    }

    if (bookingId) {
      router.push(`/booking/navigate/${bookingId}`);
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
        accessibilityRole="button"
        accessibilityLabel={isDriver ? 'Reprendre la navigation conducteur' : 'Reprendre ma navigation passager'}
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
                <Text style={[styles.routeText, routeNameEmphasis]} numberOfLines={1}>
                  {trip.departure.name}
                </Text>
              </View>

              <View style={styles.routeRow}>
                <Ionicons name="navigate" size={14} color={Colors.primary} style={styles.routeIcon} />
                <Text style={[styles.routeText, routeNameEmphasis]} numberOfLines={1}>
                  {trip.arrival.name}
                </Text>
              </View>

              {trip.departureTime && (
                <View style={styles.timeRow}>
                  <Ionicons name="time-outline" size={14} color={Colors.gray[500]} style={styles.routeIcon} />
                  <Text style={styles.timeText}>
                    Départ {formatDateTime(trip.departureTime)}
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
