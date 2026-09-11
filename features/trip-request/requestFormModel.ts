import { type AddressInputMode } from '@/components/AddressEntryModeSelector';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import {
  ELECTRONIC_PAYMENTS_ENABLED,
} from '@/constants/paymentFeatures';
import { MUTATION_RECONCILIATION_DELAYS_MS } from '@/constants/network';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { REGISTERED_VEHICLE_TYPE_OPTIONS } from '@/constants/vehicleTypes';
import { useUserLocation } from '@/hooks/useUserLocation';
import { trackEvent } from '@/services/analytics';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import {
  useCreateTripRequestMutation,
  useGetTripRequestVehicleOptionsMutation,
  useLazyGetMyTripRequestsQuery,
  type TripRequestVehiclePriceOption,
} from '@/store/api/tripRequestApi';
import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import type { FavoriteLocation, TripPaymentMode, TripRequestVehicleType } from '@/types';
import { buildCurrentLocationSelection } from '@/utils/currentLocationSelection';
import { getApiErrorMessage, isAmbiguousTransportError } from '@/utils/errorHelpers';
import {
  buildManualGeocodeQuery,
  MANUAL_GEOCODE_DEBOUNCE_MS,
  mapGeocodeResponseToSelection,
  type ManualGeocodeStatus,
} from '@/utils/manualAddressGeocode';
import Animated, { FadeIn, FadeOut } from '@/utils/reanimated';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';
import { getRouteCoordinates } from '@/utils/routeApi';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ImageRequireSource,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export type TimePreset = 'now' | 'soon' | 'later' | 'tomorrow' | 'custom';

export type PickerTarget = 'departure' | 'arrival';

export type RequestFormStep = 'route' | 'details';

export type LatLng = { latitude: number; longitude: number };

export type IOSDateTimePickerProps = React.ComponentProps<typeof DateTimePicker> & {
  accentColor?: string;
  display?: 'default' | 'compact' | 'inline' | 'spinner';
  locale?: string;
  minuteInterval?: number;
  textColor?: string;
  themeVariant?: 'dark' | 'light';
};

export const TIME_PRESETS: {
  id: TimePreset;
  label: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'now', label: 'Maintenant', caption: 'Départ rapide', icon: 'flash' },
  { id: 'soon', label: 'Dans 30 min', caption: 'Encore un peu', icon: 'time' },
  { id: 'custom', label: 'Je choisis', caption: 'Date et heure', icon: 'create-outline' },
];

export const FLEX_OPTIONS = [0, 30, 60, 120];

export const MIN_REQUEST_SEATS = 1;

export const MAX_REQUEST_SEATS = 2;

export const MIN_REQUEST_PRICE = 500;

export const REQUEST_PRICE_STEP = 500;

export const TIME_PRESET_SYNC_INTERVAL_MS = 30000;

export const DEFAULT_REQUEST_REGION: Region = {
  latitude: -4.441931,
  longitude: 15.266293,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export const REQUEST_MAP_MARKER_ANCHOR = { x: 0.5, y: 0.86 };

export const requestMapMarkerImages: Record<'departure' | 'arrival', ImageRequireSource> = {
  departure: require('@/assets/images/map-markers/trip-detail-marker-departure.png'),
  arrival: require('@/assets/images/map-markers/trip-detail-marker-arrival.png'),
};

export const IOSDateTimePicker = DateTimePicker as React.ComponentType<IOSDateTimePickerProps>;

export const POPULAR_PLACES = [
  { name: 'Gare Centrale', commune: 'Gombe' },
  { name: 'Marché Zando', commune: 'Kalamu' },
  { name: 'Rond-point Victoire', commune: 'Lingwala' },
  { name: 'UPN', commune: 'Lemba' },
  { name: 'Kintambo Magasin', commune: 'Kintambo' },
  { name: 'Bandal Tshibangu', commune: 'Bandalungwa' },
  { name: 'Mont-Ngafula', commune: 'Mont-Ngafula' },
  { name: 'Kasa-Vubu', commune: 'Kasa-Vubu' },
];

export const TRIP_PAYMENT_MODE_OPTIONS: {
  id: TripPaymentMode;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  ...(ELECTRONIC_PAYMENTS_ENABLED
    ? [
        {
          id: 'electronic' as const,
          label: 'Paiement électronique',
          description: 'Paiement securisé via FlexPay',
          icon: 'card-outline' as const,
        },
      ]
    : []),
  {
    id: 'cash',
    label: "Paiement cash",
    description: 'Réglez directement auprès du conducteur',
    icon: 'cash-outline',
  },
];

export function roundToStep(date: Date, step: number) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const remainder = next.getMinutes() % step;
  if (remainder) next.setMinutes(next.getMinutes() + (step - remainder));
  return next;
}

