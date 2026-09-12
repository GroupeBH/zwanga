import { type AddressInputMode } from '@/components/AddressEntryModeSelector';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import {
  areSameCoordinate,
  buildRoutePreviewRegion,
  clampRequestPrice,
  clampRequestSeats,
  formatCdfPrice,
  formatDistanceKm,
  getLocationText,
  getMapCoordinate,
  getRenderableRouteCoordinates,
  getRequestBudgetState,
  LatLng,
  parseNumberParam,
  PickerTarget,
  RequestFormStep
} from '@/features/trip-request/requestFormModel';
import { useManualAddressGeocode } from '@/hooks/useManualAddressGeocode';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import { buildCurrentLocationSelection } from '@/utils/currentLocationSelection';
import {
  buildManualGeocodeQuery,
  mapGeocodeResponseToSelection
} from '@/utils/manualAddressGeocode';
import { getRouteCoordinates } from '@/utils/routeApi';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager
} from 'react-native';
import { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRequestDraft } from './useRequestDraft';
import { useRequestSchedule } from './useRequestSchedule';
import { useRequestSubmission } from './useRequestSubmission';
import { useRequestVehicleOptions } from './useRequestVehicleOptions';
export function useRequestTripController() {
  const {
    departureLocation,
    arrivalLocation,
    departureManualAddress,
    departureReference,
    arrivalManualAddress,
    arrivalReference,
    timePreset,
    departureDateMin,
    flexibilityMinutes,
    numberOfSeats,
    hasSpecifiedNumberOfSeats,
    selectedVehicleType,
    maxPricePerSeat,
    hasEditedBudget,
    requestPaymentMode,
    description,
    setDepartureLocation,
    setArrivalLocation,
    setDepartureManualAddress,
    setDepartureReference,
    setArrivalManualAddress,
    setArrivalReference,
    setTimePreset,
    setDepartureDateMin,
    setFlexibilityMinutes,
    setNumberOfSeats,
    setHasSpecifiedNumberOfSeats,
    setSelectedVehicleType,
    setMaxPricePerSeat,
    setHasEditedBudget,
    setRequestPaymentMode,
    setDescription
  } = useRequestDraft();

  const {
    iosPickerMode,
    setIosPickerMode,
    departureTimeRangeLabel,
    timeSummary,
    selectedTimePreset,
    getCurrentDepartureWindow,
    applyPreset,
    openCustomPicker,
    handleIosPickerChange
  } = useRequestSchedule({ timePreset, departureDateMin, flexibilityMinutes, setTimePreset, setDepartureDateMin, setFlexibilityMinutes });

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

  useEffect(() => {
    screenMountedRef.current = true;
    return () => {
      screenMountedRef.current = false;
    };
  }, []);

  const routePreviewRegion = useMemo<Region>(() => {
    const selectedPoints = [getMapCoordinate(departureLocation), getMapCoordinate(arrivalLocation)].filter(
      (point): point is LatLng => Boolean(point),
    );
    const previewPoints = routeCoordinates.length > 1 ? routeCoordinates : selectedPoints;

    return buildRoutePreviewRegion(previewPoints);
  }, [
    arrivalLocation,
    departureLocation,
    routeCoordinates,
  ]);

  const favoriteSuggestions = useMemo(() => favoriteLocations.slice(0, 4), [favoriteLocations]);

  useEffect(() => {
    if (hasAppliedRoutePrefill) {
      return;
    }

    const departureParam = typeof requestParams.departure === 'string' ? requestParams.departure.trim() : '';
    const arrivalParam = typeof requestParams.arrival === 'string' ? requestParams.arrival.trim() : '';
    const seatsParam = parseNumberParam(requestParams.seats) ?? parseNumberParam(requestParams.minSeats);

    if (seatsParam !== undefined) {
      setNumberOfSeats(clampRequestSeats(seatsParam));
    }

    if (!departureParam && !arrivalParam) {
      setHasAppliedRoutePrefill(true);
      return;
    }

    setAddressInputMode('manual');
    setRequestFormStep('route');

    if (departureParam) {
      departureTouchedRef.current = true;
      setDepartureLocation(null);
      setDepartureManualAddress(departureParam);
    }

    if (arrivalParam) {
      setArrivalLocation(null);
      setArrivalManualAddress(arrivalParam);
    }

    setAddressSectionStep(!departureParam ? 'departure' : 'arrival');
    setHasAppliedRoutePrefill(true);
  }, [
    hasAppliedRoutePrefill,
    requestParams.arrival,
    requestParams.departure,
    requestParams.minSeats,
    requestParams.seats,
    setArrivalLocation,
    setArrivalManualAddress,
    setDepartureLocation,
    setDepartureManualAddress,
    setNumberOfSeats,
  ]);

  useEffect(() => {
    if (
      !hasAppliedRoutePrefill ||
      departureAutoFillStartedRef.current ||
      departureTouchedRef.current ||
      departureLocation ||
      departureManualAddress.trim()
    ) {
      return;
    }

    departureAutoFillStartedRef.current = true;

    const initializeDeparture = async () => {
      const applyCoordinate = async (coordinate: LatLng) => {
        const selection = await buildCurrentLocationSelection(coordinate);
        if (!screenMountedRef.current || departureTouchedRef.current) {
          return false;
        }

        setDepartureLocation(selection);
        setDepartureManualAddress(selection.title || selection.address);
        setAddressSectionStep('arrival');
        return true;
      };
      const knownLatitude = Number(lastKnownLocation?.coords?.latitude);
      const knownLongitude = Number(lastKnownLocation?.coords?.longitude);
      const knownTimestamp = Number(lastKnownLocation?.timestamp);
      const knownCoordinate =
        Number.isFinite(knownLatitude) &&
          Number.isFinite(knownLongitude) &&
          Number.isFinite(knownTimestamp) &&
          Date.now() - knownTimestamp <= 15 * 60 * 1000
          ? { latitude: knownLatitude, longitude: knownLongitude }
          : null;

      if (knownCoordinate) {
        await applyCoordinate(knownCoordinate);
      }

      if (!screenMountedRef.current || departureTouchedRef.current) {
        return;
      }

      const position = await getCurrentLocation();
      if (!screenMountedRef.current || !position || departureTouchedRef.current) {
        return;
      }

      const currentCoordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      if (knownCoordinate && areSameCoordinate(knownCoordinate, currentCoordinate)) {
        return;
      }

      await applyCoordinate(currentCoordinate);
    };

    void initializeDeparture();
  }, [
    departureLocation,
    departureManualAddress,
    getCurrentLocation,
    hasAppliedRoutePrefill,
    lastKnownLocation,
    setDepartureLocation,
    setDepartureManualAddress,
  ]);

  const departureAddress = getLocationText(departureLocation, departureManualAddress);

  const arrivalAddress = getLocationText(arrivalLocation, arrivalManualAddress);

  const hasDepartureAddress = departureAddress.length > 0;

  const hasArrivalAddress = arrivalAddress.length > 0;

  const { vehicleOptions, routeDistanceMeters, isPriceLoading, isVehicleOptionsError, retryVehicleOptions } = useRequestVehicleOptions({
    departureAddress, arrivalAddress, departureReference, arrivalReference, departureLocation, arrivalLocation,
    numberOfSeats, hasSpecifiedNumberOfSeats,
  });

  const selectedVehicleOption = useMemo(
    () => vehicleOptions.find((option) => option.vehicleType === selectedVehicleType),
    [selectedVehicleType, vehicleOptions],
  );

  const {
    recommendedPricePerSeat,
    parsedManualBudget,
    selectedVehicleOptionUnavailable,
    canSubmitRequestDetails,
    budgetValue,
  } = getRequestBudgetState(maxPricePerSeat, hasEditedBudget, selectedVehicleOption);

  const budgetLabel = budgetValue > 0
    ? formatCdfPrice(budgetValue)
    : isPriceLoading
      ? 'Calcul...'
      : 'Prix à calculer';

  const requestSeatsLabel = `${numberOfSeats} place${numberOfSeats > 1 ? 's' : ''}`;

  const totalBudgetValue = budgetValue > 0 ? budgetValue * numberOfSeats : 0;

  const totalBudgetLabel = totalBudgetValue > 0
    ? formatCdfPrice(totalBudgetValue)
    : isPriceLoading
      ? 'Calcul...'
      : 'À définir';

  const budgetHintLabel = hasEditedBudget
    ? 'Votre budget maximum par place'
    : isVehicleOptionsError && vehicleOptions.length === 0
      ? 'Fixez votre budget pour continuer'
      : 'Prix recommandé par place';

  const routeDistanceLabel = formatDistanceKm(routeDistanceMeters);

  const [departureManualGeocodeStatus, setDepartureManualGeocodeStatus] = useManualAddressGeocode({
    enabled: addressInputMode === 'manual', address: departureManualAddress,
    selection: departureLocation, onResolved: setDepartureLocation,
  });

  const [arrivalManualGeocodeStatus, setArrivalManualGeocodeStatus] = useManualAddressGeocode({
    enabled: addressInputMode === 'manual', address: arrivalManualAddress,
    selection: arrivalLocation, onResolved: setArrivalLocation,
  });

  useEffect(() => {
    const origin = getMapCoordinate(departureLocation);
    const destination = getMapCoordinate(arrivalLocation);

    if (!origin || !destination) {
      setRouteCoordinates([]);
      setIsRouteLoading(false);
      return;
    }

    let isCurrent = true;
    setIsRouteLoading(true);
    setRouteCoordinates([]);

    const interaction = InteractionManager.runAfterInteractions(() => {
      if (!isCurrent) return;

      getRouteCoordinates(origin, destination)
        .then((coordinates) => {
          if (!isCurrent) return;
          setRouteCoordinates(getRenderableRouteCoordinates(coordinates, origin, destination));
        })
        .catch((error) => {
          if (!isCurrent) return;
          console.warn('Impossible de calculer l itinéraire de demande', error);
          setRouteCoordinates([]);
        })
        .finally(() => {
          if (isCurrent) {
            setIsRouteLoading(false);
          }
        });
    });

    return () => {
      isCurrent = false;
      interaction.cancel();
    };
  }, [
    arrivalLocation,
    departureLocation,
  ]);

  useEffect(() => {
    if (!vehicleOptions.length) return;
    setSelectedVehicleType((current) => {
      const option = vehicleOptions.find((option) => option.vehicleType === current);
      return option?.availableForRequestedSeats ? current
        : vehicleOptions.find((option) => option.availableForRequestedSeats)?.vehicleType ?? current;
    });
  }, [vehicleOptions, setSelectedVehicleType]);

  useEffect(() => {
    if (hasEditedBudget) return;
    setMaxPricePerSeat(
      recommendedPricePerSeat === null ? '' : String(recommendedPricePerSeat),
    );
  }, [hasEditedBudget, recommendedPricePerSeat, setMaxPricePerSeat]);

  const primaryLabel =
    requestFormStep === 'route'
      ? !hasDepartureAddress
        ? 'Définir le départ'
        : !hasArrivalAddress
          ? 'Indiquer la destination'
          : 'Voir les options'
      : 'Envoyer la demande';

  const updateBudget = (value: number) => {
    setHasEditedBudget(true);
    setMaxPricePerSeat(String(clampRequestPrice(value)));
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
    const tempLoc = departureLocation;
    const tempManual = departureManualAddress;
    const tempRef = departureReference;
    setDepartureLocation(arrivalLocation);
    setDepartureManualAddress(arrivalManualAddress);
    setDepartureReference(arrivalReference);
    setArrivalLocation(tempLoc);
    setArrivalManualAddress(tempManual);
    setArrivalReference(tempRef);
  };

  const getQuickSelectionTarget = (): PickerTarget => {
    if (addressSectionStep === 'departure' || addressSectionStep === 'arrival') {
      return addressSectionStep;
    }

    return !hasDepartureAddress ? 'departure' : 'arrival';
  };

  const applySelectionToSlot = (target: PickerTarget, selection: MapLocationSelection) => {
    setAddressInputMode('map');
    if (target === 'departure') {
      departureTouchedRef.current = true;
      setDepartureLocation(selection);
      setDepartureManualAddress(selection.title || selection.address);
      setAddressSectionStep('arrival');
      return;
    }

    setArrivalLocation(selection);
    setArrivalManualAddress(selection.title || selection.address);
    setAddressSectionStep('arrival');
  };

  const applySelectionToNextSlot = (selection: MapLocationSelection) => {
    applySelectionToSlot(getQuickSelectionTarget(), selection);
  };

  const applyQuickPlaceToNextSlot = async (place: string) => {
    const target = getQuickSelectionTarget();
    const requestSeq = quickPlaceRequestSeqRef.current[target] + 1;
    quickPlaceRequestSeqRef.current[target] = requestSeq;
    setQuickPlaceResolvingKey(place);
    setAddressInputMode('map');

    if (target === 'departure') {
      departureTouchedRef.current = true;
      setDepartureLocation(null);
      setDepartureManualAddress(place);
      setDepartureManualGeocodeStatus('searching');
      setAddressSectionStep('arrival');
    } else {
      setArrivalLocation(null);
      setArrivalManualAddress(place);
      setArrivalManualGeocodeStatus('searching');
      setAddressSectionStep('arrival');
    }

    try {
      const response = await geocodeManualAddress({
        address: buildManualGeocodeQuery(place),
        region: 'cd',
      }).unwrap();
      if (!screenMountedRef.current || quickPlaceRequestSeqRef.current[target] !== requestSeq) {
        return;
      }

      const selection = mapGeocodeResponseToSelection(place, response);
      if (!selection) {
        throw new Error('Lieu rapide introuvable');
      }

      setAddressInputMode('map');
      if (target === 'departure') {
        setDepartureLocation(selection);
        setDepartureManualAddress(selection.title || selection.address);
        setDepartureManualGeocodeStatus('found');
        setAddressSectionStep('arrival');
        return;
      }

      setArrivalLocation(selection);
      setArrivalManualAddress(selection.title || selection.address);
      setArrivalManualGeocodeStatus('found');
      setAddressSectionStep('arrival');
    } catch (error) {
      if (!screenMountedRef.current || quickPlaceRequestSeqRef.current[target] !== requestSeq) {
        return;
      }

      console.warn('Quick place geocode failed', error);
      setAddressInputMode('manual');
      if (target === 'departure') {
        setDepartureManualGeocodeStatus('missing');
      } else {
        setArrivalManualGeocodeStatus('missing');
      }
    } finally {
      if (screenMountedRef.current && quickPlaceRequestSeqRef.current[target] === requestSeq) {
        setQuickPlaceResolvingKey(null);
      }
    }
  };

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
    arrivalLocation,
    departureLocation,
    timePreset,
    setDepartureDateMin,
    setFlexibilityMinutes,
    hasEditedBudget,
    description,
    departureReference,
    arrivalReference,
    hasSpecifiedNumberOfSeats,
    numberOfSeats,
    selectedVehicleType,
    requestPaymentMode,
    departureAddress,
    arrivalAddress,
    hasDepartureAddress,
    hasArrivalAddress,
    canSubmitRequestDetails,
    parsedManualBudget,
    selectedVehicleOptionUnavailable,
    getCurrentDepartureWindow,
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
    applyPreset,
    applyQuickPlaceToNextSlot,
    applySelectionToNextSlot,
    arrivalAddress,
    arrivalLocation,
    arrivalManualAddress,
    arrivalManualGeocodeStatus,
    budgetHintLabel,
    budgetLabel,
    budgetValue,
    createdRequestId,
    departureAddress,
    departureDateMin,
    departureLocation,
    departureManualAddress,
    departureManualGeocodeStatus,
    departureTimeRangeLabel,
    departureTouchedRef,
    description,
    favoriteSuggestions,
    flexibilityMinutes,
    goHomeAfterRequestSuccess,
    goToRequestSuccessDetail,
    handleCreateRequest,
    handleIosPickerChange,
    handlePrimaryAction,
    hasArrivalAddress,
    hasDepartureAddress,
    hasSpecifiedNumberOfSeats,
    insets,
    iosPickerMode,
    isCreating,
    isPriceLoading,
    isRequestSuccessVisible,
    isResolvingSentRequest,
    isRouteLoading,
    isVehicleOptionsError,
    numberOfSeats,
    openCustomPicker,
    openPickerFor,
    primaryButtonDisabled,
    primaryIconName,
    primaryLabel,
    quickPlaceResolvingKey,
    requestFormStep,
    requestPaymentMode,
    requestSeatsLabel,
    requestSuccessDetailLabel,
    requestSuccessText,
    routeCoordinates,
    routeDistanceLabel,
    routePreviewRegion,
    router,
    selectedTimePreset,
    selectedVehicleType,
    setActivePicker,
    setAddressInputMode,
    setAddressSectionStep,
    setArrivalLocation,
    setArrivalManualAddress,
    setDepartureLocation,
    setDepartureManualAddress,
    setDescription,
    setFlexibilityMinutes,
    setHasSpecifiedNumberOfSeats,
    setIosPickerMode,
    setNumberOfSeats,
    setRequestFormStep,
    setRequestPaymentMode,
    setSelectedVehicleType,
    setShowAdvanced,
    setShowQuickLandmarks,
    retryVehicleOptions,
    showAdvanced,
    showQuickLandmarks,
    submissionError,
    submissionRecoveryMessage,
    swapRoutePoints,
    timePreset,
    timeSummary,
    totalBudgetLabel,
    updateBudget,
    vehicleOptions
  };
}
export type RequestTripController = ReturnType<typeof useRequestTripController>;
