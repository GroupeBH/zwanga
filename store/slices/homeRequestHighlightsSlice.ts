import { HOME_REQUEST_HIGHLIGHT_MS } from '@/features/trip-request/requestPriority';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type HighlightsState = {
  userId: string | null;
  expiresAtById: Record<string, number>;
};
const initialState: HighlightsState = { userId: null, expiresAtById: {} };
const MAX_REMEMBERED_REQUESTS = 200;

const slice = createSlice({
  name: 'homeRequestHighlights',
  initialState,
  reducers: {
    startHomeRequestHighlight(state, { payload }: PayloadAction<{ userId: string; requestId: string; now: number }>) {
      if (!payload.userId || !payload.requestId || !Number.isFinite(payload.now)) return;
      if (state.userId !== payload.userId) {
        state.userId = payload.userId;
        state.expiresAtById = {};
      }
      // Refetches, tab switches and remounts must not restart the ten minutes.
      if (state.expiresAtById[payload.requestId] !== undefined) return;
      state.expiresAtById[payload.requestId] = payload.now + HOME_REQUEST_HIGHLIGHT_MS;
      const oldest = Object.entries(state.expiresAtById).sort((left, right) => left[1] - right[1]);
      for (const [id] of oldest.slice(0, Math.max(0, oldest.length - MAX_REMEMBERED_REQUESTS))) {
        delete state.expiresAtById[id];
      }
    },
    resetHomeRequestHighlights: () => initialState,
  },
  extraReducers: builder => {
    builder.addCase('auth/logout', () => initialState);
    builder.addCase('auth/performLogout/fulfilled', () => initialState);
    builder.addCase('auth/performLogout/rejected', () => initialState);
  },
});

export const { startHomeRequestHighlight, resetHomeRequestHighlights } = slice.actions;
export default slice.reducer;
