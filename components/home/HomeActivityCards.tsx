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
import type { useHomeRequestHighlight } from '@/hooks/home/useHomeRequestHighlight';
import { HomeRequestHighlightCard } from './HomeRequestHighlightCard';
import { SwipeableHomePriority } from './SwipeableHomePriority';
import { homePriorityKeys } from '@/features/home/homePriorityDismissal';
import type { useHomePriorityDismissals } from '@/hooks/home/useHomePriorityDismissals';

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
  & Pick<ReturnType<typeof useHomeRequestHighlight>, 'highlightedDriverRequest' | 'highlightedRequestDistance'>
  & Pick<ReturnType<typeof useHomeMapNavigation>,
    'openTripRequestDetail'
  > & Pick<ReturnType<typeof useHomePriorityDismissals>, 'dismissPriority'>
  & { prioritiesEnabled: boolean };
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
  highlightedDriverRequest,
  highlightedRequestDistance,
  dismissPriority,
  prioritiesEnabled,
}: Props) {
  const bookingKey = featuredDriverReservation ? homePriorityKeys.booking(featuredDriverReservation.booking) : '';
  const tripKey = featuredDriverUpcomingTrip ? homePriorityKeys.upcomingTrip(featuredDriverUpcomingTrip) : '';
  const nearbyKey = highlightedDriverRequest ? homePriorityKeys.nearbyRequest(highlightedDriverRequest) : '';
  const ownRequestKey = activeTripRequest ? homePriorityKeys.ownRequest(activeTripRequest) : '';
  const dismissAccessibility = (key: string) => ({
    accessibilityActions: [{ name: 'dismiss', label: 'Masquer cette priorité sur l’accueil' }],
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      if (prioritiesEnabled && event.nativeEvent.actionName === 'dismiss') dismissPriority(key);
    },
  });
  return (<>
    {featuredDriverReservation && featuredDriverReservationStatus && (
      <SwipeableHomePriority key={bookingKey} priorityKey={bookingKey} enabled={prioritiesEnabled} onDismiss={dismissPriority}>
        <TouchableOpacity
          {...dismissAccessibility(bookingKey)}
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
              <Text style={styles.reservationPlaceName}>{placeName(featuredDriverReservation.trip.departure)}</Text>
              {' vers '}
              <Text style={styles.reservationPlaceName}>{placeName(featuredDriverReservation.trip.arrival)}</Text>
            </Text>
          </View>
          <View style={styles.driverReservationAction}>
            <Text style={styles.driverReservationTime} numberOfLines={1}>
              {formatDateWithRelativeLabel(featuredDriverReservation.trip.departureTime, true)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
          </View>
        </TouchableOpacity>
      </SwipeableHomePriority>
    )}
    {featuredDriverUpcomingTrip && (
      <SwipeableHomePriority key={tripKey} priorityKey={tripKey} enabled={prioritiesEnabled} onDismiss={dismissPriority}>
        <TouchableOpacity
          {...dismissAccessibility(tripKey)}
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
              <Text style={styles.reservationPlaceName}>{placeName(featuredDriverUpcomingTrip.departure)}</Text>
              {' vers '}
              <Text style={styles.reservationPlaceName}>{placeName(featuredDriverUpcomingTrip.arrival)}</Text>
            </Text>
          </View>
          <View style={styles.driverReservationAction}>
            <Text style={styles.driverReservationTime} numberOfLines={1}>
              {formatPrice(featuredDriverUpcomingTrip.price)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
          </View>
        </TouchableOpacity>
      </SwipeableHomePriority>
    )}
    {highlightedDriverRequest && (
      <SwipeableHomePriority key={nearbyKey} priorityKey={nearbyKey} enabled={prioritiesEnabled} onDismiss={dismissPriority}>
        <HomeRequestHighlightCard
          {...dismissAccessibility(nearbyKey)}
          request={highlightedDriverRequest}
          distanceMeters={highlightedRequestDistance}
          onOpen={openTripRequestDetail}
        />
      </SwipeableHomePriority>
    )}
    {activeTripRequest && activeRequestStatus && (
      <SwipeableHomePriority key={ownRequestKey} priorityKey={ownRequestKey} enabled={prioritiesEnabled} onDismiss={dismissPriority}>
        <TouchableOpacity
          {...dismissAccessibility(ownRequestKey)}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir ma demande de trajet"
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
      </SwipeableHomePriority>
    )}
  </>);
});
