import { EMPTY_HOME_BOOKINGS, EMPTY_HOME_TRIPS, HOME_ACTIVE_BOOKINGS_POLL_MS, HOME_ACTIVE_TRIP_POLL_MS, HOME_ACTIVITY_POLL_MS } from '@/features/home/homeModel';
import { useGetTripBookingsQuery, useGetMyActivityBookingsQuery } from '@/store/api/bookingApi';
import {
  useGetMyActivityTripsQuery as useGetMyTripsQuery,
  useGetTripByIdQuery
} from '@/store/api/tripApi';
import { getDriverTripReservationCounts, rankDriverUpcomingTrips } from '@/features/home/homeDriverTripPriority';
import { useMemo } from 'react';
import { displayReadOptions, useDisplayReadsEnabled, useDisplayRefetch } from '@/hooks/useDisplayReads';
import { sharedTripsOptions as sharedActivityQueryOptions, sharedBookingsOptions } from '@/features/activity/activityQueryOptions';
import { findOngoingPassengerBooking, ownsTrip } from '@/features/activity/tripParticipation';
import { EMPTY_HIDDEN_HOME_PRIORITIES, homePriorityKeys, type HiddenHomePriorities } from '@/features/home/homePriorityDismissal';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
type Props = Pick<ReturnType<typeof useHomeContext>, 'isDriver' | 'isFocused' | 'currentUser' | 'trackedTripInfo'> & { hiddenHomePriorities?: HiddenHomePriorities };
export function useHomeDriverActivity({ isDriver, isFocused, currentUser, trackedTripInfo, hiddenHomePriorities = EMPTY_HIDDEN_HOME_PRIORITIES }: Props) {
  const enabled = useDisplayReadsEnabled(isFocused);
  const { data: myBookings } = useGetMyActivityBookingsQuery(undefined, {
    ...sharedBookingsOptions, skip: !enabled || !currentUser?.id,
  });
  const ongoingPassengerBooking = useMemo(
    () => findOngoingPassengerBooking(myBookings, currentUser?.id), [myBookings, currentUser?.id],
  );
  const { data: myDriverTrips = EMPTY_HOME_TRIPS } = useGetMyTripsQuery(undefined, {
    ...sharedActivityQueryOptions,
    skip: !enabled || !isDriver,
  });

  const listedOngoingDriverTrip = useMemo(
    () =>
      myDriverTrips.find(
        (trip) => trip.status === 'ongoing' && ownsTrip(trip, currentUser?.id),
      ) ?? null,
    [currentUser?.id, myDriverTrips],
  );

  // Tracking is a lookup hint only; the returned trip must still prove ownership.
  const driverTripLookupId = ongoingPassengerBooking ? '' :
    (trackedTripInfo?.role === 'driver' ? trackedTripInfo.tripId : null) ?? listedOngoingDriverTrip?.id ?? '';

  const { data: refreshedDriverTrip } = useGetTripByIdQuery(driverTripLookupId, {
    ...displayReadOptions(enabled && isDriver && Boolean(driverTripLookupId), HOME_ACTIVE_TRIP_POLL_MS),
  });

  const ongoingDriverTrip = useMemo(() => {
    if (!isDriver || !currentUser?.id || ongoingPassengerBooking) return null;
    if (refreshedDriverTrip?.id === driverTripLookupId && ownsTrip(refreshedDriverTrip, currentUser.id)) {
      return refreshedDriverTrip.status === 'ongoing' ? refreshedDriverTrip : null;
    }

    return listedOngoingDriverTrip;
  }, [currentUser?.id, driverTripLookupId, isDriver, listedOngoingDriverTrip, refreshedDriverTrip, ongoingPassengerBooking]);

  const {
    data: ongoingDriverBookings = EMPTY_HOME_BOOKINGS,
    refetch: rawRefetchOngoingDriverBookings,
  } = useGetTripBookingsQuery(ongoingDriverTrip?.id ?? '', {
    ...displayReadOptions(enabled && Boolean(ongoingDriverTrip?.id), HOME_ACTIVE_BOOKINGS_POLL_MS),
  });
  const refetchOngoingDriverBookings = useDisplayRefetch(enabled && Boolean(ongoingDriverTrip?.id),
    ongoingDriverTrip?.id ?? '', rawRefetchOngoingDriverBookings);

  const driverReservationHighlightTrip = useMemo(() => {
    if (!isDriver || !currentUser?.id || ongoingDriverTrip || ongoingPassengerBooking) {
      return null;
    }

    const visibleTrips = myDriverTrips.filter(trip => {
      const all = getDriverTripReservationCounts(trip);
      const visible = getDriverTripReservationCounts(trip, hiddenHomePriorities);
      if (visible.pending) return true; // A hidden trip must not hide a new booking action.
      if (hiddenHomePriorities[homePriorityKeys.upcomingTrip(trip)]) return false;
      return !all.pending || visible.accepted > 0;
    });
    return rankDriverUpcomingTrips(visibleTrips, currentUser.id, hiddenHomePriorities)[0] ?? null;
  }, [currentUser?.id, isDriver, myDriverTrips, ongoingDriverTrip, ongoingPassengerBooking, hiddenHomePriorities]);

  const { data: driverReservationHighlightBookings = EMPTY_HOME_BOOKINGS } = useGetTripBookingsQuery(
    driverReservationHighlightTrip?.id ?? '',
    {
      ...displayReadOptions(enabled && Boolean(driverReservationHighlightTrip?.id) && !ongoingDriverTrip, HOME_ACTIVITY_POLL_MS),
    },
  );
  return {
    ongoingDriverTrip,
    ongoingPassengerBooking,
    driverReservationHighlightTrip,
    driverReservationHighlightBookings,
    myDriverTrips,
    ongoingDriverBookings,
    refetchOngoingDriverBookings,
  };
}
