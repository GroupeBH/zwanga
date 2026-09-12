import { Colors } from '@/constants/styles';
import { formatPrice, HOME_COLORS, placeName } from '@/features/home/homeModel';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';
import type { useHomePassengerActivity } from '@/hooks/home/useHomePassengerActivity';
import type { useHomeTripSelection } from '@/hooks/home/useHomeTripSelection';

import { styles } from '@/features/home/HomeActivityCards.styles';
type Props =
  Pick<ReturnType<typeof useHomeTripSelection>,
    'featuredDriverReservation'
    | 'featuredDriverReservationStatus'
    | 'featuredDriverReservationPassengerName'
    | 'featuredDriverReservationSeatsLabel'
    | 'featuredDriverUpcomingTrip'
    | 'featuredDriverUpcomingTripSeatsLabel'
  >
  & Pick<ReturnType<typeof useHomeContext>,
    'router'
  >
  & Pick<ReturnType<typeof useHomePassengerActivity>,
    'activeTripRequest'
    | 'activeRequestStatus'
  >
  & Pick<ReturnType<typeof useHomeMapNavigation>,
    'openTripRequestDetail'
  >;
export const HomeActivityCards = React.memo(function HomeActivityCards({
  featuredDriverReservation,
  featuredDriverReservationStatus,
  router,
  featuredDriverReservationPassengerName,
  featuredDriverReservationSeatsLabel,
  featuredDriverUpcomingTrip,
  featuredDriverUpcomingTripSeatsLabel,
  activeTripRequest,
  activeRequestStatus,
  openTripRequestDetail,
}: Props) {
  return (<>
    {featuredDriverReservation && featuredDriverReservationStatus && (
      <TouchableOpacity
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir la réservation reçue"
        style={styles.driverReservationCard}
        onPress={() => router.push(`/trip/manage/${featuredDriverReservation.trip.id}`)}
      >
        <View style={[styles.driverReservationIcon, { backgroundColor: featuredDriverReservationStatus.bg }]}>
          <Ionicons
            name={featuredDriverReservationStatus.icon}
            size={17}
            color={featuredDriverReservationStatus.color}
          />
        </View>
        <View style={styles.driverReservationText}>
          <Text
            style={[styles.driverReservationLabel, { color: featuredDriverReservationStatus.color }]}
            numberOfLines={1}
          >
            {featuredDriverReservationStatus.label}
          </Text>
          <Text style={styles.driverReservationPassenger} numberOfLines={1}>
            {featuredDriverReservationPassengerName} · {featuredDriverReservationSeatsLabel}
          </Text>
          <Text style={styles.driverReservationRoute} numberOfLines={1}>
            {placeName(featuredDriverReservation.trip.departure)} vers {placeName(featuredDriverReservation.trip.arrival)}
          </Text>
        </View>
        <View style={styles.driverReservationAction}>
          <Text style={styles.driverReservationTime} numberOfLines={1}>
            {formatDateWithRelativeLabel(featuredDriverReservation.trip.departureTime, true)}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
        </View>
      </TouchableOpacity>
    )}
    {featuredDriverUpcomingTrip && (
      <TouchableOpacity
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir le trajet publié qui démarre bientôt"
        style={[styles.driverReservationCard, styles.driverUpcomingTripCard]}
        onPress={() => router.push(`/trip/manage/${featuredDriverUpcomingTrip.id}`)}
      >
        <View style={[styles.driverReservationIcon, styles.driverUpcomingTripIcon]}>
          <Ionicons name="time-outline" size={17} color={HOME_COLORS.navy} />
        </View>
        <View style={styles.driverReservationText}>
          <Text
            style={[styles.driverReservationLabel, styles.driverUpcomingTripLabel]}
            numberOfLines={1}
          >
            Trajet bientôt
          </Text>
          <Text style={styles.driverReservationPassenger} numberOfLines={1}>
            {formatDateWithRelativeLabel(featuredDriverUpcomingTrip.departureTime, true)} · {featuredDriverUpcomingTripSeatsLabel}
          </Text>
          <Text style={styles.driverReservationRoute} numberOfLines={1}>
            {placeName(featuredDriverUpcomingTrip.departure)} vers {placeName(featuredDriverUpcomingTrip.arrival)}
          </Text>
        </View>
        <View style={styles.driverReservationAction}>
          <Text style={styles.driverReservationTime} numberOfLines={1}>
            {formatPrice(featuredDriverUpcomingTrip.price)}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
        </View>
      </TouchableOpacity>
    )}
    {activeTripRequest && activeRequestStatus && (
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.activeRequestCard}
        onPress={() => openTripRequestDetail(activeTripRequest.id)}
      >
        <View style={styles.activeRequestIcon}>
          <Ionicons name={activeRequestStatus.icon} size={17} color={Colors.primary} />
        </View>
        <View style={styles.activeRequestText}>
          <Text style={styles.activeRequestLabel}>{activeRequestStatus.label}</Text>
          <Text style={styles.activeRequestRoute} numberOfLines={1}>
            {activeTripRequest.departure.name} vers {activeTripRequest.arrival.name}
          </Text>
        </View>
        <Text style={styles.activeRequestTime}>
          {formatDateWithRelativeLabel(activeTripRequest.departureDateMin, true)}
        </Text>
      </TouchableOpacity>
    )}
  </>);
});
