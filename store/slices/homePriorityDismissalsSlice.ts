import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type State = { userId: string | null; keys: Record<string, true> };
const initialState: State = { userId: null, keys: {} };
const MAX_HIDDEN_PRIORITIES = 200;
const slice = createSlice({
  name: 'homePriorityDismissals',
  initialState,
  reducers: {
    dismissHomePriority(state, { payload }: PayloadAction<{ userId: string; key: string }>) {
      if (!payload.userId || !payload.key || payload.key.length > 400) return;
      if (state.userId !== payload.userId) {
        state.userId = payload.userId;
        state.keys = {};
      }
      if (state.keys[payload.key]) return;
      state.keys[payload.key] = true;
      const keys = Object.keys(state.keys);
      for (const key of keys.slice(0, Math.max(0, keys.length - MAX_HIDDEN_PRIORITIES))) delete state.keys[key];
    },
    resetHomePriorityDismissals: () => initialState,
  },
  extraReducers: builder => {
    builder.addCase('auth/logout', () => initialState);
    builder.addCase('auth/performLogout/fulfilled', () => initialState);
    builder.addCase('auth/performLogout/rejected', () => initialState);
  },
});

export const { dismissHomePriority, resetHomePriorityDismissals } = slice.actions;
export default slice.reducer;
