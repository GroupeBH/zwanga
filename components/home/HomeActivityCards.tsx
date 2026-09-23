import { formatPrice, placeName } from '@/features/home/homeModel';
import { homeDepartureLabel, homePriceLabel, homeRequestDepartureLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import { homePriorityKeys } from '@/features/home/homePriorityDismissal';
import React from 'react';
import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';
import type { useHomePassengerActivity } from '@/hooks/home/useHomePassengerActivity';
import type { useHomeTripSelection } from '@/hooks/home/useHomeTripSelection';
import type { useHomeRequestHighlight } from '@/hooks/home/useHomeRequestHighlight';
import type { useHomePriorityDismissals } from '@/hooks/home/useHomePriorityDismissals';
import { CompactTripCard } from '@/components/trip/CompactTripCard';
import { HomeRequestHighlightCard } from './HomeRequestHighlightCard';
import { SwipeableHomePriority } from './SwipeableHomePriority';

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
  featuredDriverReservation, featuredDriverReservationStatus, router,
  featuredDriverReservationPassengerName, featuredDriverReservationSeatsLabel,
  featuredDriverUpcomingTrip, featuredDriverUpcomingTripSeatsLabel,
  activeTripRequest, activeRequestStatus, openTripRequestDetail,
  highlightedDriverRequest, highlightedRequestDistance, dismissPriority, prioritiesEnabled,
}: Props) {
  const bookingKey = featuredDriverReservation ? homePriorityKeys.booking(featuredDriverReservation.booking) : '';
  const tripKey = featuredDriverUpcomingTrip ? homePriorityKeys.upcomingTrip(featuredDriverUpcomingTrip) : '';
  const nearbyKey = highlightedDriverRequest ? homePriorityKeys.nearbyRequest(highlightedDriverRequest) : '';
  const ownRequestKey = activeTripRequest ? homePriorityKeys.ownRequest(activeTripRequest) : '';
  const ownBudget = Number(activeTripRequest?.maxPricePerSeat);
  const hasOwnBudget = Number.isFinite(ownBudget) && ownBudget > 0;
  const dismissAccessibility = (key: string) => ({
    accessibilityActions: [{ name: 'dismiss', label: 'Masquer cette priorité sur l’accueil' }],
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      if (prioritiesEnabled && event.nativeEvent.actionName === 'dismiss') dismissPriority(key);
    },
  });

  return (<>
    {featuredDriverReservation && featuredDriverReservationStatus && (
      <SwipeableHomePriority key={bookingKey} priorityKey={bookingKey} enabled={prioritiesEnabled} onDismiss={dismissPriority}>
        <CompactTripCard
          {...dismissAccessibility(bookingKey)}
          inlineRoute
          priorityAppearance="reservation"
          label={featuredDriverReservationStatus.label}
          departure={placeName(featuredDriverReservation.trip.departure)}
          arrival={placeName(featuredDriverReservation.trip.arrival)}
          metadata={`${homeDepartureLabel(featuredDriverReservation.trip.departureTime)} · ${featuredDriverReservationSeatsLabel} · ${featuredDriverReservationPassengerName}`}
          accessibilityLabel="Ouvrir la réservation reçue"
          onPress={() => router.push(`/trip/manage/${featuredDriverReservation.trip.id}`)}
        />
      </SwipeableHomePriority>
    )}
    {featuredDriverUpcomingTrip && (
      <SwipeableHomePriority key={tripKey} priorityKey={tripKey} enabled={prioritiesEnabled} onDismiss={dismissPriority}>
        <CompactTripCard
          {...dismissAccessibility(tripKey)}
          inlineRoute
          priorityAppearance="upcoming"
          label="Trajet bientôt"
          departure={placeName(featuredDriverUpcomingTrip.departure)}
          arrival={placeName(featuredDriverUpcomingTrip.arrival)}
          priceText={homePriceLabel(featuredDriverUpcomingTrip.price)}
          priceHint={featuredDriverUpcomingTrip.price > 0 ? '/ place' : undefined}
          metadata={`${homeDepartureLabel(featuredDriverUpcomingTrip.departureTime)} · ${featuredDriverUpcomingTripSeatsLabel}`}
          accessibilityLabel="Ouvrir le trajet publié qui démarre bientôt"
          onPress={() => router.push(`/trip/manage/${featuredDriverUpcomingTrip.id}`)}
        />
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
        <CompactTripCard
          {...dismissAccessibility(ownRequestKey)}
          inlineRoute
          label={activeRequestStatus.label}
          departure={placeName(activeTripRequest.departure)}
          arrival={placeName(activeTripRequest.arrival)}
          priceText={hasOwnBudget ? formatPrice(ownBudget) : undefined}
          priceHint={hasOwnBudget ? 'max / place' : undefined}
          metadata={`${homeRequestDepartureLabel(activeTripRequest.departureDateMin, activeTripRequest.departureDateMax)} · ${homeSeatsLabel(activeTripRequest.numberOfSeats)}`}
          accessibilityLabel="Ouvrir ma demande de trajet"
          onPress={() => openTripRequestDetail(activeTripRequest.id)}
        />
      </SwipeableHomePriority>
    )}
  </>);
});
