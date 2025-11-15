import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { zwangaApi } from './api/zwangaApi';
import authReducer from './slices/authSlice';
import messagesReducer from './slices/messagesSlice';
import locationReducer from './slices/locationSlice';
import tripsReducer from './slices/tripsSlice';
import { setStoreAccessor } from './storeAccessor';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    trips: tripsReducer,
    messages: messagesReducer,
    location: locationReducer,
    [zwangaApi.reducerPath]: zwangaApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['trips/addTrip', 'trips/updateTrip'],
        // Ignore these field paths in all actions
        ignoredActionPaths: [
          'payload.departureTime', 
          'payload.arrivalTime', 
          'payload.timestamp', 
          'payload.createdAt',
          'meta.baseQueryMeta.request',
          'meta.baseQueryMeta.response',
          'meta.arg.originalArgs',
        ],
        // Ignore these paths in the state
        ignoredPaths: ['trips.items', 'messages.conversations'],
      },
    }).concat(zwangaApi.middleware),
});

// Initialize store accessor to avoid circular dependencies
setStoreAccessor(store.dispatch, store.getState);

// Enable refetchOnFocus/refetchOnReconnect behaviors
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

