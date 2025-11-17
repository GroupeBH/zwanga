import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type PermissionState = 'undetermined' | 'granted' | 'denied';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface TrackedLocation {
  coords: Coordinates;
  timestamp: number;
  accuracy?: number | null;
}

export type VehicleFilter = 'all' | 'car' | 'moto' | 'tricycle';
export interface SavedLocation {
  id: string;
  label: string;
  address: string;
  coords: Coordinates;
}

interface LocationState {
  permissionStatus: PermissionState;
  lastKnownLocation: TrackedLocation | null;
  isTracking: boolean;
  radiusKm: number;
  vehicleFilter: VehicleFilter;
  searchQuery: string;
  savedLocations: SavedLocation[];
}

const initialState: LocationState = {
  permissionStatus: 'undetermined',
  lastKnownLocation: null,
  isTracking: true,
  radiusKm: 10,
  vehicleFilter: 'all',
  searchQuery: '',
  savedLocations: [],
};

const locationSlice = createSlice({
  name: 'location',
  initialState,
  reducers: {
    setLocationPermission(state, action: PayloadAction<PermissionState>) {
      state.permissionStatus = action.payload;
    },
    setLastKnownLocation(state, action: PayloadAction<TrackedLocation | null>) {
      state.lastKnownLocation = action.payload;
    },
    setTrackingEnabled(state, action: PayloadAction<boolean>) {
      state.isTracking = action.payload;
    },
    setRadiusKm(state, action: PayloadAction<number>) {
      state.radiusKm = action.payload;
    },
    setVehicleFilter(state, action: PayloadAction<VehicleFilter>) {
      state.vehicleFilter = action.payload;
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    addSavedLocation(state, action: PayloadAction<SavedLocation>) {
      state.savedLocations = [...state.savedLocations, action.payload];
    },
    removeSavedLocation(state, action: PayloadAction<string>) {
      state.savedLocations = state.savedLocations.filter((location) => location.id !== action.payload);
    },
  },
});

export const {
  setLocationPermission,
  setLastKnownLocation,
  setTrackingEnabled,
  setRadiusKm,
  setVehicleFilter,
  setSearchQuery,
  addSavedLocation,
  removeSavedLocation,
} = locationSlice.actions;

export default locationSlice.reducer;

