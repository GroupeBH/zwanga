import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import authReducer from './slices/authSlice';
import tripsReducer from './slices/tripsSlice';
import messagesReducer from './slices/messagesSlice';
import { zwangaApi } from './api/zwangaApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    trips: tripsReducer,
    messages: messagesReducer,
    [zwangaApi.reducerPath]: zwangaApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['trips/addTrip', 'trips/updateTrip'],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['payload.departureTime', 'payload.arrivalTime', 'payload.timestamp', 'payload.createdAt'],
        // Ignore these paths in the state
        ignoredPaths: ['trips.items', 'messages.conversations'],
      },
    }).concat(zwangaApi.middleware),
});

// Enable refetchOnFocus/refetchOnReconnect behaviors
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

