import type { MapLocationSelection } from '@/components/LocationPickerModal';
import type { TimePreset } from '@/features/trip-request/requestFormModel';
import type { TripPaymentMode, TripRequestVehicleType } from '@/types';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** Only the editable draft belongs here. API results and native objects do not. */
export interface RequestDraft {
  departureLocation: MapLocationSelection | null;
  arrivalLocation: MapLocationSelection | null;
  departureManualAddress: string;
  arrivalManualAddress: string;
  departureReference: string;
  arrivalReference: string;
  timePreset: TimePreset;
  departureDateMinMs: number;
  flexibilityMinutes: number;
  numberOfSeats: number;
  hasSpecifiedNumberOfSeats: boolean;
  selectedVehicleType: TripRequestVehicleType;
  maxPricePerSeat: string;
  hasEditedBudget: boolean;
  requestPaymentMode: TripPaymentMode;
  description: string;
}

export type RequestDraftChange = {
  [K in keyof RequestDraft]: { field: K; value: RequestDraft[K] }
}[keyof RequestDraft];

type DraftsState = { byId: Record<string, RequestDraft> };
const initialState: DraftsState = { byId: {} };

export function createRequestDraft(departureDateMinMs: number, flexibilityMinutes: number): RequestDraft {
  return {
    departureLocation: null, arrivalLocation: null,
    departureManualAddress: '', arrivalManualAddress: '', departureReference: '', arrivalReference: '',
    timePreset: 'now', departureDateMinMs, flexibilityMinutes,
    numberOfSeats: 1, hasSpecifiedNumberOfSeats: false, selectedVehicleType: 'car',
    maxPricePerSeat: '', hasEditedBudget: false, requestPaymentMode: 'cash', description: '',
  };
}

const slice = createSlice({
  name: 'requestDrafts',
  initialState,
  reducers: {
    initializeRequestDraft(state, { payload }: PayloadAction<{ id: string; draft: RequestDraft }>) {
      state.byId[payload.id] ??= payload.draft;
    },
    changeRequestDraft(state, { payload }: PayloadAction<{ id: string; change: RequestDraftChange }>) {
      const draft = state.byId[payload.id];
      // Late async results must not resurrect a closed form or a logged-out session.
      if (draft) Object.assign(draft, { [payload.change.field]: payload.change.value });
    },
    discardRequestDraft(state, { payload }: PayloadAction<string>) { delete state.byId[payload]; },
    resetRequestDrafts: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase('auth/logout', () => initialState);
    builder.addCase('auth/performLogout/fulfilled', () => initialState);
    builder.addCase('auth/performLogout/rejected', () => initialState);
  },
});

export const { initializeRequestDraft, changeRequestDraft, discardRequestDraft, resetRequestDrafts } = slice.actions;
export default slice.reducer;
