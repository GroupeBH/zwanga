import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface AcceptedRequestContactIntent { userId: string; requestId: string; createdAt: number }
interface State { pending: AcceptedRequestContactIntent[]; handled: string[] }
const initialState: State = { pending: [], handled: [] };
const key = (intent: Pick<AcceptedRequestContactIntent, 'userId' | 'requestId'>) => `${intent.userId}:${intent.requestId}`;

// Transient UI intentions, never an authorization, phone number, or offline acceptance queue.
const slice = createSlice({ name: 'rideEntry', initialState, reducers: {
  resetRideEntry: () => initialState,
  inviteAcceptedRequestContact: {
    prepare: (intent: Omit<AcceptedRequestContactIntent, 'createdAt'>) => ({ payload: { ...intent, createdAt: Date.now() } }),
    reducer(state, { payload }: PayloadAction<AcceptedRequestContactIntent>) {
      if (!payload.userId || !payload.requestId || state.handled.includes(key(payload)) ||
        state.pending.some(item => key(item) === key(payload))) return;
      state.pending.push(payload);
      if (state.pending.length > 10) state.pending.shift();
    },
  },
  dismissAcceptedRequestContact(state, { payload }: PayloadAction<Pick<AcceptedRequestContactIntent, 'userId' | 'requestId'>>) {
    state.pending = state.pending.filter(item => key(item) !== key(payload));
    if (!state.handled.includes(key(payload))) state.handled.push(key(payload));
    if (state.handled.length > 50) state.handled.shift();
  },
} });
export const { resetRideEntry, inviteAcceptedRequestContact, dismissAcceptedRequestContact } = slice.actions;
export default slice.reducer;
