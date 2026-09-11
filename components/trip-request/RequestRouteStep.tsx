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

type Props = Pick<RequestTripController, 'addressInputMode' | 'addressSectionStep' | 'applyQuickPlaceToNextSlot' | 'applySelectionToNextSlot' | 'arrivalAddress' | 'arrivalManualAddress' | 'arrivalManualGeocodeStatus' | 'departureAddress' | 'departureManualAddress' | 'departureManualGeocodeStatus' | 'departureTouchedRef' | 'favoriteSuggestions' | 'hasArrivalAddress' | 'hasDepartureAddress' | 'openPickerFor' | 'quickPlaceResolvingKey' | 'selectedVehicleType' | 'setArrivalLocation' | 'setArrivalManualAddress' | 'setDepartureLocation' | 'setDepartureManualAddress' | 'setSelectedVehicleType' | 'setShowQuickLandmarks' | 'showQuickLandmarks' | 'swapRoutePoints'>;

export function RequestRouteStep({ addressInputMode, addressSectionStep, applyQuickPlaceToNextSlot, applySelectionToNextSlot, arrivalAddress, arrivalManualAddress, arrivalManualGeocodeStatus, departureAddress, departureManualAddress, departureManualGeocodeStatus, departureTouchedRef, favoriteSuggestions, hasArrivalAddress, hasDepartureAddress, openPickerFor, quickPlaceResolvingKey, selectedVehicleType, setArrivalLocation, setArrivalManualAddress, setDepartureLocation, setDepartureManualAddress, setSelectedVehicleType, setShowQuickLandmarks, showQuickLandmarks, swapRoutePoints }: Props) {
  return (<Animated.View entering={FadeIn} style={styles.routeSetup}>
              <View style={styles.routeSetupHeader}>
                <Text style={styles.routeSetupTitle}>Votre trajet</Text>
                <TouchableOpacity style={styles.routeSetupSwap} onPress={swapRoutePoints} activeOpacity={0.85}>
                  <Ionicons name="swap-vertical" size={18} color={Colors.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.routeInputStack}>
                <View style={styles.routePickerItem}>
                  <TouchableOpacity
                    style={styles.routePickerButton}
                    onPress={() => openPickerFor('departure')}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.routePickerIcon, styles.routePickerIconStart]}>
                      <Ionicons name="navigate" size={18} color={Colors.success} />
                    </View>
                    <View style={styles.routePickerCopy}>
                      <Text style={styles.routePickerLabel}>Départ</Text>
                      <Text
                        style={[styles.routePickerValue, !hasDepartureAddress && styles.routePickerPlaceholder]}
                        numberOfLines={1}
                      >
                        {departureAddress || 'Point de départ'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                  </TouchableOpacity>
                  {addressInputMode === 'manual' && addressSectionStep === 'departure' ? (
                    <View style={styles.routeManualWrap}>
                      <TextInput
                        style={styles.routeManualInput}
                        value={departureManualAddress}
                        onChangeText={(value) => {
                          departureTouchedRef.current = true;
                          setDepartureManualAddress(value);
                          setDepartureLocation(null);
                        }}
                        placeholder="Saisir le départ"
                        placeholderTextColor={Colors.gray[400]}
                      />
                      <ManualGeocodeStatus status={departureManualGeocodeStatus} />
                    </View>
                  ) : null}
                </View>

                <View style={styles.routeStackDivider} />

                <View style={styles.routePickerItem}>
                  <TouchableOpacity
                    style={styles.routePickerButton}
                    onPress={() => openPickerFor('arrival')}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.routePickerIcon, styles.routePickerIconEnd]}>
                      <Ionicons name="flag" size={18} color={Colors.primary} />
                    </View>
                    <View style={styles.routePickerCopy}>
                      <Text style={styles.routePickerLabel}>Destination</Text>
                      <Text
                        style={[styles.routePickerValue, !hasArrivalAddress && styles.routePickerPlaceholder]}
                        numberOfLines={1}
                      >
                        {arrivalAddress || 'Point d’arrivée'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                  </TouchableOpacity>
                  {addressInputMode === 'manual' && addressSectionStep === 'arrival' ? (
                    <View style={styles.routeManualWrap}>
                      <TextInput
                        style={styles.routeManualInput}
                        value={arrivalManualAddress}
                        onChangeText={(value) => {
                          setArrivalManualAddress(value);
                          setArrivalLocation(null);
                        }}
                        placeholder="Saisir la destination"
                        placeholderTextColor={Colors.gray[400]}
                      />
                      <ManualGeocodeStatus status={arrivalManualGeocodeStatus} />
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.routeSuggestions}>
                <View style={styles.suggestionsHeader}>
                  <Text style={styles.suggestionsTitle}>Lieux rapides</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={showQuickLandmarks ? 'Masquer les lieux rapides' : 'Afficher les lieux rapides'}
                    style={styles.suggestionsToggleButton}
                    onPress={() => setShowQuickLandmarks((value) => !value)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.suggestionsToggle}>{showQuickLandmarks ? 'Masquer' : 'Afficher'}</Text>
                  </TouchableOpacity>
                </View>
                {showQuickLandmarks ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.suggestionsScroll}
                  >
                    {favoriteSuggestions.map((favorite) => (
                      <TouchableOpacity
                        key={favorite.id}
                        style={styles.suggestionChip}
                        onPress={() =>
                          applySelectionToNextSlot({
                            title: favorite.name,
                            address: favorite.address,
                            latitude: favorite.coordinates.latitude,
                            longitude: favorite.coordinates.longitude,
                          })
                        }
                        activeOpacity={0.86}
                      >
                        <View style={styles.suggestionIcon}>
                          <Ionicons name={favoriteIcon(favorite.type)} size={14} color={Colors.primary} />
                        </View>
                        <Text style={styles.suggestionText} numberOfLines={1}>
                          {favorite.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {POPULAR_PLACES.map((place) => {
                      const placeLabel = `${place.name}, ${place.commune}`;
                      const isResolving = quickPlaceResolvingKey === placeLabel;

                      return (
                        <TouchableOpacity
                          key={place.name}
                          style={[
                            styles.suggestionChip,
                            quickPlaceResolvingKey && !isResolving && styles.suggestionChipDisabled,
                          ]}
                          onPress={() => {
                            void applyQuickPlaceToNextSlot(placeLabel);
                          }}
                          disabled={Boolean(quickPlaceResolvingKey)}
                          activeOpacity={0.86}
                        >
                          <View style={styles.suggestionIcon}>
                            {isResolving ? (
                              <ActivityIndicator size="small" color={Colors.primary} />
                            ) : (
                              <Ionicons name="location" size={14} color={Colors.primary} />
                            )}
                          </View>
                          <Text style={styles.suggestionText} numberOfLines={1}>
                            {place.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </View>

              <View style={styles.routeVehicleChoice}>
                <View style={styles.routeVehicleChoiceHeader}>
                  <Text style={styles.routeVehicleChoiceTitle}>Type de véhicule</Text>
                  <Text style={styles.routeVehicleChoiceSubtitle}>
                    Choisissez le véhicule souhaité pour ce trajet
                  </Text>
                </View>
                <View style={styles.routeVehicleChoiceRow}>
                  {REGISTERED_VEHICLE_TYPE_OPTIONS.map((option) => {
                    const selected = selectedVehicleType === option.id;

                    return (
                      <TouchableOpacity
                        key={option.id}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={option.label}
                        activeOpacity={0.82}
                        style={[
                          styles.routeVehicleChoiceOption,
                          selected && styles.routeVehicleChoiceOptionSelected,
                        ]}
                        onPress={() => setSelectedVehicleType(option.id)}
                      >
                        <View
                          style={[
                            styles.routeVehicleChoiceIcon,
                            selected && styles.routeVehicleChoiceIconSelected,
                          ]}
                        >
                          <Ionicons
                            name={option.icon}
                            size={21}
                            color={selected ? Colors.primary : Colors.gray[500]}
                          />
                        </View>
                        <Text
                          style={[
                            styles.routeVehicleChoiceLabel,
                            selected && styles.routeVehicleChoiceLabelSelected,
                          ]}
                          numberOfLines={2}
                        >
                          {option.label}
                        </Text>
                        {selected ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={17}
                            color={Colors.primary}
                            style={styles.routeVehicleChoiceCheck}
                          />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* <View style={styles.routeQuickRow}>
                <TouchableOpacity
                  style={styles.routeQuickButton}
                  onPress={handleUseCurrentLocation}
                  disabled={isLocating}
                  activeOpacity={0.85}
                >
                  {isLocating ? (
                    <ActivityIndicator color={Colors.primary} size="small" />
                  ) : (
                    <Ionicons name="locate" size={16} color={Colors.primary} />
                  )}
                  <Text style={styles.routeQuickText}>Partir d’ici</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.routeQuickButton}
                  onPress={() => {
                    if (!hasDepartureAddress) {
                      departureTouchedRef.current = true;
                    }
                    setAddressInputMode('manual');
                    setAddressSectionStep(!hasDepartureAddress ? 'departure' : 'arrival');
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="create-outline" size={16} color={Colors.primary} />
                  <Text style={styles.routeQuickText}>Saisir</Text>
                </TouchableOpacity>
              </View> */}

              
            </Animated.View>);
}

import { ManualGeocodeStatus } from './ManualGeocodeStatus';