export function buildPresetWindow(preset: Exclude<TimePreset, 'custom'>) {
  const now = new Date();
  if (preset === 'now') return { min: roundToStep(new Date(now.getTime() + 5 * 60000), 5), flex: 40 };
  if (preset === 'soon') return { min: roundToStep(new Date(now.getTime() + 30 * 60000), 10), flex: 60 };
  if (preset === 'later') return { min: roundToStep(new Date(now.getTime() + 2 * 3600000), 15), flex: 90 };
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(7, 0, 0, 0);
  return { min: tomorrow, flex: 180 };
}

export function applyDatePart(date: Date, current: Date) {
  const next = new Date(current);
  next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return next;
}

export function applyTimePart(date: Date, current: Date) {
  const next = new Date(current);
  next.setHours(date.getHours(), date.getMinutes(), 0, 0);
  return next;
}

export function formatDateLabel(date: Date) {
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatTimeLabel(date: Date) {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function favoriteIcon(type: FavoriteLocation['type']) {
  if (type === 'home') return 'home';
  if (type === 'work') return 'briefcase';
  return 'location';
}

export function getLocationText(selection: MapLocationSelection | null, manualAddress: string) {
  return (manualAddress.trim() || selection?.title || selection?.address || '').trim();
}

export function getLocationCoordinates(selection: MapLocationSelection | null): [number, number] | undefined {
  const coordinate = selection
    ? normalizeTripMapCoordinate(selection.latitude, selection.longitude)
    : null;
  if (!coordinate) {
    return undefined;
  }
  return [coordinate.longitude, coordinate.latitude];
}

export function parseNumberParam(value: unknown): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;

  if (typeof raw !== 'string' || raw.length === 0) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function clampRequestSeats(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MIN_REQUEST_SEATS;
  }

  return Math.min(MAX_REQUEST_SEATS, Math.max(MIN_REQUEST_SEATS, Math.floor(value)));
}

export function clampRequestPrice(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MIN_REQUEST_PRICE;
  }

  const steppedValue = Math.round(value / REQUEST_PRICE_STEP) * REQUEST_PRICE_STEP;
  return Math.max(MIN_REQUEST_PRICE, steppedValue);
}

export function formatCdfPrice(value: number) {
  return `${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FC`;
}

export function formatDistanceKm(distanceMeters: number | null) {
  if (typeof distanceMeters !== 'number' || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return null;
  }

  const distanceKm = distanceMeters / 1000;
  const roundedDistance = distanceKm < 10 ? distanceKm.toFixed(1) : String(Math.round(distanceKm));
  return `${roundedDistance.replace('.', ',')} km`;
}

export function getMapCoordinate(selection: MapLocationSelection | null): LatLng | null {
  const coordinate = selection
    ? normalizeTripMapCoordinate(selection.latitude, selection.longitude)
    : null;
  if (!coordinate) {
    return null;
  }

  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
}

export function areSameCoordinate(left: LatLng, right: LatLng) {
  return (
    Math.abs(left.latitude - right.latitude) < 0.00001 &&
    Math.abs(left.longitude - right.longitude) < 0.00001
  );
}

export function getRenderableRouteCoordinates(
  coordinates: LatLng[],
  origin: LatLng,
  destination: LatLng,
) {
  if (coordinates.length < 2) {
    return [];
  }

  const isStraightFallback =
    coordinates.length === 2 &&
    areSameCoordinate(coordinates[0], origin) &&
    areSameCoordinate(coordinates[1], destination);

  return isStraightFallback ? [] : coordinates;
}

export function buildRoutePreviewRegion(points: LatLng[]): Region {
  if (points.length === 0) {
    return DEFAULT_REQUEST_REGION;
  }

  if (points.length === 1) {
    return {
      latitude: points[0].latitude,
      longitude: points[0].longitude,
      latitudeDelta: 0.035,
      longitudeDelta: 0.035,
    };
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.35, 0.035),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.35, 0.035),
  };
}
