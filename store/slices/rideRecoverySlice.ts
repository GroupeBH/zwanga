import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RideOutboxEntry } from '@/features/ride-recovery/rideRecoveryModel';

interface State { userId: string | null; hydrated: boolean; entries: RideOutboxEntry[]; error: string | null }
const initialState: State = { userId: null, hydrated: false, entries: [], error: null };
const slice = createSlice({
  name: 'rideRecovery', initialState,
  reducers: {
    resetRideRecovery: () => initialState,
    rideOutboxLoaded: (state, action: PayloadAction<{ userId: string; entries: RideOutboxEntry[] }>) => {
      Object.assign(state, action.payload, { hydrated: true, error: null });
    },
    rideOutboxFailed: (state) => { state.error = 'Impossible de sauvegarder ou de lire vos confirmations sur ce téléphone. Réessayez avant de quitter l’application.'; },
  },
});
export const { resetRideRecovery, rideOutboxLoaded, rideOutboxFailed } = slice.actions;
export default slice.reducer;
