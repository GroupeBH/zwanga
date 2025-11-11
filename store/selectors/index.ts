import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../index';

// === AUTH SELECTORS ===
export const selectAuth = (state: RootState) => state.auth;
export const selectUser = (state: RootState) => state.auth.user;
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;
export const selectAuthToken = (state: RootState) => state.auth.token;
export const selectAuthLoading = (state: RootState) => state.auth.isLoading;
export const selectAuthError = (state: RootState) => state.auth.error;

// === TRIPS SELECTORS ===
export const selectTrips = (state: RootState) => state.trips.items;
export const selectSelectedTrip = (state: RootState) => state.trips.selectedTrip;
export const selectTripsLoading = (state: RootState) => state.trips.isLoading;
export const selectTripsError = (state: RootState) => state.trips.error;
export const selectTripFilters = (state: RootState) => state.trips.filters;

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

