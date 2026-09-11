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

type Props = Pick<RequestTripController, 'arrivalAddress' | 'arrivalLocation' | 'departureAddress' | 'departureLocation' | 'isRouteLoading' | 'routeCoordinates' | 'routeDistanceLabel' | 'routePreviewRegion' | 'setRequestFormStep'>;

export function RequestRoutePreview({ arrivalAddress, arrivalLocation, departureAddress, departureLocation, isRouteLoading, routeCoordinates, routeDistanceLabel, routePreviewRegion, setRequestFormStep }: Props) {
  return (<View style={styles.offerMap}>
                <MapView
                  style={styles.mapPreviewMap}
                  provider={PROVIDER_GOOGLE}
                  region={routePreviewRegion}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  toolbarEnabled={false}
                >
                  {departureLocation ? (
                    <Marker
                      coordinate={{
                        latitude: departureLocation.latitude,
                        longitude: departureLocation.longitude,
                      }}
                      anchor={REQUEST_MAP_MARKER_ANCHOR}
                      image={requestMapMarkerImages.departure}
                      title="Départ"
                      tracksViewChanges={false}
                    />
                  ) : null}
                  {arrivalLocation ? (
                    <Marker
                      coordinate={{
                        latitude: arrivalLocation.latitude,
                        longitude: arrivalLocation.longitude,
                      }}
                      anchor={REQUEST_MAP_MARKER_ANCHOR}
                      image={requestMapMarkerImages.arrival}
                      title="Destination"
                      tracksViewChanges={false}
                    />
                  ) : null}
                  {routeCoordinates.length > 1 ? (
                    <Polyline
                      coordinates={routeCoordinates}
                      strokeColor={Colors.primaryDark}
                      strokeWidth={5}
                    />
                  ) : null}
                </MapView>
                <View pointerEvents="none" style={styles.offerMapShade} />
                <TouchableOpacity
                  style={styles.offerMapBack}
                  onPress={() => setRequestFormStep('route')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
                </TouchableOpacity>
                <View style={styles.offerRouteCard}>
                  <View style={styles.offerRouteRow}>
                    <Ionicons name="navigate" size={16} color={Colors.success} />
                    <Text style={styles.offerRouteText} numberOfLines={1}>{departureAddress}</Text>
                  </View>
                  <View style={styles.offerRouteDivider} />
                  <View style={styles.offerRouteRow}>
                    <Ionicons name="flag" size={16} color={Colors.primary} />
                    <Text style={styles.offerRouteText} numberOfLines={1}>{arrivalAddress}</Text>
                  </View>
                </View>
                <View pointerEvents="none" style={styles.routeStatusBadge}>
                  {isRouteLoading ? (
                    <ActivityIndicator color={Colors.primary} size="small" />
                  ) : (
                    <Ionicons
                      name={routeCoordinates.length > 1 ? 'git-branch' : 'map-outline'}
                      size={15}
                      color={Colors.primary}
                    />
                  )}
                  <Text style={styles.routeStatusText}>
                    {isRouteLoading
                      ? 'Calcul itinéraire'
                      : routeDistanceLabel
                        ? routeDistanceLabel
                        : routeCoordinates.length > 1
                          ? 'Itinéraire prêt'
                          : 'Zone estimée'}
                  </Text>
                </View>
              </View>);
}
