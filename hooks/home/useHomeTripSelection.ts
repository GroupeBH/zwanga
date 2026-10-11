import { getBookingStatusMeta, hasUpcomingDeparture, RECENT_TRIPS_LIMIT } from '@/features/home/homeModel';
import type { FeaturedDriverReservation } from '@/features/home/homeTypes';
import { getHomeTripSuggestionTier, HOME_GENERAL_SUGGESTION_TIER, rankHomeTripsByProximity } from '@/features/home/homeTripPriority';
import { isActivePassengerBooking, ownsTrip } from '@/features/activity/tripParticipation';
import { rankDriverUpcomingTrips } from '@/features/home/homeDriverTripPriority';
import { normalizeTripMapCoordinate, type MapCoordinate } from '@/utils/tripCoordinates';
import type { Trip } from '@/types';
import { useMemo } from 'react';
import { EMPTY_HIDDEN_HOME_PRIORITIES, homePriorityKeys, type HiddenHomePriorities } from '@/features/home/homePriorityDismissal';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeDriverActivity } from '@/hooks/home/useHomeDriverActivity';
import type { useHomePassengerActivity } from '@/hooks/home/useHomePassengerActivity';
import type { useHomeTripFeed } from '@/hooks/home/useHomeTripFeed';
type Props =
  Pick<ReturnType<typeof useHomeTripFeed>,
    'remoteTrips'
    | 'discoveryUpdatedAt'
  >
  & Pick<ReturnType<typeof useHomeContext>,
    'storedTrips'
    | 'currentUser'
    | 'isDriver'
    | 'isScreenActive'
  >
  & Pick<ReturnType<typeof useHomePassengerActivity>,
    'activeBookings'
    | 'completedBookingTripIds'
    | 'bookedTripIds'
    | 'refreshedPassengerTrip'
  >
  & Pick<ReturnType<typeof useHomeDriverActivity>,
    'ongoingDriverTrip'
    | 'driverReservationHighlightTrip'
    | 'driverReservationHighlightBookings'
    | 'myDriverTrips'
  > & { liveUserCoordinate?: MapCoordinate | null; hiddenHomePriorities?: HiddenHomePriorities };
