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

type Props = Pick<RequestTripController, 'goHomeAfterRequestSuccess' | 'goToRequestSuccessDetail' | 'insets' | 'isRequestSuccessVisible' | 'isResolvingSentRequest' | 'requestSuccessDetailLabel' | 'requestSuccessText'>;

export function RequestSuccessModal({ goHomeAfterRequestSuccess, goToRequestSuccessDetail, insets, isRequestSuccessVisible, isResolvingSentRequest, requestSuccessDetailLabel, requestSuccessText }: Props) {
  return (<Modal
        transparent
        visible={isRequestSuccessVisible}
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          if (!isResolvingSentRequest) {
            goHomeAfterRequestSuccess();
          }
        }}
      >
        <View
          style={[
            styles.requestSuccessOverlay,
            {
              paddingTop: Math.max(insets.top, 24) + Spacing.lg,
              paddingBottom: Math.max(insets.bottom, 24) + Spacing.lg,
            },
          ]}
        >
          <View pointerEvents="none" style={styles.requestSuccessBackdropGlowTop} />
          <View pointerEvents="none" style={styles.requestSuccessBackdropGlowBottom} />

          <Animated.View entering={FadeIn.duration(180)} style={styles.requestSuccessCard}>
            <View style={styles.requestSuccessPill}>
              <Ionicons name="radio-outline" size={14} color={Colors.primary} />
              <Text style={styles.requestSuccessPillText}>Demande de trajet</Text>
            </View>

            <View style={styles.requestSuccessIcon}>
              <Ionicons name="checkmark" size={42} color={Colors.white} />
            </View>

            <Text style={styles.requestSuccessTitle}>Demande envoyée</Text>
            <Text style={styles.requestSuccessText}>{requestSuccessText}</Text>

            {isResolvingSentRequest ? (
              <View style={styles.requestSuccessLoadingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.requestSuccessLoadingText}>Recherche du détail…</Text>
              </View>
            ) : (
              <View style={styles.requestSuccessActions}>
                <TouchableOpacity
                  style={styles.requestSuccessPrimary}
                  onPress={goToRequestSuccessDetail}
                  activeOpacity={0.88}
                >
                  <Text style={styles.requestSuccessPrimaryText}>{requestSuccessDetailLabel}</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.requestSuccessSecondary}
                  onPress={goHomeAfterRequestSuccess}
                  activeOpacity={0.84}
                >
                  <Ionicons name="home-outline" size={18} color={Colors.gray[700]} />
                  <Text style={styles.requestSuccessSecondaryText}>Revenir à l’accueil</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>);
}
