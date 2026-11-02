import type { MapLocationSelection } from '@/components/LocationPickerModal';
import type { TimePreset } from '@/features/trip-request/requestFormModel';
import type { TripPaymentMode, TripRequestVehicleType } from '@/types';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SelectedRequestDriver } from '../api/requestDriverApi';

/** Only the editable draft belongs here. API results and native objects do not. */
export interface RequestDraft {
  targetDriver: SelectedRequestDriver | null;
  departureLocation: MapLocationSelection | null;
  arrivalLocation: MapLocationSelection | null;
  departureManualAddress: string;
  arrivalManualAddress: string;
  departureReference: string;
  arrivalReference: string;
  timePreset: TimePreset;
  hasChosenDepartureTime: boolean;
  departureDateMinMs: number;
  flexibilityMinutes: number;
  numberOfSeats: number;
  hasSpecifiedNumberOfSeats: boolean;
  selectedVehicleType: TripRequestVehicleType;
  selectedVehicleTypes: TripRequestVehicleType[];
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
    targetDriver: null,
    departureLocation: null, arrivalLocation: null,
    departureManualAddress: '', arrivalManualAddress: '', departureReference: '', arrivalReference: '',
    timePreset: 'custom', hasChosenDepartureTime: false, departureDateMinMs, flexibilityMinutes,
    numberOfSeats: 1, hasSpecifiedNumberOfSeats: false, selectedVehicleType: 'car', selectedVehicleTypes: ['car'],
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
      if (!draft) return;
      const change = payload.change;
      if (change.field === 'selectedVehicleTypes') {
        if (!change.value.length) return;
        draft.selectedVehicleTypes = [...new Set(change.value)];
        draft.selectedVehicleType = draft.selectedVehicleTypes[0];
      } else if (change.field === 'selectedVehicleType') {
        // The pricing effect must not erase additional choices on a no-op.
        if (change.value !== draft.selectedVehicleType) draft.selectedVehicleTypes = [change.value];
        draft.selectedVehicleType = change.value;
      } else Object.assign(draft, { [change.field]: change.value });
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