export function useHomeTripSelection({
  remoteTrips,
  discoveryUpdatedAt,
  storedTrips,
  activeBookings,
  currentUser,
  completedBookingTripIds,
  bookedTripIds,
  refreshedPassengerTrip,
  ongoingDriverTrip,
  isDriver,
  isScreenActive,
  driverReservationHighlightTrip,
  driverReservationHighlightBookings,
  myDriverTrips,
  liveUserCoordinate = null,
  hiddenHomePriorities = EMPTY_HIDDEN_HOME_PRIORITIES,
}: Props) {
  const coordinate = normalizeTripMapCoordinate(liveUserCoordinate?.latitude, liveUserCoordinate?.longitude);
  const latitude = coordinate?.latitude;
  const longitude = coordinate?.longitude;
  const hasTripLocation = Boolean(coordinate);
  const latestTrips = useMemo(() => {
    const tripsById = new Map<string, Trip>();
    (remoteTrips ?? storedTrips ?? []).forEach((trip) => tripsById.set(trip.id, trip));
    activeBookings.forEach((booking) => {
      if (booking.trip && !tripsById.has(booking.trip.id)) {
        tripsById.set(booking.trip.id, booking.trip);
      }
    });

    const baseTrips = Array.from(tripsById.values());
    const eligibleTrips = baseTrips.filter((trip) => {
      if (trip.status !== 'upcoming' && trip.status !== 'ongoing') return false;
      if (!hasUpcomingDeparture(trip)) {
        return false;
      }

      if (!currentUser?.id) {
        return true;
      }

      if (trip.driverId === currentUser.id) {
        return false;
      }

      return !completedBookingTripIds.has(trip.id);
    });
    const origin = latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null;
    return rankHomeTripsByProximity(eligibleTrips, origin, bookedTripIds, Date.now(), true).slice(0, RECENT_TRIPS_LIMIT);
    // Freshness signals intentionally invalidate the clock-based filter even for unchanged records.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    remoteTrips,
    storedTrips,
    activeBookings,
    bookedTripIds,
    currentUser?.id,
    completedBookingTripIds,
    latitude,
    longitude,
    // Re-evaluate the 24-hour window on existing refreshes/foreground, even if
    // RTK Query reuses identical records. No additional timer or network poll.
    discoveryUpdatedAt,
    isScreenActive,
  ]);

  const ongoingBookedTrip = useMemo(() => {
    const ongoingBookingTripIds = new Set(
      activeBookings
        .filter(
          (booking) =>
            isActivePassengerBooking(booking, currentUser?.id),
        )
        .map((booking) => booking.tripId),
    );

    if (ongoingBookingTripIds.size === 0) {
      return null;
    }

    if (refreshedPassengerTrip && ongoingBookingTripIds.has(refreshedPassengerTrip.id)) {
      return refreshedPassengerTrip.status === 'ongoing' ? refreshedPassengerTrip : null;
    }

    // Participation must not depend on the ten suggestions selected for the map.
    return activeBookings.find(booking => ongoingBookingTripIds.has(booking.tripId)
      && booking.trip?.status === 'ongoing')?.trip
      ?? (remoteTrips ?? storedTrips ?? []).find(trip => trip.status === 'ongoing'
        && ongoingBookingTripIds.has(trip.id)) ?? null;
  }, [activeBookings, currentUser?.id, refreshedPassengerTrip, remoteTrips, storedTrips]);

  const activeHomeTrip = ongoingDriverTrip ?? ongoingBookedTrip;
  const suggestion = latestTrips.find(trip => !bookedTripIds.has(trip.id));
  const suggestionTier = suggestion ? getHomeTripSuggestionTier(suggestion, coordinate) : -1;
  const suggestionScopeLabel = suggestionTier === HOME_GENERAL_SUGGESTION_TIER ? 'Autres trajets disponibles'
    : suggestionTier > 0
      ? suggestionTier === 1 ? 'Autres départs · moins de 10 km, sous 48 h' : 'Autres départs · moins de 25 km, sous 7 jours'
      : null;

  const featuredDriverReservation = useMemo<FeaturedDriverReservation | null>(() => {
    if (!isDriver || activeHomeTrip || !driverReservationHighlightTrip
      || !ownsTrip(driverReservationHighlightTrip, currentUser?.id)
      || driverReservationHighlightTrip.status !== 'upcoming' || driverReservationHighlightTrip.startedAt) {
      return null;
    }

    const visibleBookings = [...driverReservationHighlightBookings]
      .filter(
        (booking) =>
          booking.tripId === driverReservationHighlightTrip.id &&
          booking.status === 'pending' &&
          !hiddenHomePriorities[homePriorityKeys.booking(booking)] &&
          !booking.droppedOff,
      )
      .sort((a, b) => {
        const updatedA = new Date(a.updatedAt || a.createdAt).getTime();
        const updatedB = new Date(b.updatedAt || b.createdAt).getTime();
        const safeUpdatedA = Number.isFinite(updatedA) ? updatedA : 0;
        const safeUpdatedB = Number.isFinite(updatedB) ? updatedB : 0;
        return safeUpdatedB - safeUpdatedA;
      });

    if (visibleBookings[0]) {
      return { booking: visibleBookings[0], trip: driverReservationHighlightTrip };
    }

    return null;
  }, [activeHomeTrip, currentUser?.id, driverReservationHighlightBookings, driverReservationHighlightTrip, isDriver, hiddenHomePriorities]);

  const featuredDriverUpcomingTrip = useMemo(() => {
    if (!isDriver || !currentUser?.id || activeHomeTrip || featuredDriverReservation) {
      return null;
    }

    const visibleTrips = myDriverTrips.filter(trip => !hiddenHomePriorities[homePriorityKeys.upcomingTrip(trip)]);
    return rankDriverUpcomingTrips(visibleTrips, currentUser.id, hiddenHomePriorities)[0] ?? null;
  }, [activeHomeTrip, currentUser?.id, featuredDriverReservation, isDriver, myDriverTrips, hiddenHomePriorities]);

  const homeMapTrips = useMemo(
    () => (activeHomeTrip ? [activeHomeTrip] : latestTrips),
    [activeHomeTrip, latestTrips],
  );

  // A notification hint can outlive the ride; it must never lock the Home interface.
  const isHomeSheetLockedRetracted = Boolean(activeHomeTrip);

  const featuredDriverReservationStatus = featuredDriverReservation?.booking
    ? getBookingStatusMeta(featuredDriverReservation.booking.status)
    : null;

  const featuredDriverReservationPassengerName =
    featuredDriverReservation?.booking?.passengerName ?? 'Passager Zwanga';

  const featuredDriverReservationSeatCount = featuredDriverReservation?.booking?.numberOfSeats ?? 1;

  const featuredDriverReservationSeatsLabel = `${featuredDriverReservationSeatCount} place${featuredDriverReservationSeatCount > 1 ? 's' : ''}`;

  const featuredDriverUpcomingTripSeatsLabel = featuredDriverUpcomingTrip
    ? `${featuredDriverUpcomingTrip.availableSeats} place${featuredDriverUpcomingTrip.availableSeats > 1 ? 's' : ''} libre${featuredDriverUpcomingTrip.availableSeats > 1 ? 's' : ''}`
    : '';
  return {
    hasTripLocation,
    suggestionScopeLabel,
    activeHomeTrip,
    homeMapTrips,
    isHomeSheetLockedRetracted,
    latestTrips,
    featuredDriverReservation,
    featuredDriverReservationStatus,
    featuredDriverReservationPassengerName,
    featuredDriverReservationSeatsLabel,
    featuredDriverUpcomingTrip,
    featuredDriverUpcomingTripSeatsLabel,
    ongoingBookedTrip,
  };
}
