import { usePublishSuccessActions } from './usePublishSuccessActions';
import { usePublishStepNavigation } from './usePublishStepNavigation';
import { usePublishVehicleCreation } from './usePublishVehicleCreation';
import { usePublishVehicleEditor } from './usePublishVehicleEditor';
import { usePublishRouteResolution } from './usePublishRouteResolution';
import { usePublishVehicleState } from './usePublishVehicleState';
import { usePublishIdentity } from './usePublishIdentity';
import { usePublishSchedulePresentation } from './usePublishSchedulePresentation';
import { usePublishPresentation } from './usePublishPresentation';
import { usePublishRoutePreview } from './usePublishRoutePreview';
import { usePublishFormState } from './usePublishFormState';
import { usePublishSubmission } from './usePublishSubmission';
import { usePublishLocationActions } from './usePublishLocationActions';
import { usePublishScheduleActions } from './usePublishScheduleActions';
import { PublishStep, PublicationSuccess, PUBLISH_STEP_ORDER } from '../../features/publish/publishModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useUserLocation } from '@/hooks/useUserLocation';
import {
  useCreateRecurringTripMutation,
  useCreateTripMutation,
  useLazyGetMyRecurringTripsQuery,
  useLazyGetMyTripsQuery,
} from '@/store/api/tripApi';
import { FadeInDown } from '@/utils/reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';



