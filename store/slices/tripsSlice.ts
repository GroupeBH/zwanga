import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Trip } from '../../types';

interface TripsState {
  items: Trip[];
  selectedTrip: Trip | null;
  isLoading: boolean;
  error: string | null;
  filters: {
    vehicleType: 'all' | 'car' | 'moto' | 'tricycle';
    departure: string;
    arrival: string;
  };
}

const initialState: TripsState = {
  items: [],
  selectedTrip: null,
  isLoading: false,
  error: null,
  filters: {
    vehicleType: 'all',
    departure: '',
    arrival: '',
  },
};

const tripsSlice = createSlice({
  name: 'trips',
  initialState,
  reducers: {
    setTrips: (state, action: PayloadAction<Trip[]>) => {
      state.items = action.payload;
    },
    addTrip: (state, action: PayloadAction<Trip>) => {
      state.items.unshift(action.payload);
    },
    updateTrip: (state, action: PayloadAction<{ id: string; updates: Partial<Trip> }>) => {
      const index = state.items.findIndex(trip => trip.id === action.payload.id);
      if (index !== -1) {
        state.items[index] = { ...state.items[index], ...action.payload.updates };
      }
      if (state.selectedTrip?.id === action.payload.id) {
        state.selectedTrip = { ...state.selectedTrip, ...action.payload.updates };
      }
    },
    removeTrip: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(trip => trip.id !== action.payload);
    },
    setSelectedTrip: (state, action: PayloadAction<Trip | null>) => {
      state.selectedTrip = action.payload;
    },
    setFilters: (state, action: PayloadAction<Partial<TripsState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters: (state) => {
      state.filters = {
        vehicleType: 'all',
        departure: '',
        arrival: '',
      };
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
  },
});

export const {
  setTrips,
  addTrip,
  updateTrip,
  removeTrip,
  setSelectedTrip,
  setFilters,
  clearFilters,
  setLoading,
  setError,
} = tripsSlice.actions;

export default tripsSlice.reducer;

