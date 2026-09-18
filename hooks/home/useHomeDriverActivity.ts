import { EMPTY_HOME_BOOKINGS, EMPTY_HOME_TRIPS, hasUpcomingDeparture, HOME_ACTIVE_BOOKINGS_POLL_MS, HOME_ACTIVE_TRIP_POLL_MS, HOME_ACTIVITY_POLL_MS } from '@/features/home/homeModel';
import { useGetTripBookingsQuery } from '@/store/api/bookingApi';
import {
  useGetMyActivityTripsQuery as useGetMyTripsQuery,
  useGetTripByIdQuery
} from '@/store/api/tripApi';
import type { Trip } from '@/types';
import { useMemo } from 'react';
import { EMPTY_HIDDEN_HOME_PRIORITIES, homePriorityKeys, type HiddenHomePriorities } from '@/features/home/homePriorityDismissal';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
type Props = Pick<ReturnType<typeof useHomeContext>, 'isDriver' | 'isFocused' | 'currentUser' | 'trackedTripInfo'> & { hiddenHomePriorities?: HiddenHomePriorities };
export function useHomeDriverActivity({ isDriver, isFocused, currentUser, trackedTripInfo, hiddenHomePriorities = EMPTY_HIDDEN_HOME_PRIORITIES }: Props) {
  const { data: myDriverTrips = EMPTY_HOME_TRIPS } = useGetMyTripsQuery(undefined, {
    skip: !isDriver,
    pollingInterval: isFocused ? HOME_ACTIVITY_POLL_MS : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: false,
  });

  const listedOngoingDriverTrip = useMemo(
    () =>
      myDriverTrips.find(
        (trip) => trip.status === 'ongoing' && (!currentUser?.id || trip.driverId === currentUser.id),
      ) ?? null,
    [currentUser?.id, myDriverTrips],
  );

  const driverTripLookupId =
    (trackedTripInfo?.role === 'driver' ? trackedTripInfo.tripId : null) ??
    listedOngoingDriverTrip?.id ??
    '';

  const { data: refreshedDriverTrip } = useGetTripByIdQuery(driverTripLookupId, {
    skip: !isDriver || !driverTripLookupId,
    pollingInterval: isFocused ? HOME_ACTIVE_TRIP_POLL_MS : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: false,
  });

  const ongoingDriverTrip = useMemo(() => {
    if (refreshedDriverTrip) {
      return refreshedDriverTrip.status === 'ongoing' ? refreshedDriverTrip : null;
    }

    return listedOngoingDriverTrip;
  }, [listedOngoingDriverTrip, refreshedDriverTrip]);

  const {
    data: ongoingDriverBookings = EMPTY_HOME_BOOKINGS,
    refetch: refetchOngoingDriverBookings,
  } = useGetTripBookingsQuery(ongoingDriverTrip?.id ?? '', {
    skip: !ongoingDriverTrip?.id,
    pollingInterval: isFocused && ongoingDriverTrip ? HOME_ACTIVE_BOOKINGS_POLL_MS : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: false,
  });

  const driverReservationHighlightTrip = useMemo(() => {
    if (!isDriver || !currentUser?.id || ongoingDriverTrip) {
      return null;
    }

    const getDepartureTime = (trip: Trip) => {
      const timestamp = new Date(trip.departureTime).getTime();
      return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
    };

    return [...myDriverTrips]
      .filter(trip => {
        const pending = trip.passengers?.filter(passenger => passenger.bookingStatus === 'pending') ?? [];
        return !pending.length || pending.some(passenger => !passenger.bookingId ||
          !hiddenHomePriorities[homePriorityKeys.booking({ id: passenger.bookingId })]);
      })
      .filter(
        (trip) =>
          trip.driverId === currentUser.id &&
          (trip.status === 'upcoming' || trip.status === 'ongoing') &&
          hasUpcomingDeparture(trip),
      )
      .sort((a, b) => {
        const pendingPassengerCountA =
          a.passengers?.filter((passenger) => passenger.bookingStatus === 'pending').length ?? 0;
        const pendingPassengerCountB =
          b.passengers?.filter((passenger) => passenger.bookingStatus === 'pending').length ?? 0;
        const passengerCountA = a.passengers?.length ?? 0;
        const passengerCountB = b.passengers?.length ?? 0;
        const hasPassengersA = passengerCountA > 0;
        const hasPassengersB = passengerCountB > 0;

        if (pendingPassengerCountA !== pendingPassengerCountB) {
          return pendingPassengerCountB - pendingPassengerCountA;
        }

        if (hasPassengersA !== hasPassengersB) {
          return hasPassengersA ? -1 : 1;
        }

        if (passengerCountA !== passengerCountB) {
          return passengerCountB - passengerCountA;
        }

        return getDepartureTime(a) - getDepartureTime(b);
      })[0] ?? null;
  }, [currentUser?.id, isDriver, myDriverTrips, ongoingDriverTrip, hiddenHomePriorities]);

  const { data: driverReservationHighlightBookings = EMPTY_HOME_BOOKINGS } = useGetTripBookingsQuery(
    driverReservationHighlightTrip?.id ?? '',
    {
      skip: !isFocused || !driverReservationHighlightTrip?.id || Boolean(ongoingDriverTrip),
      pollingInterval: isFocused && driverReservationHighlightTrip && !ongoingDriverTrip ? HOME_ACTIVITY_POLL_MS : 0,
      skipPollingIfUnfocused: true,
      refetchOnFocus: isFocused,
      refetchOnReconnect: false,
    },
  );
  return {
    ongoingDriverTrip,
    driverReservationHighlightTrip,
    driverReservationHighlightBookings,
    myDriverTrips,
    ongoingDriverBookings,
    refetchOngoingDriverBookings,
  };
}
