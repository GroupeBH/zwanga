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
import { TimePreset, PickerTarget, RequestFormStep, LatLng, IOSDateTimePickerProps, TIME_PRESETS, FLEX_OPTIONS, MIN_REQUEST_SEATS, MAX_REQUEST_SEATS, MIN_REQUEST_PRICE, REQUEST_PRICE_STEP, TIME_PRESET_SYNC_INTERVAL_MS, DEFAULT_REQUEST_REGION, REQUEST_MAP_MARKER_ANCHOR, requestMapMarkerImages, IOSDateTimePicker, POPULAR_PLACES, TRIP_PAYMENT_MODE_OPTIONS, roundToStep, buildPresetWindow, applyDatePart, applyTimePart, formatDateLabel, formatTimeLabel, favoriteIcon, getLocationText, getLocationCoordinates, parseNumberParam, clampRequestSeats, clampRequestPrice, formatCdfPrice, formatDistanceKm, getMapCoordinate, areSameCoordinate, getRenderableRouteCoordinates, buildRoutePreviewRegion } from '@/features/trip-request/requestFormModel';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';

import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';

type Props = Pick<RequestTripController, 'handlePrimaryAction' | 'primaryButtonDisabled' | 'primaryIconName' | 'primaryLabel'> & { compact?: boolean };
export function RequestPrimaryButton({ compact = false, handlePrimaryAction, primaryButtonDisabled, primaryIconName, primaryLabel }: Props) { return (
    <TouchableOpacity
      style={[styles.mainButtonWrap, compact && styles.mainButtonWrapCompact]}
      onPress={handlePrimaryAction}
      disabled={primaryButtonDisabled}
      activeOpacity={0.9}
    >
      <View style={[styles.mainButton, compact && styles.mainButtonCompact, primaryButtonDisabled && styles.mainButtonDisabled]}>
        {primaryButtonDisabled ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <>
            <Text style={styles.mainButtonText}>{primaryLabel}</Text>
            <Ionicons name={primaryIconName} size={18} color={Colors.white} />
          </>
        )}
      </View>
    </TouchableOpacity>
  ); }
