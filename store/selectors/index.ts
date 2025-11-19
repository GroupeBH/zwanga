import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../index';

// === AUTH SELECTORS ===
export const selectAuth = (state: RootState) => state.auth;
export const selectUser = (state: RootState) => state.auth?.user ?? null;
export const selectIsAuthenticated = (state: RootState) => state.auth?.isAuthenticated ?? false;
export const selectAuthToken = (state: RootState) => state.auth?.accessToken ?? null;
export const selectAuthLoading = (state: RootState) => state.auth?.isLoading ?? false;
export const selectIsLoading = (state: RootState) => state.auth?.isLoading ?? false; // Alias
export const selectAuthError = (state: RootState) => state.auth?.error ?? null;
export const selectAccessToken = (state: RootState) => state.auth?.accessToken ?? null;
export const selectRefreshToken = (state: RootState) => state.auth?.refreshToken ?? null;

// === LOCATION SELECTORS ===
export const selectLocationState = (state: RootState) => state.location;
export const selectPermissionStatus = (state: RootState) => state.location.permissionStatus;
export const selectUserTrackedLocation = (state: RootState) => state.location.lastKnownLocation;
export const selectUserCoordinates = (state: RootState) => state.location.lastKnownLocation?.coords ?? null;
export const selectLocationRadius = (state: RootState) => state.location.radiusKm;
export const selectVehicleFilter = (state: RootState) => state.location.vehicleFilter;
export const selectTripSearchQuery = (state: RootState) => state.location.searchQuery;
export const selectTripSearchMode = (state: RootState) => state.location.searchMode;
export const selectSavedLocations = (state: RootState) => state.location.savedLocations;

// === TRIPS SELECTORS ===
export const selectTrips = (state: RootState) => state.trips.items;
export const selectSelectedTrip = (state: RootState) => state.trips.selectedTrip;
export const selectTripsLoading = (state: RootState) => state.trips.isLoading;
export const selectTripsError = (state: RootState) => state.trips.error;
export const selectTripFilters = (state: RootState) => state.trips.filters;

const toRadians = (value: number) => (value * Math.PI) / 180;
const earthRadiusKm = 6371;

const distanceBetween = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) => {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return earthRadiusKm * c;
};

export const selectTripsMatchingMapFilters = createSelector(
  [
    selectTrips,
    selectUserCoordinates,
    selectLocationRadius,
    selectVehicleFilter,
    selectTripSearchQuery,
    selectTripSearchMode,
  ],
  (trips, coords, radiusKm, vehicleFilter, searchQuery, searchMode) => {
    const hasCoordinateQuery = Boolean(searchQuery && searchQuery.includes(','));
    let parsedCoordinate: { latitude: number; longitude: number } | null = null;

    if (hasCoordinateQuery) {
      const [searchLat, searchLng] = (searchQuery ?? '')
        .split(',')
        .map((value) => parseFloat(value.trim()));
      if (!Number.isNaN(searchLat) && !Number.isNaN(searchLng)) {
        parsedCoordinate = { latitude: searchLat, longitude: searchLng };
      }
    }

    return trips.filter((trip) => {
      if (vehicleFilter !== 'all' && trip.vehicleType !== vehicleFilter) {
        return false;
      }

      if (searchQuery && !hasCoordinateQuery) {
        const normalized = searchQuery.toLowerCase();
        let matchesQuery = false;

        if (searchMode === 'all' || searchMode === 'departure') {
          matchesQuery =
            matchesQuery || trip.departure.name.toLowerCase().includes(normalized);
        }

        if (searchMode === 'all' || searchMode === 'arrival') {
          matchesQuery = matchesQuery || trip.arrival.name.toLowerCase().includes(normalized);
        }

        if (!matchesQuery) {
          return false;
        }
      }

      const referenceCoords = parsedCoordinate ?? (!searchQuery ? coords : null);
      if (referenceCoords && trip.departure?.lat && trip.departure?.lng) {
        const dist = distanceBetween(
          { latitude: trip.departure.lat, longitude: trip.departure.lng },
          referenceCoords,
        );
        if (dist > radiusKm) {
          return false;
        }
      }

      return true;
    });
  },
);
    //       trip.departure.name.toLowerCase().includes(normalized) ||
    //       trip.arrival.name.toLowerCase().includes(normalized);
    //     if (!matchesQuery) {
    //       return false;
    //     }
    //   }

    //   if (coords && trip.departure?.lat && trip.departure?.lng) {
    //     const dist = distanceBetween(
    //       { latitude: trip.departure.lat, longitude: trip.departure.lng },
    //       coords,
    //     );
    //     if (dist > radiusKm) {
    //       return false;
    //     }
    //   }

    //   return true;
    // }),
// );

// Trips filtrés selon les filtres actifs
export const selectFilteredTrips = createSelector(
  [selectTrips, selectTripFilters],
  (trips, filters) => {
    return trips.filter(trip => {
      const matchesVehicleType = filters.vehicleType === 'all' || trip.vehicleType === filters.vehicleType;
      const matchesDeparture = !filters.departure || 
        trip.departure.name.toLowerCase().includes(filters.departure.toLowerCase());
      const matchesArrival = !filters.arrival || 
        trip.arrival.name.toLowerCase().includes(filters.arrival.toLowerCase());
      
      return matchesVehicleType && matchesDeparture && matchesArrival;
    });
  }
);

// Trips à venir
export const selectUpcomingTrips = createSelector(
  [selectTrips],
  (trips) => trips.filter(trip => trip.status === 'upcoming' || trip.status === 'ongoing')
);

// Trips terminés
export const selectCompletedTrips = createSelector(
  [selectTrips],
  (trips) => trips.filter(trip => trip.status === 'completed')
);

// Trips disponibles (avec places disponibles)
export const selectAvailableTrips = createSelector(
  [selectTrips],
  (trips) => trips.filter(trip => trip.availableSeats > 0 && trip.status === 'upcoming')
);

// Trip par ID
export const selectTripById = (tripId: string) => 
  createSelector(
    [selectTrips],
    (trips) => trips.find(trip => trip.id === tripId)
  );

// === MESSAGES SELECTORS ===
export const selectConversations = (state: RootState) => state.messages.conversations;
export const selectAllMessages = (state: RootState) => state.messages.messages;
export const selectUnreadMessagesCount = (state: RootState) => state.messages.unreadCount;
export const selectMessagesLoading = (state: RootState) => state.messages.isLoading;
export const selectMessagesError = (state: RootState) => state.messages.error;

// Messages d'une conversation spécifique
export const selectMessagesByConversationId = (conversationId: string) =>
  createSelector(
    [selectAllMessages],
    (messages) => messages[conversationId] || []
  );

// Conversation par ID utilisateur
export const selectConversationByUserId = (userId: string) =>
  createSelector(
    [selectConversations],
    (conversations) => conversations.find(conv => conv.userId === userId)
  );

// Conversations avec messages non lus
export const selectUnreadConversations = createSelector(
  [selectConversations],
  (conversations) => conversations.filter(conv => conv.unreadCount > 0)
);

// === STATISTIQUES UTILISATEUR ===
export const selectUserStats = createSelector(
  [selectUser, selectTrips],
  (user, trips) => {
    if (!user) return null;
    
    const userTrips = trips.filter(trip => trip.driverId === user.id);
    const completedTrips = userTrips.filter(trip => trip.status === 'completed');
    
    return {
      totalTrips: user.totalTrips,
      rating: user.rating,
      completedTrips: completedTrips.length,
      completionRate: userTrips.length > 0 
        ? Math.round((completedTrips.length / userTrips.length) * 100) 
        : 0,
    };
  }
);