export function usePublishController() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const insets = useSafeAreaInsets();
  const { isIdentityVerified } = useIdentityCheck();
  const [step, setStep] = useState<PublishStep>('route');
  const stepNumber = useMemo(() => PUBLISH_STEP_ORDER.indexOf(step) + 1, [step]);
  const stepEntering = Platform.OS === 'android' ? undefined : FadeInDown.duration(180);
  const [createTrip, { isLoading: isPublishing }] = useCreateTripMutation();
  const [createRecurringTrip, { isLoading: isPublishingRecurring }] = useCreateRecurringTripMutation();
  const [getMyTrips] = useLazyGetMyTripsQuery();
  const [getMyRecurringTrips] = useLazyGetMyRecurringTripsQuery();
  const publishInFlightRef = useRef(false);
  const publicationSuccessActionRef = useRef(false);
  const [publicationSuccess, setPublicationSuccess] = useState<PublicationSuccess>(null);
  const { showDialog } = useDialog();
  const { getCurrentLocation, lastKnownLocation } = useUserLocation({
    autoRequest: false,
    trackingProfile: 'nearby',
  });
  const departureAutoFillStartedRef = useRef(false);
  const departureTouchedRef = useRef(false);

  const identity = usePublishIdentity({
    isIdentityVerified,
  });

  // Driver and Vehicle Management
  const vehicle = usePublishVehicleState();

  const vehicleEditor = usePublishVehicleEditor({
    setVehicleType: vehicle.setVehicleType,
    setVehicleBrand: vehicle.setVehicleBrand,
    setVehicleModel: vehicle.setVehicleModel,
    setVehicleColor: vehicle.setVehicleColor,
    setVehicleLicensePlate: vehicle.setVehicleLicensePlate,
    setShowVehicleForm: vehicle.setShowVehicleForm,
    setVehicleFormError: vehicle.setVehicleFormError,
    setIsFinalizingVehicleCreation: vehicle.setIsFinalizingVehicleCreation,
    setVehicleCreationMessage: vehicle.setVehicleCreationMessage,
  });

  // Données du formulaire
  const form = usePublishFormState();
  const route = usePublishRoutePreview({
    manualAddressTarget: form.manualAddressTarget,
    departureManualAddress: form.departureManualAddress,
    departureLocation: form.departureLocation,
    arrivalManualAddress: form.arrivalManualAddress,
    arrivalLocation: form.arrivalLocation,
    departurePointStatus: form.departurePointStatus,
    arrivalPointStatus: form.arrivalPointStatus,
    showDepartureReference: form.showDepartureReference,
    departureReference: form.departureReference,
    showArrivalReference: form.showArrivalReference,
    arrivalReference: form.arrivalReference,
    routeCoordinates: form.routeCoordinates,
    departureAutoFillStartedRef,
    departureTouchedRef,
    setManualAddressTarget: form.setManualAddressTarget,
    setDepartureLocation: form.setDepartureLocation,
    setDeparturePointStatus: form.setDeparturePointStatus,
    setDepartureManualAddress: form.setDepartureManualAddress,
    setAddressSectionStep: form.setAddressSectionStep,
    lastKnownLocation,
    getCurrentLocation,
  });

  const presentation = usePublishPresentation({
    departureAddress: route.departureAddress,
    departureLocation: form.departureLocation,
    arrivalAddress: route.arrivalAddress,
    arrivalLocation: form.arrivalLocation,
  });

  const locationActions = usePublishLocationActions({
    departureTouchedRef,
    setLocationPickerInitialQuery: form.setLocationPickerInitialQuery,
    setActiveLocationType: form.setActiveLocationType,
    departureLocation: form.departureLocation,
    departurePointStatus: form.departurePointStatus,
    departureManualAddress: form.departureManualAddress,
    departureReference: form.departureReference,
    showDepartureReference: form.showDepartureReference,
    setDepartureLocation: form.setDepartureLocation,
    arrivalLocation: form.arrivalLocation,
    setDeparturePointStatus: form.setDeparturePointStatus,
    arrivalPointStatus: form.arrivalPointStatus,
    setDepartureManualAddress: form.setDepartureManualAddress,
    arrivalManualAddress: form.arrivalManualAddress,
    setDepartureReference: form.setDepartureReference,
    arrivalReference: form.arrivalReference,
    setShowDepartureReference: form.setShowDepartureReference,
    showArrivalReference: form.showArrivalReference,
    setArrivalLocation: form.setArrivalLocation,
    setArrivalPointStatus: form.setArrivalPointStatus,
    setArrivalManualAddress: form.setArrivalManualAddress,
    setArrivalReference: form.setArrivalReference,
    setShowArrivalReference: form.setShowArrivalReference,
    setManualAddressTarget: form.setManualAddressTarget,
    activeLocationType: form.activeLocationType,
    setAddressSectionStep: form.setAddressSectionStep,
  });

  const scheduleActions = usePublishScheduleActions({
    departureDateTime: form.departureDateTime,
    recurringEndDate: form.recurringEndDate,
    setRecurringEndDate: form.setRecurringEndDate,
    setDepartureDateTime: form.setDepartureDateTime,
    setIosPickerValue: form.setIosPickerValue,
    setIosPickerTarget: form.setIosPickerTarget,
    setIosPickerMode: form.setIosPickerMode,
    iosPickerMode: form.iosPickerMode,
    iosPickerTarget: form.iosPickerTarget,
    iosPickerValue: form.iosPickerValue,
  });

  const schedule = usePublishSchedulePresentation({
    departureDateTime: form.departureDateTime,
    recurringEndDate: form.recurringEndDate,
    recurringWeekdayOptions: presentation.recurringWeekdayOptions,
    recurringWeekdays: form.recurringWeekdays,
    isPublishing,
    isPublishingRecurring,
    setIsRecurringTrip: form.setIsRecurringTrip,
    setRecurringWeekdays: form.setRecurringWeekdays,
    toIsoWeekday: presentation.toIsoWeekday,
    setRecurringEndDate: form.setRecurringEndDate,
  });

  const routeResolution = usePublishRouteResolution({
    manualAddressTarget: form.manualAddressTarget,
    departureManualAddress: form.departureManualAddress,
    departureLocation: form.departureLocation,
    setDepartureLocation: form.setDepartureLocation,
    setDeparturePointStatus: form.setDeparturePointStatus,
    arrivalManualAddress: form.arrivalManualAddress,
    arrivalLocation: form.arrivalLocation,
    setArrivalLocation: form.setArrivalLocation,
    setArrivalPointStatus: form.setArrivalPointStatus,
    setRouteCoordinates: form.setRouteCoordinates,
    setIsRouteLoading: form.setIsRouteLoading,
    mode,
    isRecurringTrip: form.isRecurringTrip,
    setIsRecurringTrip: form.setIsRecurringTrip,
    recurringWeekdays: form.recurringWeekdays,
    setRecurringWeekdays: form.setRecurringWeekdays,
    toIsoWeekday: presentation.toIsoWeekday,
    departureDateTime: form.departureDateTime,
  });

  const vehicleCreation = usePublishVehicleCreation({
    vehicleType: vehicle.vehicleType,
    vehicleBrand: vehicle.vehicleBrand,
    vehicleModel: vehicle.vehicleModel,
    vehicleColor: vehicle.vehicleColor,
    vehicleLicensePlate: vehicle.vehicleLicensePlate,
    setVehicleFormError: vehicle.setVehicleFormError,
    createVehicle: vehicle.createVehicle,
    setIsFinalizingVehicleCreation: vehicle.setIsFinalizingVehicleCreation,
    setCreatedVehicle: vehicle.setCreatedVehicle,
    setSelectedVehicleId: vehicle.setSelectedVehicleId,
    setVehicleCreationMessage: vehicle.setVehicleCreationMessage,
    setShowVehicleForm: vehicle.setShowVehicleForm,
    resetVehicleForm: vehicleEditor.resetVehicleForm,
    refetchProfile: vehicle.refetchProfile,
    refetchVehicles: vehicle.refetchVehicles,
  });

  const navigation = usePublishStepNavigation({
    stepNumber,
    step,
    setStep,
    hasDepartureAddress: route.hasDepartureAddress,
    hasArrivalAddress: route.hasArrivalAddress,
    setAddressSectionStep: form.setAddressSectionStep,
    showDialog,
    isPublishIdentityVerified: identity.isPublishIdentityVerified,
    openKycModal: identity.openKycModal,
    departureDateTime: form.departureDateTime,
    isRecurringTrip: form.isRecurringTrip,
    recurringWeekdays: form.recurringWeekdays,
    recurringEndDate: form.recurringEndDate,
    selectedVehicleId: vehicle.selectedVehicleId,
    isFreeTrip: form.isFreeTrip,
    price: form.price,
  });

  const submission = usePublishSubmission({
    publishInFlightRef,
    isSubmittingTrip: schedule.isSubmittingTrip,
    hasDepartureAddress: route.hasDepartureAddress,
    hasArrivalAddress: route.hasArrivalAddress,
    setAddressSectionStep: form.setAddressSectionStep,
    showDialog,
    seats: form.seats,
    isFreeTrip: form.isFreeTrip,
    price: form.price,
    departureDateTime: form.departureDateTime,
    isRecurringTrip: form.isRecurringTrip,
    recurringWeekdays: form.recurringWeekdays,
    isDriver: vehicle.isDriver,
    createdVehicle: vehicle.createdVehicle,
    isLoadingProfile: vehicle.isLoadingProfile,
    isFetchingProfile: vehicle.isFetchingProfile,
    user: vehicle.user,
    refetchProfile: vehicle.refetchProfile,
    setShowDriverRequiredModal: vehicle.setShowDriverRequiredModal,
    selectedVehicleId: vehicle.selectedVehicleId,
    isPublishIdentityVerified: identity.isPublishIdentityVerified,
    openKycModal: identity.openKycModal,
    departureLocation: form.departureLocation,
    arrivalLocation: form.arrivalLocation,
    createRecurringTrip,
    departureAddress: route.departureAddress,
    departureReference: form.departureReference,
    arrivalAddress: route.arrivalAddress,
    arrivalReference: form.arrivalReference,
    formatDateOnlyValue: presentation.formatDateOnlyValue,
    recurringEndDate: form.recurringEndDate,
    formatTimeOnlyValue: presentation.formatTimeOnlyValue,
    description: form.description,
    requiresPassengerKyc: form.requiresPassengerKyc,
    createTrip,
    setPublicationSuccess,
    getMyRecurringTrips,
    getMyTrips,
    router,
  });

  const previousStep = useMemo(() => {
    const currentIndex = PUBLISH_STEP_ORDER.indexOf(step);
    return currentIndex > 0 ? PUBLISH_STEP_ORDER[currentIndex - 1] : null;
  }, [step]);

  const footerPrimaryDisabled =
    step === 'route'
      ? !route.hasDepartureAddress || !route.hasArrivalAddress
      : step === 'confirm'
        ? schedule.isSubmittingTrip ||
          !identity.isPublishIdentityVerified
        : false;

  const footerPrimaryLabel = (() => {
    if (step === 'route') {
      if (!route.hasDepartureAddress) return 'Indiquez le départ';
      if (!route.hasArrivalAddress) return "Indiquez l'arrivée";
      return 'Continuer';
    }
    if (step === 'confirm') {
      if (!identity.isPublishIdentityVerified) return 'Identité à vérifier';
      return form.isRecurringTrip ? 'Publier les trajets' : 'Publier';
    }
    return 'Continuer';
  })();

  const handleFooterPrimary = () => {
    if (step === 'confirm') {
      submission.handlePublish();
      return;
    }
    navigation.handleNextStep();
  };

  const handleStartKyc = async () => {
    identity.setKycModalVisible(false);
    const outcome = await identity.startDiditKyc();
    if (outcome?.status === 'approved') {
      identity.setKycApprovedInForm(true);
      if (step === 'route' && route.hasDepartureCoordinates && route.hasArrivalCoordinates) {
        navigation.goToStep('datetime');
      }
    }
  };

  const { finishPublicationSuccess } = usePublishSuccessActions({
    departureAutoFillStartedRef,
    departureTouchedRef,
    setStep,
    form,
    vehicle,
    publicationSuccessActionRef,
    publicationSuccess,
    setPublicationSuccess,
    router,
  });

  return {
    router,
    navigation,
    step,
    stepEntering,
    route,
    form,
    locationActions,
    departureTouchedRef,
    routeResolution,
    presentation,
    identity,
    handleStartKyc,
    scheduleActions,
    schedule,
    insets,
    vehicle,
    vehicleEditor,
    publicationSuccess,
    submission,
    previousStep,
    footerPrimaryDisabled,
    handleFooterPrimary,
    footerPrimaryLabel,
    finishPublicationSuccess,
    vehicleCreation,
  };
}
