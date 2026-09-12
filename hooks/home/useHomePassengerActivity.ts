import { EMPTY_HOME_TRIP_REQUESTS, HOME_ACTIVE_BOOKINGS_POLL_MS, HOME_ACTIVE_TRIP_POLL_MS, HOME_ACTIVITY_POLL_MS, isTripRequestWithinAcceptanceWindow, RECENT_TRIPS_LIMIT } from '@/features/home/homeModel';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetNotificationsQuery } from '@/store/api/notificationApi';
import {
  useGetTripByIdQuery
} from '@/store/api/tripApi';
import {
  useGetAvailableTripRequestsQuery,
  useGetMyTripRequestsQuery,
} from '@/store/api/tripRequestApi';
import { useMemo } from 'react';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
type Props = Pick<ReturnType<typeof useHomeContext>, 'isFocused' | 'currentUser' | 'isDriver' | 'trackedTripInfo'>;
export function useHomePassengerActivity({ isFocused, currentUser, isDriver, trackedTripInfo }: Props) {
  const { data: notificationsData } = useGetNotificationsQuery({ limit: 1 }, {
    refetchOnMountOrArgChange: true,
  });

  const { data: myBookings, refetch: refetchMyBookings } = useGetMyBookingsQuery(undefined, {
    pollingInterval: isFocused ? HOME_ACTIVE_BOOKINGS_POLL_MS : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: false,
  });

  const { data: myTripRequests = EMPTY_HOME_TRIP_REQUESTS } = useGetMyTripRequestsQuery(undefined, {
    skip: !currentUser?.id,
    pollingInterval: isFocused ? HOME_ACTIVITY_POLL_MS : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: false,
  });

  const {
    data: availableTripRequests = EMPTY_HOME_TRIP_REQUESTS,
    isLoading: availableTripRequestsLoading,
    isError: availableTripRequestsError,
    refetch: refetchAvailableTripRequests,
  } = useGetAvailableTripRequestsQuery(undefined, {
    skip: !isDriver,
    pollingInterval: isFocused && isDriver ? HOME_ACTIVITY_POLL_MS : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: false,
  });

  const activeBookings = useMemo(() => {
    if (!myBookings || !currentUser?.id) {
      return [];
    }

    return myBookings.filter(
      (booking) =>
        (booking.status === 'pending' || booking.status === 'accepted') && booking.tripId,
    );
  }, [myBookings, currentUser?.id]);

  const activePassengerBooking = useMemo(
    () =>
      activeBookings.find(
        (booking) =>
          booking.status === 'accepted' &&
          !booking.droppedOff &&
          booking.trip?.status === 'ongoing',
      ) ??
      activeBookings.find(
        (booking) => booking.status === 'accepted' && !booking.droppedOff,
      ) ??
      null,
    [activeBookings],
  );

  const passengerTripLookupId =
    (trackedTripInfo?.role === 'passenger' ? trackedTripInfo.tripId : null) ??
    activePassengerBooking?.tripId ??
    '';

  const { data: refreshedPassengerTrip } = useGetTripByIdQuery(passengerTripLookupId, {
    skip: !currentUser?.id || !passengerTripLookupId,
    pollingInterval: isFocused ? HOME_ACTIVE_TRIP_POLL_MS : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: false,
  });

  const bookedTripIds = useMemo(
    () => new Set(activeBookings.map((booking) => booking.tripId)),
    [activeBookings],
  );

  const completedBookingTripIds = useMemo(() => {
    if (!myBookings || !currentUser?.id) {
      return new Set<string>();
    }

    return new Set(
      myBookings
        .filter(
          (booking) =>
            booking.status === 'completed' &&
            booking.droppedOffConfirmedByPassenger === true &&
            booking.tripId,
        )
        .map((booking) => booking.tripId),
    );
  }, [myBookings, currentUser?.id]);

  const activeTripRequest = useMemo(() => {
    const statusPriority = {
      driver_selected: 0,
      offers_received: 1,
      pending: 2,
    } as const;

    const getDepartureTime = (departureDate?: string | null) => {
      if (!departureDate) {
        return null;
      }

      const timestamp = new Date(departureDate).getTime();
      return Number.isFinite(timestamp) ? timestamp : null;
    };

    return (
      [...myTripRequests]
        .filter(
          (request) =>
            (request.status === 'pending' ||
              request.status === 'offers_received' ||
              request.status === 'driver_selected') &&
            !request.tripId &&
            isTripRequestWithinAcceptanceWindow(request),
        )
        .sort((a, b) => {
          const departureA = getDepartureTime(a.departureDateMin);
          const departureB = getDepartureTime(b.departureDateMin);

          if (departureA !== null && departureB === null) return -1;
          if (departureA === null && departureB !== null) return 1;
          if (departureA !== null && departureB !== null && departureA !== departureB) {
            return departureA - departureB;
          }

          const priorityA = statusPriority[a.status as keyof typeof statusPriority] ?? 99;
          const priorityB = statusPriority[b.status as keyof typeof statusPriority] ?? 99;

          if (priorityA !== priorityB) {
            return priorityA - priorityB;
          }

          const updatedA = new Date(a.updatedAt || a.createdAt).getTime();
          const updatedB = new Date(b.updatedAt || b.createdAt).getTime();
          return updatedB - updatedA;
        })[0] ?? null
    );
  }, [myTripRequests]);

  const activeTripRequestPendingOffers = useMemo(
    () => activeTripRequest?.offers?.filter((offer) => offer.status === 'pending').length ?? 0,
    [activeTripRequest],
  );

  const activeRequestStatus = useMemo(() => {
    if (!activeTripRequest) {
      return null;
    }

    if (activeTripRequest.status === 'driver_selected') {
      return { label: 'Conducteur confirmé', icon: 'checkmark-circle-outline' as const };
    }

    if (activeTripRequest.status === 'offers_received' || activeTripRequestPendingOffers > 0) {
      return {
        label: `${activeTripRequestPendingOffers || 1} offre${(activeTripRequestPendingOffers || 1) > 1 ? 's' : ''}`,
        icon: 'sparkles-outline' as const,
      };
    }

    return { label: 'Recherche en cours', icon: 'radio-outline' as const };
  }, [activeTripRequest, activeTripRequestPendingOffers]);

  const availableDriverRequests = useMemo(() => {
    if (!isDriver || !currentUser?.id) {
      return [];
    }

    const getDepartureTime = (departureDate?: string | null) => {
      if (!departureDate) {
        return Number.MAX_SAFE_INTEGER;
      }

      const timestamp = new Date(departureDate).getTime();
      return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
    };

    return [...availableTripRequests]
      .filter(
        (request) =>
          request.passengerId !== currentUser.id &&
          !request.tripId &&
          (request.status === 'pending' || request.status === 'offers_received') &&
          isTripRequestWithinAcceptanceWindow(request),
      )
      .sort((a, b) => {
        const departureDelta = getDepartureTime(a.departureDateMin) - getDepartureTime(b.departureDateMin);
        if (departureDelta !== 0) {
          return departureDelta;
        }

        const updatedA = new Date(a.updatedAt || a.createdAt).getTime();
        const updatedB = new Date(b.updatedAt || b.createdAt).getTime();
        return updatedB - updatedA;
      })
      .slice(0, RECENT_TRIPS_LIMIT);
  }, [availableTripRequests, currentUser?.id, isDriver]);
  return {
    activeBookings,
    completedBookingTripIds,
    bookedTripIds,
    refreshedPassengerTrip,
    activePassengerBooking,
    refetchMyBookings,
    availableDriverRequests,
    notificationsData,
    availableTripRequestsLoading,
    availableTripRequestsError,
    refetchAvailableTripRequests,
    activeTripRequest,
    activeRequestStatus,
  };
}
