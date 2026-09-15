import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { createRideOutbox } from '@/features/ride-recovery/rideOutboxEngine';
import { getStoreDispatch, getStoreState } from '@/store/storeAccessor';
import { rideRecoveryApi } from '@/store/api/rideRecoveryApi';
import { rideOutboxLoaded } from '@/store/slices/rideRecoverySlice';
import { isAppActive } from './appActivity';

export const rideOutbox = createRideOutbox({
  storage: AsyncStorage,
  uuid: randomUUID,
  now: Date.now,
  userId: () => getStoreState().auth.user?.id,
  canSend: () => isAppActive() && getStoreState().zwangaApi.config.online,
  publish: (userId, entries) => getStoreDispatch()(rideOutboxLoaded({ userId, entries })),
  send: async event => {
    const request = getStoreDispatch()(rideRecoveryApi.endpoints.declareRideStage.initiate(event));
    try { return await request.unwrap(); } finally { request.reset(); }
  },
  read: async bookingId => {
    const request = getStoreDispatch()(rideRecoveryApi.endpoints.getRideDeclarations.initiate({ bookingId }, { subscribe: false, forceRefetch: true }));
    try { return (await request.unwrap())[0]; } finally { request.unsubscribe(); }
  },
});
