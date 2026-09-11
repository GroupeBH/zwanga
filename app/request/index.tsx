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

import { RequestRouteStep } from '@/components/trip-request/RequestRouteStep';
import { RequestRoutePreview } from '@/components/trip-request/RequestRoutePreview';
import { RequestScheduleFields } from '@/components/trip-request/RequestScheduleFields';
import { RequestSuccessModal } from '@/components/trip-request/RequestSuccessModal';
import { RequestDatePickerModal } from '@/components/trip-request/RequestDatePickerModal';
import { RequestPrimaryButton } from '@/components/trip-request/RequestPrimaryButton';
import { useRequestTripController } from '@/hooks/trip-request/useRequestTripController';

export default function RequestTripScreen() {
 const { activePicker, addressInputMode, addressSectionStep, applyPreset, applyQuickPlaceToNextSlot, applySelectionToNextSlot, arrivalAddress, arrivalLocation, arrivalManualAddress, arrivalManualGeocodeStatus, budgetHintLabel, budgetLabel, budgetValue, createdRequestId, departureAddress, departureDateMin, departureLocation, departureManualAddress, departureManualGeocodeStatus, departureTimeRangeLabel, departureTouchedRef, description, favoriteSuggestions, flexibilityMinutes, goHomeAfterRequestSuccess, goToRequestSuccessDetail, handleCreateRequest, handleIosPickerChange, handlePrimaryAction, hasArrivalAddress, hasDepartureAddress, hasSpecifiedNumberOfSeats, insets, iosPickerMode, isCreating, isPriceLoading, isRequestSuccessVisible, isResolvingSentRequest, isRouteLoading, isVehicleOptionsError, numberOfSeats, openCustomPicker, openPickerFor, primaryButtonDisabled, primaryIconName, primaryLabel, quickPlaceResolvingKey, requestFormStep, requestPaymentMode, requestSeatsLabel, requestSuccessDetailLabel, requestSuccessText, routeCoordinates, routeDistanceLabel, routePreviewRegion, router, selectedTimePreset, selectedVehicleType, setActivePicker, setAddressInputMode, setAddressSectionStep, setArrivalLocation, setArrivalManualAddress, setDepartureLocation, setDepartureManualAddress, setDescription, setFlexibilityMinutes, setHasSpecifiedNumberOfSeats, setIosPickerMode, setNumberOfSeats, setRequestFormStep, setRequestPaymentMode, setSelectedVehicleType, setShowAdvanced, setShowQuickLandmarks, setVehicleOptionsRetry, showAdvanced, showQuickLandmarks, submissionError, submissionRecoveryMessage, swapRoutePoints, timePreset, timeSummary, totalBudgetLabel, updateBudget, vehicleOptions } = useRequestTripController();
 return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Demander un trajet</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            requestFormStep === 'route' ? styles.routeContent : styles.detailsContent,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {requestFormStep === 'route' && (
            <RequestRouteStep addressInputMode={addressInputMode} addressSectionStep={addressSectionStep} applyQuickPlaceToNextSlot={applyQuickPlaceToNextSlot} applySelectionToNextSlot={applySelectionToNextSlot} arrivalAddress={arrivalAddress} arrivalManualAddress={arrivalManualAddress} arrivalManualGeocodeStatus={arrivalManualGeocodeStatus} departureAddress={departureAddress} departureManualAddress={departureManualAddress} departureManualGeocodeStatus={departureManualGeocodeStatus} departureTouchedRef={departureTouchedRef} favoriteSuggestions={favoriteSuggestions} hasArrivalAddress={hasArrivalAddress} hasDepartureAddress={hasDepartureAddress} openPickerFor={openPickerFor} quickPlaceResolvingKey={quickPlaceResolvingKey} renderManualGeocodeStatus={renderManualGeocodeStatus} selectedVehicleType={selectedVehicleType} setArrivalLocation={setArrivalLocation} setArrivalManualAddress={setArrivalManualAddress} setDepartureLocation={setDepartureLocation} setDepartureManualAddress={setDepartureManualAddress} setSelectedVehicleType={setSelectedVehicleType} setShowQuickLandmarks={setShowQuickLandmarks} showQuickLandmarks={showQuickLandmarks} swapRoutePoints={swapRoutePoints} />
          )}

          {requestFormStep === 'details' && !createdRequestId && !submissionRecoveryMessage && (
            <Animated.View entering={FadeIn} style={styles.offerFlow}>
              <RequestRoutePreview arrivalAddress={arrivalAddress} arrivalLocation={arrivalLocation} departureAddress={departureAddress} departureLocation={departureLocation} isRouteLoading={isRouteLoading} routeCoordinates={routeCoordinates} routeDistanceLabel={routeDistanceLabel} routePreviewRegion={routePreviewRegion} setRequestFormStep={setRequestFormStep} />

              <View style={styles.offerSheet}>
                <RequestScheduleFields applyPreset={applyPreset} departureDateMin={departureDateMin} departureTimeRangeLabel={departureTimeRangeLabel} flexibilityMinutes={flexibilityMinutes} openCustomPicker={openCustomPicker} selectedTimePreset={selectedTimePreset} setFlexibilityMinutes={setFlexibilityMinutes} timePreset={timePreset} timeSummary={timeSummary} />

                {isPriceLoading && vehicleOptions.length === 0 ? (
                  <View style={styles.vehicleChoiceLoading}>
                    <ActivityIndicator color={Colors.primary} size="small" />
                    <Text style={styles.vehicleChoiceLoadingText}>Calcul du tarif en cours…</Text>
                  </View>
                ) : null}

                {!isPriceLoading && isVehicleOptionsError && vehicleOptions.length === 0 ? (
                  <View style={styles.vehicleChoiceError}>
                    <View style={styles.vehicleChoiceErrorCopy}>
                      <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />
                      <Text style={styles.vehicleChoiceErrorText}>
                        Tarif indisponible pour le moment. Fixez votre budget ci-dessous ou réessayez.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.vehicleChoiceRetry}
                      onPress={() => setVehicleOptionsRetry((value) => value + 1)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.vehicleChoiceRetryText}>Réessayer</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <View style={styles.offerPriceControl}>
                  <TouchableOpacity
                    style={[styles.offerPriceButton, budgetValue <= MIN_REQUEST_PRICE && styles.offerPriceButtonDisabled]}
                    onPress={() => updateBudget(budgetValue - REQUEST_PRICE_STEP)}
                    disabled={budgetValue <= MIN_REQUEST_PRICE}
                    activeOpacity={0.78}
                  >
                    <Ionicons name="remove" size={26} color={budgetValue <= MIN_REQUEST_PRICE ? Colors.gray[400] : Colors.gray[900]} />
                  </TouchableOpacity>
                  <View style={styles.offerPriceCenter}>
                    <Text style={styles.offerPriceValue}>{budgetLabel}</Text>
                    <Text style={styles.offerPriceHint}>
                      {budgetHintLabel}
                    </Text>
                    <Text
                      style={styles.offerPriceTotal}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.86}
                    >
                      Total estimé · {totalBudgetLabel} pour {requestSeatsLabel}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.offerPriceButton}
                    onPress={() => updateBudget(budgetValue + REQUEST_PRICE_STEP)}
                    activeOpacity={0.78}
                  >
                    <Ionicons name="add" size={26} color={Colors.gray[900]} />
                  </TouchableOpacity>
                </View>

                <View style={styles.offerOptionsRow}>
                  <View style={styles.offerOptionCopy}>
                    <View style={styles.offerOptionIcon}>
                      <Ionicons name="people" size={17} color={Colors.primary} />
                    </View>
                    <View style={styles.offerOptionTextBlock}>
                      <Text style={styles.offerOptionLabel}>Places souhaitées</Text>
                      <Text style={styles.offerOptionText}>
                        {hasSpecifiedNumberOfSeats ? requestSeatsLabel : `${requestSeatsLabel} par défaut`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.counterCompact}>
                    <TouchableOpacity
                      style={[
                        styles.counterBtnCompact,
                        numberOfSeats <= MIN_REQUEST_SEATS && styles.counterBtnCompactDisabled,
                      ]}
                      onPress={() => {
                        setHasSpecifiedNumberOfSeats(true);
                        setNumberOfSeats((value) => clampRequestSeats(value - 1));
                      }}
                      disabled={numberOfSeats <= MIN_REQUEST_SEATS}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name="remove"
                        size={18}
                        color={numberOfSeats <= MIN_REQUEST_SEATS ? Colors.gray[400] : Colors.gray[900]}
                      />
                    </TouchableOpacity>
                    <Text style={styles.counterValueCompact}>{numberOfSeats}</Text>
                    <TouchableOpacity
                      style={[
                        styles.counterBtnCompact,
                        numberOfSeats >= MAX_REQUEST_SEATS && styles.counterBtnCompactDisabled,
                      ]}
                      onPress={() => {
                        setHasSpecifiedNumberOfSeats(true);
                        setNumberOfSeats((value) => clampRequestSeats(value + 1));
                      }}
                      disabled={numberOfSeats >= MAX_REQUEST_SEATS}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name="add"
                        size={18}
                        color={numberOfSeats >= MAX_REQUEST_SEATS ? Colors.gray[400] : Colors.gray[900]}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.offerPaymentBlock}>
                  <Text style={styles.offerSectionLabel}>Mode de paiement</Text>
                  {TRIP_PAYMENT_MODE_OPTIONS.map((option) => {
                    const selected = requestPaymentMode === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[
                          styles.offerPaymentOption,
                          selected && styles.offerPaymentOptionSelected,
                        ]}
                        onPress={() => setRequestPaymentMode(option.id)}
                        activeOpacity={0.84}
                      >
                        <Ionicons
                          name={option.icon}
                          size={19}
                          color={selected ? Colors.primary : Colors.gray[500]}
                        />
                        <View style={styles.offerPaymentCopy}>
                          <Text style={styles.offerPaymentTitle}>{option.label}</Text>
                          <Text style={styles.offerPaymentText}>{option.description}</Text>
                        </View>
                        <Ionicons
                          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={20}
                          color={selected ? Colors.primary : Colors.gray[300]}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity style={styles.offerNoteToggle} onPress={() => setShowAdvanced((value) => !value)}>
                  <Text style={styles.offerNoteToggleText}>{showAdvanced ? 'Masquer la note' : 'Ajouter une note'}</Text>
                  <Ionicons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray[500]} />
                </TouchableOpacity>

                {showAdvanced && (
                  <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.offerNotePanel}>
                    <TextInput
                      style={styles.textArea}
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      placeholder="Ex: j’ai un bagage, je voyage avec un enfant..."
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </Animated.View>
                )}
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {requestFormStep === 'route' && (
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <RequestPrimaryButton handlePrimaryAction={handlePrimaryAction} primaryButtonDisabled={primaryButtonDisabled} primaryIconName={primaryIconName} primaryLabel={primaryLabel} />
        </SafeAreaView>
      )}

      {requestFormStep === 'details' && !isRequestSuccessVisible && (
        <SafeAreaView edges={['bottom']} style={styles.offerStickyFooter}>
          {submissionError ? (
            <View style={styles.submissionErrorBanner}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={styles.submissionErrorText}>{submissionError}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.offerSubmitButton, primaryButtonDisabled && styles.mainButtonDisabled]}
            onPress={handleCreateRequest}
            disabled={primaryButtonDisabled}
            activeOpacity={0.9}
          >
            {isCreating ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Text style={styles.offerSubmitText}>Chercher un chauffeur</Text>
                <Ionicons name="arrow-forward" size={20} color={Colors.white} />
              </>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      )}

      <RequestSuccessModal goHomeAfterRequestSuccess={goHomeAfterRequestSuccess} goToRequestSuccessDetail={goToRequestSuccessDetail} insets={insets} isRequestSuccessVisible={isRequestSuccessVisible} isResolvingSentRequest={isResolvingSentRequest} requestSuccessDetailLabel={requestSuccessDetailLabel} requestSuccessText={requestSuccessText} />

      <LocationPickerModal
        visible={activePicker !== null}
        title={activePicker === 'departure' ? 'Choisir le départ' : 'Choisir la destination'}
        initialLocation={activePicker === 'departure' ? departureLocation : arrivalLocation}
        autoLocateOnOpen={false}
        onClose={() => setActivePicker(null)}
        onSelect={(location) => {
          const target = activePicker;
          setActivePicker(null);
          if (target === 'departure') {
            departureTouchedRef.current = true;
            setAddressInputMode('map');
            setDepartureLocation(location);
            setDepartureManualAddress(location.title || location.address);
            setAddressSectionStep('arrival');
            return;
          }
          setAddressInputMode('map');
          setArrivalLocation(location);
          setArrivalManualAddress(location.title || location.address);
        }}
      />

      <RequestDatePickerModal departureDateMin={departureDateMin} handleIosPickerChange={handleIosPickerChange} insets={insets} iosPickerMode={iosPickerMode} setIosPickerMode={setIosPickerMode} />
    </SafeAreaView>
  );
}
