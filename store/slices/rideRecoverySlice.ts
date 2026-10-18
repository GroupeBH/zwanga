import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';
import type { RideOutboxEntry } from '@/features/ride-recovery/rideRecoveryModel';
import type { RideActionResult } from '@/features/ride-recovery/rideActionResultModel';

interface State { userId: string | null; hydrated: boolean; entries: RideOutboxEntry[]; error: string | null; actionResult: RideActionResult | null }
const initialState: State = { userId: null, hydrated: false, entries: [], error: null, actionResult: null };
const slice = createSlice({
  name: 'rideRecovery', initialState,
  reducers: {
    resetRideRecovery: () => initialState,
    // Transient UI only: never persisted with the outbox and never an authorization to mutate a ride.
    showRideActionResult: {
      prepare: (payload: Omit<RideActionResult, 'id'>) => ({ payload: { ...payload, id: nanoid() } }),
      reducer: (state, action: PayloadAction<RideActionResult>) => { state.actionResult = action.payload; },
    },
    dismissRideActionResult: (state, action: PayloadAction<string>) => {
      if (state.actionResult?.id === action.payload) state.actionResult = null;
    },
    rideOutboxLoaded: (state, action: PayloadAction<{ userId: string; entries: RideOutboxEntry[] }>) => {
      Object.assign(state, action.payload, { hydrated: true, error: null });
    },
    rideOutboxFailed: (state) => { state.error = 'Impossible de sauvegarder ou de lire vos confirmations sur ce téléphone. Réessayez avant de quitter l’application.'; },
  },
});
export const { resetRideRecovery, rideOutboxLoaded, rideOutboxFailed, showRideActionResult, dismissRideActionResult } = slice.actions;
export default slice.reducer;
