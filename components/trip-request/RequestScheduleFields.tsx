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

type Props = Pick<RequestTripController, 'applyPreset' | 'departureDateMin' | 'departureTimeRangeLabel' | 'flexibilityMinutes' | 'openCustomPicker' | 'selectedTimePreset' | 'setFlexibilityMinutes' | 'timePreset' | 'timeSummary'>;

export function RequestScheduleFields({ applyPreset, departureDateMin, departureTimeRangeLabel, flexibilityMinutes, openCustomPicker, selectedTimePreset, setFlexibilityMinutes, timePreset, timeSummary }: Props) {
  return (<View style={styles.offerTimeCompactBlock}>
                  <View
                    style={styles.offerTimeCompactRow}
                    accessibilityLabel={`Départ ${timeSummary}`}
                  >
                    <View style={styles.offerTimeCompactIcon}>
                      <Ionicons name={selectedTimePreset.icon} size={18} color={Colors.primary} />
                    </View>
                    <View style={styles.offerTimeCompactCopy}>
                      <Text style={styles.offerTimeCompactLabel}>Départ</Text>
                      <Text
                        style={styles.offerTimeCompactValue}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.82}
                      >
                        {formatDateLabel(departureDateMin)} · {departureTimeRangeLabel}
                      </Text>
                    </View>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.offerPresetCompactScroll}
                  >
                    {TIME_PRESETS.map((preset) => {
                      const active = timePreset === preset.id;
                      const compactLabel =
                        preset.id === 'soon'
                          ? '30 min'
                          : preset.id === 'custom'
                            ? 'Choisir'
                            : preset.label;
                      return (
                        <TouchableOpacity
                          key={preset.id}
                          style={[styles.offerPresetCompact, active && styles.offerPresetActive]}
                          onPress={() => applyPreset(preset.id)}
                          activeOpacity={0.82}
                        >
                          <Ionicons name={preset.icon} size={14} color={active ? Colors.white : Colors.gray[600]} />
                          <Text style={[styles.offerPresetCompactText, active && styles.offerPresetTextActive]} numberOfLines={1}>
                            {compactLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {timePreset === 'custom' && (
                    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.customCompactWrap}>
                      <View style={styles.customDateTimeRow}>
                        <TouchableOpacity style={styles.customPickerPill} onPress={() => openCustomPicker('date')}>
                          <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                          <Text style={styles.customPickerPillText} numberOfLines={1}>
                            {formatDateLabel(departureDateMin)}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.customPickerPill} onPress={() => openCustomPicker('time')}>
                          <Ionicons name="time-outline" size={16} color={Colors.primary} />
                          <Text style={styles.customPickerPillText}>{formatTimeLabel(departureDateMin)}</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.flexCompactRow}>
                        <Text style={styles.flexCompactLabel}>Marge</Text>
                        {FLEX_OPTIONS.map((option) => (
                          <TouchableOpacity
                            key={option}
                            style={[styles.flexCompactChip, flexibilityMinutes === option && styles.flexChipActive]}
                            onPress={() => setFlexibilityMinutes(option)}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.flexCompactChipText, flexibilityMinutes === option && styles.flexChipTextActive]}>
                              {option === 0 ? 'Exact' : option === 60 ? '1 h' : option === 120 ? '2 h' : `${option} min`}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </Animated.View>
                  )}
                </View>);
}
