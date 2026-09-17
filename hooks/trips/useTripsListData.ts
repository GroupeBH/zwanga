import { MainTab, SubTab, TripListItem, normalizeSearchText } from '../../features/trips/tripsModel';
import type { Booking, Trip, RecurringTripTemplate } from '@/types';
import React, { useMemo } from 'react';

interface Params {
  pagedHistory?: boolean;
  myTrips: Trip[] | undefined;
  recurringTemplates: RecurringTripTemplate[];
  setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  refetchTrips: () => Promise<unknown>;
  refetchBookings: () => Promise<unknown>;
  myBookings: Booking[] | undefined;
  subTab: SubTab;
  searchQuery: string;
  mainTab: MainTab;
  tripsLoading: boolean;
  bookingsLoading: boolean;
  tripsError: boolean;
  bookingsError: boolean;
  tripsFetching: boolean;
  bookingsFetching: boolean;
}

export function useTripsListData({
  pagedHistory,
  myTrips,
  recurringTemplates,
  setIsRefreshing,
  refetchTrips,
  refetchBookings,
  myBookings,
  subTab,
  searchQuery,
  mainTab,
  tripsLoading,
  bookingsLoading,
  tripsError,
  bookingsError,
  tripsFetching,
  bookingsFetching,
}: Params) {
  const trips = useMemo(() => myTrips ?? [], [myTrips]);
  const activeRecurringTemplates = useMemo(
    () => recurringTemplates.filter((template) => template.status === 'active').length,
    [recurringTemplates],
  );

  const upcomingTrips = useMemo(
    () => {
      const now = new Date();
      const filtered = trips.filter((trip) => {
        // Si le trajet est déjà complété, il n'est pas à venir
        if (trip.status === 'completed') {
          return false;
        }

        // Si le trajet est 'upcoming' ou 'ongoing', vérifier si la date de départ est passée
        if (trip.status === 'ongoing') {
          return true;
        }

        if (trip.status === 'upcoming') {
          if (trip.departureTime) {
            const departureDate = new Date(trip.departureTime);
            // Si la date de départ est passée, le trajet est expiré
            if (departureDate < now) {
              return false;
            }
          }
          return true;
        }

        return false;
      });

      // Trier par départ le plus imminent, sans deuxième tri redondant.
      return filtered.sort((a, b) => {
        const dateA = new Date(a.departureTime).getTime();
        const dateB = new Date(b.departureTime).getTime();
        return dateA - dateB;
      });
    },
    [trips],
  );

  const completedTrips = useMemo(
    () => {
      if (pagedHistory) return trips;
      const now = new Date();
      const filtered = trips.filter((trip) => {
        // Les trajets avec status 'completed' sont dans l'historique
        if (trip.status === 'completed') {
          return true;
        }

        // Les trajets 'upcoming' ou 'ongoing' dont la date de départ est passée sont expirés
        if (trip.status === 'upcoming') {
          if (trip.departureTime) {
            const departureDate = new Date(trip.departureTime);
            // Si la date de départ est passée, le trajet est expiré et va dans l'historique
            if (departureDate < now) {
              return true;
            }
          }
        }

        return false;
      });

      // Trier par date de départ (les plus récents en premier)
      return filtered.sort((a, b) => {
        const dateA = new Date(a.departureTime).getTime();
        const dateB = new Date(b.departureTime).getTime();
        return dateB - dateA; // dateB - dateA = du plus récent au plus ancien
      });
    },
    [trips, pagedHistory],
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchTrips(), refetchBookings()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filtrer les réservations par statut (à venir / terminées)
  const upcomingBookings = useMemo(() => {
    const now = new Date();
    return (myBookings ?? []).filter((booking) => {
      if (booking.status === 'completed' || booking.status === 'expired' || booking.status === 'rejected' || booking.status === 'cancelled' || booking.status === 'no_show' || booking.status === 'boarding_uncertain') {
        return false;
      }
      if (booking.trip?.status === 'ongoing') {
        return true;
      }
      if (booking.trip?.departureTime) {
        const departureDate = new Date(booking.trip.departureTime);
        return departureDate >= now;
      }
      return booking.status === 'pending' || booking.status === 'accepted';
    }).sort((a, b) => {
      const dateA = new Date(a.trip?.departureTime || a.createdAt).getTime();
      const dateB = new Date(b.trip?.departureTime || b.createdAt).getTime();
      return dateA - dateB;
    });
  }, [myBookings]);

  const completedBookingsList = useMemo(() => {
    if (pagedHistory) return myBookings ?? [];
    const now = new Date();
    return (myBookings ?? []).filter((booking) => {
      if (booking.status === 'completed' || booking.status === 'rejected' || booking.status === 'cancelled' || booking.status === 'no_show' || booking.status === 'boarding_uncertain') {
        return true;
      }
      if (booking.trip?.status === 'ongoing') {
        return false;
      }
      if (booking.trip?.departureTime) {
        const departureDate = new Date(booking.trip.departureTime);
        return departureDate < now;
      }
      return false;
    }).sort((a, b) => {
      const dateA = new Date(a.trip?.departureTime || a.createdAt).getTime();
      const dateB = new Date(b.trip?.departureTime || b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [myBookings, pagedHistory]);

  const displayTrips = subTab === 'upcoming' ? upcomingTrips : completedTrips;
  const displayBookings = subTab === 'upcoming' ? upcomingBookings : completedBookingsList;
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const filteredTrips = useMemo(() => {
    if (pagedHistory || !normalizedSearchQuery) return displayTrips;

    return displayTrips.filter((trip) =>
      normalizeSearchText([
        trip.departure?.name,
        trip.departure?.address,
        trip.arrival?.name,
        trip.arrival?.address,
        trip.driverName,
        trip.vehicle?.brand,
        trip.vehicle?.model,
        trip.vehicleInfo,
      ].join(' ')).includes(normalizedSearchQuery),
    );
  }, [displayTrips, normalizedSearchQuery, pagedHistory]);
  const filteredBookings = useMemo(() => {
    if (pagedHistory || !normalizedSearchQuery) return displayBookings;

    return displayBookings.filter((booking) => {
      const trip = booking.trip;
      return normalizeSearchText([
        trip?.departure?.name,
        trip?.departure?.address,
        booking.passengerDestination,
        trip?.arrival?.name,
        trip?.arrival?.address,
        trip?.driverName,
        trip?.vehicle?.brand,
        trip?.vehicle?.model,
        trip?.vehicleInfo,
      ].join(' ')).includes(normalizedSearchQuery);
    });
  }, [displayBookings, normalizedSearchQuery, pagedHistory]);
  const tripListData = useMemo<TripListItem[]>(
    () =>
      mainTab === 'published'
        ? filteredTrips.map((trip) => ({ kind: 'published' as const, trip }))
        : filteredBookings.map((booking) => ({ kind: 'booking' as const, booking })),
    [filteredBookings, filteredTrips, mainTab],
  );
  const showLoader = (mainTab === 'published' ? tripsLoading : bookingsLoading) && (mainTab === 'published' ? trips.length === 0 : (myBookings?.length ?? 0) === 0);
  const isError = mainTab === 'published' ? tripsError : bookingsError;
  const isFetching = mainTab === 'published' ? tripsFetching : bookingsFetching;

  return {
    trips,
    upcomingTrips,
    upcomingBookings,
    completedTrips,
    completedBookingsList,
    isError,
    showLoader,
    tripListData,
    isFetching,
    handleRefresh,
    activeRecurringTemplates,
    normalizedSearchQuery,
  };
}
