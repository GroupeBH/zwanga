import { useRequestRouteEffects } from './useRequestRouteEffects';
import { useRequestQuickPlaces } from './useRequestQuickPlaces';
import { useRequestBudgetSummary } from './useRequestBudgetSummary';
import { useRequestRoutePrefill } from './useRequestRoutePrefill';
import { type AddressInputMode } from '@/components/AddressEntryModeSelector';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import { clampRequestPrice, LatLng, PickerTarget, RequestFormStep } from '@/features/trip-request/requestFormModel';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { startTransition, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRequestDraft } from './useRequestDraft';
import { useRequestSchedule } from './useRequestSchedule';
import { useRequestSubmission } from './useRequestSubmission';

export function useRequestTripController() {
  const draft = useRequestDraft();

  const schedule = useRequestSchedule({ timePreset: draft.timePreset, departureDateMin: draft.departureDateMin, flexibilityMinutes: draft.flexibilityMinutes, setTimePreset: draft.setTimePreset, setDepartureDateMin: draft.setDepartureDateMin, setFlexibilityMinutes: draft.setFlexibilityMinutes });

  const router = useRouter();

  const requestParams = useLocalSearchParams<{
    arrival?: string;
    departure?: string;
    minSeats?: string;
    seats?: string;
  }>();

  const insets = useSafeAreaInsets();

  const { getCurrentLocation, lastKnownLocation } = useUserLocation({
    autoRequest: false,
    trackingProfile: 'nearby',
  });

  const departureAutoFillStartedRef = useRef(false);

  const departureTouchedRef = useRef(false);

  const screenMountedRef = useRef(true);

  const quickPlaceRequestSeqRef = useRef<Record<PickerTarget, number>>({
    departure: 0,
    arrival: 0,
  });

  const { data: favoriteLocations = [] } = useGetFavoriteLocationsQuery();

  const [geocodeManualAddress] = useGeocodeMutation();

  const [addressInputMode, setAddressInputMode] = useState<AddressInputMode>('map');

  const [addressSectionStep, setAddressSectionStep] = useState<AddressSectionStep>('method');

  const [activePicker, setActivePicker] = useState<PickerTarget | null>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);

  const [showQuickLandmarks, setShowQuickLandmarks] = useState(true);

  const [quickPlaceResolvingKey, setQuickPlaceResolvingKey] = useState<string | null>(null);

  const [requestFormStep, setRequestFormStep] = useState<RequestFormStep>('route');

  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);

  const [isRouteLoading, setIsRouteLoading] = useState(false);

  const [hasAppliedRoutePrefill, setHasAppliedRoutePrefill] = useState(false);

  const { favoriteSuggestions, routePreviewRegion } = useRequestRoutePrefill({
    screenMountedRef,
    departureLocation: draft.departureLocation,
    arrivalLocation: draft.arrivalLocation,
    routeCoordinates,
    favoriteLocations,
    hasAppliedRoutePrefill,
    requestParams,
    setNumberOfSeats: draft.setNumberOfSeats,
    setHasAppliedRoutePrefill,
    setAddressInputMode,
    setRequestFormStep,
    departureTouchedRef,
    setDepartureLocation: draft.setDepartureLocation,
    setDepartureManualAddress: draft.setDepartureManualAddress,
    setArrivalLocation: draft.setArrivalLocation,
    setArrivalManualAddress: draft.setArrivalManualAddress,
    setAddressSectionStep,
    departureAutoFillStartedRef,
    departureManualAddress: draft.departureManualAddress,
    lastKnownLocation,
    getCurrentLocation,
  });

  const { vehicleOptions, recommendedPricePerSeat, hasDepartureAddress, hasArrivalAddress, departureAddress, arrivalAddress, canSubmitRequestDetails, budgetValue, selectedVehicleOptionUnavailable, budgetHintLabel, budgetLabel, isPriceLoading, isVehicleOptionsError, requestSeatsLabel, routeDistanceLabel, retryVehicleOptions, totalBudgetLabel } = useRequestBudgetSummary({
    departureLocation: draft.departureLocation,
    departureManualAddress: draft.departureManualAddress,
    arrivalLocation: draft.arrivalLocation,
    arrivalManualAddress: draft.arrivalManualAddress,
    departureReference: draft.departureReference,
    arrivalReference: draft.arrivalReference,
    numberOfSeats: draft.numberOfSeats,
    hasSpecifiedNumberOfSeats: draft.hasSpecifiedNumberOfSeats,
    selectedVehicleType: draft.selectedVehicleType,
    maxPricePerSeat: draft.maxPricePerSeat,
    hasEditedBudget: draft.hasEditedBudget,
  });

  const { setDepartureManualGeocodeStatus, setArrivalManualGeocodeStatus, arrivalManualGeocodeStatus, departureManualGeocodeStatus } = useRequestRouteEffects({
    addressInputMode,
    departureManualAddress: draft.departureManualAddress,
    departureLocation: draft.departureLocation,
    setDepartureLocation: draft.setDepartureLocation,
    arrivalManualAddress: draft.arrivalManualAddress,
    arrivalLocation: draft.arrivalLocation,
    setArrivalLocation: draft.setArrivalLocation,
    setRouteCoordinates,
    setIsRouteLoading,
    vehicleOptions,
    setSelectedVehicleType: draft.setSelectedVehicleType,
    hasEditedBudget: draft.hasEditedBudget,
    setMaxPricePerSeat: draft.setMaxPricePerSeat,
    recommendedPricePerSeat,
  });

  const primaryLabel =
    requestFormStep === 'route'
      ? !hasDepartureAddress
        ? 'Définir le départ'
        : !hasArrivalAddress
          ? 'Indiquer la destination'
          : 'Voir les options'
      : 'Envoyer la demande';

  const updateBudget = (value: number) => {
    draft.setHasEditedBudget(true);
    draft.setMaxPricePerSeat(String(clampRequestPrice(value)));
  };

  const openPickerFor = (target: PickerTarget) => {
    if (target === 'departure') {
      departureTouchedRef.current = true;
    }
    setAddressInputMode('map');
    setAddressSectionStep(target);
    setActivePicker(target);
  };

  const swapRoutePoints = () => {
    departureTouchedRef.current = true;
    const tempLoc = draft.departureLocation;
    const tempManual = draft.departureManualAddress;
    const tempRef = draft.departureReference;
    draft.setDepartureLocation(draft.arrivalLocation);
    draft.setDepartureManualAddress(draft.arrivalManualAddress);
    draft.setDepartureReference(draft.arrivalReference);
    draft.setArrivalLocation(tempLoc);
    draft.setArrivalManualAddress(tempManual);
    draft.setArrivalReference(tempRef);
  };

  const { applyQuickPlaceToNextSlot, applySelectionToNextSlot } = useRequestQuickPlaces({
    addressSectionStep,
    hasDepartureAddress,
    setAddressInputMode,
    departureTouchedRef,
    setDepartureLocation: draft.setDepartureLocation,
    setDepartureManualAddress: draft.setDepartureManualAddress,
    setAddressSectionStep,
    setArrivalLocation: draft.setArrivalLocation,
    setArrivalManualAddress: draft.setArrivalManualAddress,
    quickPlaceRequestSeqRef,
    setQuickPlaceResolvingKey,
    setDepartureManualGeocodeStatus,
    setArrivalManualGeocodeStatus,
    geocodeManualAddress,
    screenMountedRef,
  });

  const {
    createdRequestId,
    submissionRecoveryMessage,
    submissionError,
    isCreating,
    handleCreateRequest,
    isRequestSuccessVisible,
    isResolvingSentRequest,
    requestSuccessDetailLabel,
    requestSuccessText,
    goToRequestSuccessDetail,
    goHomeAfterRequestSuccess
  } = useRequestSubmission({
    arrivalLocation: draft.arrivalLocation,
    departureLocation: draft.departureLocation,
    timePreset: draft.timePreset,
    setDepartureDateMin: draft.setDepartureDateMin,
    setFlexibilityMinutes: draft.setFlexibilityMinutes,
    description: draft.description,
    departureReference: draft.departureReference,
    arrivalReference: draft.arrivalReference,
    hasSpecifiedNumberOfSeats: draft.hasSpecifiedNumberOfSeats,
    numberOfSeats: draft.numberOfSeats,
    selectedVehicleType: draft.selectedVehicleType,
    requestPaymentMode: draft.requestPaymentMode,
    departureAddress,
    arrivalAddress,
    hasDepartureAddress,
    hasArrivalAddress,
    canSubmitRequestDetails,
    budgetValue,
    selectedVehicleOptionUnavailable,
    getCurrentDepartureWindow: schedule.getCurrentDepartureWindow,
    setRequestFormStep,
    setAddressSectionStep
  });

  const handlePrimaryAction = async () => {
    if (!hasDepartureAddress) {
      setRequestFormStep('route');
      openPickerFor('departure');
      return;
    }
    if (!hasArrivalAddress) {
      setRequestFormStep('route');
      openPickerFor('arrival');
      return;
    }
    if (requestFormStep === 'route') {
      startTransition(() => {
        setRequestFormStep('details');
      });
      return;
    }
    await handleCreateRequest();
  };

  const primaryButtonDisabled =
    isCreating ||
    (requestFormStep === 'details' && !canSubmitRequestDetails);

  const primaryIconName: keyof typeof Ionicons.glyphMap =
    !hasDepartureAddress || !hasArrivalAddress || requestFormStep === 'route'
      ? 'arrow-forward'
      : 'send';

  return {
    activePicker,
    addressInputMode,
    addressSectionStep,
    applyPreset: schedule.applyPreset,
    applyQuickPlaceToNextSlot,
    applySelectionToNextSlot,
    arrivalAddress,
    arrivalLocation: draft.arrivalLocation,
    arrivalManualAddress: draft.arrivalManualAddress,
    arrivalManualGeocodeStatus,
    budgetHintLabel,
    budgetLabel,
    budgetValue,
    createdRequestId,
    departureAddress,
    departureDateMin: draft.departureDateMin,
    departureLocation: draft.departureLocation,
    departureManualAddress: draft.departureManualAddress,
    departureManualGeocodeStatus,
    departureTimeRangeLabel: schedule.departureTimeRangeLabel,
    departureTouchedRef,
    description: draft.description,
    favoriteSuggestions,
    flexibilityMinutes: draft.flexibilityMinutes,
    goHomeAfterRequestSuccess,
    goToRequestSuccessDetail,
    handleCreateRequest,
    handleIosPickerChange: schedule.handleIosPickerChange,
    handlePrimaryAction,
    hasArrivalAddress,
    hasDepartureAddress,
    hasSpecifiedNumberOfSeats: draft.hasSpecifiedNumberOfSeats,
    insets,
    iosPickerMode: schedule.iosPickerMode,
    isCreating,
    isPriceLoading,
    isRequestSuccessVisible,
    isResolvingSentRequest,
    isRouteLoading,
    isVehicleOptionsError,
    numberOfSeats: draft.numberOfSeats,
    openCustomPicker: schedule.openCustomPicker,
    openPickerFor,
    primaryButtonDisabled,
    primaryIconName,
    primaryLabel,
    quickPlaceResolvingKey,
    requestFormStep,
    requestPaymentMode: draft.requestPaymentMode,
    requestSeatsLabel,
    requestSuccessDetailLabel,
    requestSuccessText,
    routeCoordinates,
    routeDistanceLabel,
    routePreviewRegion,
    router,
    selectedTimePreset: schedule.selectedTimePreset,
    selectedVehicleType: draft.selectedVehicleType,
    setActivePicker,
    setAddressInputMode,
    setAddressSectionStep,
    setArrivalLocation: draft.setArrivalLocation,
    setArrivalManualAddress: draft.setArrivalManualAddress,
    setDepartureLocation: draft.setDepartureLocation,
    setDepartureManualAddress: draft.setDepartureManualAddress,
    setDescription: draft.setDescription,
    setFlexibilityMinutes: draft.setFlexibilityMinutes,
    setHasSpecifiedNumberOfSeats: draft.setHasSpecifiedNumberOfSeats,
    setIosPickerMode: schedule.setIosPickerMode,
    setNumberOfSeats: draft.setNumberOfSeats,
    setRequestFormStep,
    setRequestPaymentMode: draft.setRequestPaymentMode,
    setSelectedVehicleType: draft.setSelectedVehicleType,
    setShowAdvanced,
    setShowQuickLandmarks,
    retryVehicleOptions,
    showAdvanced,
    showQuickLandmarks,
    submissionError,
    submissionRecoveryMessage,
    swapRoutePoints,
    timePreset: draft.timePreset,
    timeSummary: schedule.timeSummary,
    totalBudgetLabel,
    updateBudget,
    vehicleOptions
  };
}
export type RequestTripController = ReturnType<typeof useRequestTripController>;
