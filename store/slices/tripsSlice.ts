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
  items: [
    {
      id: '1',
      driverId: '123',
      driverName: 'Jean Mukendi',
      driverRating: 4.8,
      vehicleType: 'car',
      vehicleInfo: 'Toyota Corolla blanche',
      departure: { name: 'Gombe', address: 'Ave de la Justice', lat: -4.3276, lng: 15.3222 },
      arrival: { name: 'Lemba', address: 'Campus Unikin', lat: -4.4040, lng: 15.2821 },
      departureTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      arrivalTime: new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString(),
      price: 2000,
      availableSeats: 2,
      totalSeats: 4,
      status: 'upcoming',
    },
    {
      id: '2',
      driverId: '456',
      driverName: 'Marie Kabongo',
      driverRating: 4.9,
      vehicleType: 'moto',
      vehicleInfo: 'Honda rouge',
      departure: { name: 'Kintambo', address: 'Marché Kintambo', lat: -4.3333, lng: 15.2986 },
      arrival: { name: 'Ngaliema', address: 'Rond-point Ngaliema', lat: -4.3821, lng: 15.2663 },
      departureTime: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
      arrivalTime: new Date(Date.now() + 1.25 * 60 * 60 * 1000).toISOString(),
      price: 1000,
      availableSeats: 1,
      totalSeats: 1,
      status: 'upcoming',
    },
  ],
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

