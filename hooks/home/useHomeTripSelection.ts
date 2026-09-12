import { DRIVER_UPCOMING_TRIP_HIGHLIGHT_WINDOW_MS, getBookingStatusMeta, hasUpcomingDeparture, RECENT_TRIPS_LIMIT } from '@/features/home/homeModel';
import type { FeaturedDriverReservation } from '@/features/home/homeTypes';
import type { Trip } from '@/types';
import { useMemo } from 'react';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeDriverActivity } from '@/hooks/home/useHomeDriverActivity';
import type { useHomePassengerActivity } from '@/hooks/home/useHomePassengerActivity';
import type { useHomeTripFeed } from '@/hooks/home/useHomeTripFeed';
type Props =
  Pick<ReturnType<typeof useHomeTripFeed>,
    'remoteTrips'
  >
  & Pick<ReturnType<typeof useHomeContext>,
    'storedTrips'
    | 'currentUser'
    | 'trackedTripInfo'
    | 'isDriver'
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
  >;
export function useHomeTripSelection({
  remoteTrips,
  storedTrips,
  activeBookings,
  currentUser,
  completedBookingTripIds,
  bookedTripIds,
  refreshedPassengerTrip,
  trackedTripInfo,
  ongoingDriverTrip,
  isDriver,
  driverReservationHighlightTrip,
  driverReservationHighlightBookings,
  myDriverTrips,
}: Props) {
  const latestTrips = useMemo(() => {
    const tripsById = new Map<string, Trip>();
    (remoteTrips ?? storedTrips ?? []).forEach((trip) => tripsById.set(trip.id, trip));
    activeBookings.forEach((booking) => {
      if (booking.trip && !tripsById.has(booking.trip.id)) {
        tripsById.set(booking.trip.id, booking.trip);
      }
    });

    const baseTrips = Array.from(tripsById.values());
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartTs = todayStart.getTime();
    const tomorrowStartTs = todayStartTs + 24 * 60 * 60 * 1000;

    return [...baseTrips]
      .filter((trip) => {
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
      })
      .sort((a, b) => {
        const aIsBooked = bookedTripIds.has(a.id);
        const bIsBooked = bookedTripIds.has(b.id);

        if (aIsBooked !== bIsBooked) {
          return aIsBooked ? -1 : 1;
        }

        const departureA = new Date(a.departureTime).getTime();
        const departureB = new Date(b.departureTime).getTime();
        const safeDepartureA = Number.isFinite(departureA) ? departureA : Number.MAX_SAFE_INTEGER;
        const safeDepartureB = Number.isFinite(departureB) ? departureB : Number.MAX_SAFE_INTEGER;
        const aIsToday = safeDepartureA >= todayStartTs && safeDepartureA < tomorrowStartTs;
        const bIsToday = safeDepartureB >= todayStartTs && safeDepartureB < tomorrowStartTs;

        if (aIsToday !== bIsToday) {
          return aIsToday ? -1 : 1;
        }

        if (safeDepartureA !== safeDepartureB) {
          return safeDepartureA - safeDepartureB;
        }

        return a.id.localeCompare(b.id);
      })
      .slice(0, RECENT_TRIPS_LIMIT);
  }, [
    remoteTrips,
    storedTrips,
    activeBookings,
    bookedTripIds,
    currentUser?.id,
    completedBookingTripIds,
  ]);

  const ongoingBookedTrip = useMemo(() => {
    const ongoingBookingTripIds = new Set(
      activeBookings
        .filter(
          (booking) =>
            booking.status === 'accepted' &&
            booking.tripId &&
            !booking.droppedOff &&
            !booking.droppedOffConfirmedByPassenger,
        )
        .map((booking) => booking.tripId),
    );

    if (ongoingBookingTripIds.size === 0) {
      return refreshedPassengerTrip?.status === 'ongoing' && trackedTripInfo?.role === 'passenger'
        ? refreshedPassengerTrip
        : null;
    }

    if (refreshedPassengerTrip) {
      return refreshedPassengerTrip.status === 'ongoing' &&
        ongoingBookingTripIds.has(refreshedPassengerTrip.id)
        ? refreshedPassengerTrip
        : null;
    }

    return latestTrips.find((trip) => trip.status === 'ongoing' && ongoingBookingTripIds.has(trip.id)) ?? null;
  }, [activeBookings, latestTrips, refreshedPassengerTrip, trackedTripInfo?.role]);

  const activeHomeTrip = ongoingDriverTrip ?? ongoingBookedTrip;

  const featuredDriverReservation = useMemo<FeaturedDriverReservation | null>(() => {
    if (!isDriver || activeHomeTrip || !driverReservationHighlightTrip) {
      return null;
    }

    const visibleBookings = [...driverReservationHighlightBookings]
      .filter(
        (booking) =>
          booking.tripId === driverReservationHighlightTrip.id &&
          booking.status === 'pending' &&
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
  }, [activeHomeTrip, driverReservationHighlightBookings, driverReservationHighlightTrip, isDriver]);

  const featuredDriverUpcomingTrip = useMemo(() => {
    if (!isDriver || !currentUser?.id || activeHomeTrip || featuredDriverReservation) {
      return null;
    }

    const now = Date.now();
    const highlightUntil = now + DRIVER_UPCOMING_TRIP_HIGHLIGHT_WINDOW_MS;

    return [...myDriverTrips]
      .filter((trip) => {
        if (trip.driverId !== currentUser.id || trip.status !== 'upcoming' || !hasUpcomingDeparture(trip)) {
          return false;
        }

        const departureTs = new Date(trip.departureTime).getTime();
        return Number.isFinite(departureTs) && departureTs >= now && departureTs <= highlightUntil;
      })
      .sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime())[0] ?? null;
  }, [activeHomeTrip, currentUser?.id, featuredDriverReservation, isDriver, myDriverTrips]);

  const isRestoringTrackedTrip = Boolean(trackedTripInfo?.tripId && !activeHomeTrip);

  const homeMapTrips = useMemo(
    () => (activeHomeTrip ? [activeHomeTrip] : isRestoringTrackedTrip ? [] : latestTrips),
    [activeHomeTrip, isRestoringTrackedTrip, latestTrips],
  );

  const isHomeSheetLockedRetracted = Boolean(activeHomeTrip || isRestoringTrackedTrip);

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
