import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetMyTripsQuery } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { formatTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type OngoingTripBannerPosition = 'top' | 'bottom';

interface OngoingTripBannerProps {
  position?: OngoingTripBannerPosition;
}

export function OngoingTripBanner({ position = 'top' }: OngoingTripBannerProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAppSelector(selectUser);
  const insets = useSafeAreaInsets();

  // Récupérer les trajets de l'utilisateur (comme conducteur)
  // Rafraîchir périodiquement pour détecter les changements de statut
  const { data: myTrips } = useGetMyTripsQuery(undefined, { 
    skip: !user,
    pollingInterval: 10000, // Rafraîchir toutes les 10 secondes
  });
  
  // Récupérer les réservations de l'utilisateur (comme passager)
  // Rafraîchir périodiquement pour détecter les changements de statut (comme completed)
  const { data: myBookings } = useGetMyBookingsQuery(undefined, { 
    skip: !user,
    pollingInterval: 10000, // Rafraîchir toutes les 10 secondes
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

    // Chercher un trajet en cours comme passager (réservation acceptée, trajet en cours, et passager pas encore déposé)
    // Exclure explicitement les bookings complétés car cela signifie que le passager a été déposé
    const passengerOngoingBooking = myBookings?.find(
      (booking) => {
        // Exclure explicitement les bookings complétés (le passager a été déposé)
        if (booking.status === 'completed') {
          return false;
        }
        // Le booking doit être accepté (pas rejeté, annulé, etc.)
        if (booking.status !== 'accepted') {
          return false;
        }
        // Le trajet doit être en cours
        if (booking.trip?.status !== 'ongoing') {
          return false;
        }
        // Le passager ne doit pas avoir été déposé
        // Si droppedOffConfirmedByPassenger est true, le booking est complété (status devient 'completed')
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

  // Déterminer la position automatiquement selon le pathname si non spécifiée
  const finalPosition = useMemo(() => {
    if (position) return position;
    
    // Par défaut, en haut sauf pour certaines pages où on peut le mettre en bas
    // Par exemple, sur la page d'accueil ou de recherche, on peut le mettre en bas
    if (pathname === '/' || pathname?.startsWith('/search') || pathname?.startsWith('/(tabs)')) {
      return 'bottom';
    }
    
    return 'top';
  }, [position, pathname]);

  // Ne pas afficher sur certaines pages
  const shouldHide = useMemo(() => {
    if (!ongoingTrip) return true;
    
    // Cacher sur les pages d'authentification
    if (pathname?.startsWith('/auth') || pathname?.startsWith('/splash') || pathname?.startsWith('/onboarding')) {
      return true;
    }
    
    // Cacher sur la page de détails du trajet en cours (pour éviter la redondance)
    if (pathname?.includes(`/trip/${ongoingTrip.trip.id}`)) {
      return true;
    }
    
    // Cacher sur la page de gestion du trajet en cours (pour éviter la redondance)
    if (pathname?.includes(`/trip/manage/${ongoingTrip.trip.id}`)) {
      return true;
    }
    
    return false;
  }, [pathname, ongoingTrip]);

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

  const containerStyle = useMemo(() => {
    if (finalPosition === 'bottom') {
      return [
        styles.container,
        styles.containerBottom,
        { paddingBottom: insets.bottom },
      ];
    }
    return [
      styles.container,
      styles.containerTop,
      { paddingTop: insets.top },
    ];
  }, [finalPosition, insets.top, insets.bottom]);

  const bannerStyle = useMemo(() => {
    if (finalPosition === 'bottom') {
      return [styles.banner, styles.bannerBottom];
    }
    return [styles.banner, styles.bannerTop];
  }, [finalPosition]);

  return (
    <View style={containerStyle}>
      <TouchableOpacity
        style={bannerStyle}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="car-sport" size={20} color={Colors.white} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>
              {isDriver ? 'Trajet en cours' : 'Vous êtes dans un trajet'}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {trip.departure.name} → {trip.arrival.name}
            </Text>
            {trip.departureTime && (
              <Text style={styles.time}>
                {formatTime(trip.departureTime)}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.white} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  containerTop: {
    top: 0,
  },
  containerBottom: {
    bottom: 0,
  },
  banner: {
    backgroundColor: Colors.primary,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  bannerTop: {
    marginTop: Spacing.sm,
  },
  bannerBottom: {
    marginBottom: Spacing.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  textContainer: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.white,
    opacity: 0.9,
    marginBottom: 2,
  },
  time: {
    fontSize: FontSizes.xs,
    color: Colors.white,
    opacity: 0.8,
  },
});

