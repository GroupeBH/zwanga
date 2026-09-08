import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { authRefreshApi } from './api/authRefreshApi';
import { zwangaApi } from './api/zwangaApi';
import { mapboxApi } from './api/mapboxApi';
import authReducer from './slices/authSlice';
import messagesReducer from './slices/messagesSlice';
import locationReducer from './slices/locationSlice';
import tripsReducer from './slices/tripsSlice';
import { setStoreAccessor } from './storeAccessor';

const apiQueryActionTypes = [
  `${zwangaApi.reducerPath}/executeQuery/fulfilled`,
  `${zwangaApi.reducerPath}/executeMutation/fulfilled`,
];

const largeStatePaths = [
  'trips.items',
  'messages.conversations',
  zwangaApi.reducerPath,
  authRefreshApi.reducerPath,
  mapboxApi.reducerPath,
];

/**
 * Authenticated RTK Query endpoints use `void` as their cache key. Purge that
 * cache at logout and when the account identity changes so referral, wallet or
 * KYC data can never leak from the previous session on a shared device.
 */
const apiCacheIsolationMiddleware: Middleware = (storeApi) => (next) => (action) => {
  const typedAction = action as { type?: string };
  const previousUserId = (storeApi.getState() as { auth?: { user?: { id?: string } } })
    .auth?.user?.id;
  const result = next(action);
  const currentUserId = (storeApi.getState() as { auth?: { user?: { id?: string } } })
    .auth?.user?.id;
  const logoutAction =
    typedAction.type === 'auth/logout' ||
    typedAction.type === 'auth/performLogout/fulfilled' ||
    typedAction.type === 'auth/performLogout/rejected';
  const accountChanged =
    typedAction.type === 'auth/setTokens' &&
    Boolean(previousUserId && currentUserId && previousUserId !== currentUserId);

  if (logoutAction || accountChanged) {
    storeApi.dispatch(zwangaApi.util.resetApiState());
    storeApi.dispatch(authRefreshApi.util.resetApiState());
  }
  return result;
};

export const store = configureStore({
  reducer: {
    auth: authReducer,
    trips: tripsReducer,
    messages: messagesReducer,
    location: locationReducer,
    [zwangaApi.reducerPath]: zwangaApi.reducer,
    [authRefreshApi.reducerPath]: authRefreshApi.reducer,
    [mapboxApi.reducerPath]: mapboxApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: {
        warnAfter: 128,
        ignoredPaths: largeStatePaths,
      },
      serializableCheck: {
        warnAfter: 128,
        // Ignore these action types
        ignoredActions: ['trips/addTrip', 'trips/updateTrip', ...apiQueryActionTypes],
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
        ignoredPaths: largeStatePaths,
      },
    })
      .prepend(apiCacheIsolationMiddleware)
      .concat(zwangaApi.middleware, authRefreshApi.middleware, mapboxApi.middleware),
});

// Initialize store accessor to avoid circular dependencies
setStoreAccessor(store.dispatch, store.getState);

// Enable refetchOnFocus/refetchOnReconnect behaviors
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

