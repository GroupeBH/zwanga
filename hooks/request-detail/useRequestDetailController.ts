import { useRequestEditInitialization } from './useRequestEditInitialization';
import { useRequestEditValidation } from './useRequestEditValidation';
import { useRequestAvailability } from './useRequestAvailability';
import { useRequestDetailFormState } from './useRequestDetailFormState';
import { useRequestDetailData } from './useRequestDetailData';
import { useRequestPassengerActions } from './useRequestPassengerActions';
import { useRequestEditSchedule } from './useRequestEditSchedule';
import { useRequestDriverActions } from './useRequestDriverActions';
import { RouteOverridePickerTarget } from '../../features/request-detail/requestDetailModel';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { useCallback } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useRequestDetailController() {
  const data = useRequestDetailData();

  // États pour le formulaire de modification
  const form = useRequestDetailFormState();

  const availability = useRequestAvailability({
    setDirectAcceptRequiresPassengerKyc: form.setDirectAcceptRequiresPassengerKyc,
    tripRequest: data.tripRequest,
    compatibleActiveVehicles: data.compatibleActiveVehicles,
    directAcceptVehicleId: form.directAcceptVehicleId,
    setDirectAcceptVehicleId: form.setDirectAcceptVehicleId,
    setIsLoadingRoute: form.setIsLoadingRoute,
    setRouteCoordinates: form.setRouteCoordinates,
    currentUser: data.currentUser,
    assignedTrip: data.assignedTrip,
    isDriverAccount: data.isDriverAccount,
    isIdentityVerified: data.isIdentityVerified,
    showDirectAcceptModal: form.showDirectAcceptModal,
    isAcceptingTripRequest: data.isAcceptingTripRequest,
    setShowDirectAcceptModal: form.setShowDirectAcceptModal,
  });

  const validation = useRequestEditValidation({
    editAddressInputMode: form.editAddressInputMode,
    editDepartureManualAddress: form.editDepartureManualAddress,
    editDepartureLocation: form.editDepartureLocation,
    editArrivalManualAddress: form.editArrivalManualAddress,
    editArrivalLocation: form.editArrivalLocation,
    editNumberOfSeats: form.editNumberOfSeats,
    showEditForm: form.showEditForm,
    tripRequest: data.tripRequest,
    editVehicleType: form.editVehicleType,
    editDepartureReference: form.editDepartureReference,
    editArrivalReference: form.editArrivalReference,
    setShowEditForm: form.setShowEditForm,
    editDepartureDateMin: form.editDepartureDateMin,
    editDepartureDateMax: form.editDepartureDateMax,
  });

  const { setShowDirectAcceptModal } = form;
  const closeDirectAcceptModal = useCallback(() => {
    setShowDirectAcceptModal(false);
  }, [setShowDirectAcceptModal]);

  const openDirectRouteOverridePicker = (target: RouteOverridePickerTarget) => {
    Keyboard.dismiss();
    form.directPickerRestorePendingRef.current = false;
    if (form.directPickerTransitionTimerRef.current) {
      clearTimeout(form.directPickerTransitionTimerRef.current);
    }
    form.setShowDirectAcceptModal(false);
    form.directPickerTransitionTimerRef.current = setTimeout(() => {
      form.setRouteOverridePickerTarget(target);
      form.directPickerTransitionTimerRef.current = null;
    }, Platform.OS === 'ios' ? 350 : 80);
  };

  const restoreDirectAcceptModalAfterLocationPicker = () => {
    if (form.directPickerRestorePendingRef.current) return;
    form.directPickerRestorePendingRef.current = true;
    if (form.directPickerTransitionTimerRef.current) {
      clearTimeout(form.directPickerTransitionTimerRef.current);
    }
    form.setRouteOverridePickerTarget(null);
    form.directPickerTransitionTimerRef.current = setTimeout(() => {
      form.setShowDirectAcceptModal(true);
      form.directPickerRestorePendingRef.current = false;
      form.directPickerTransitionTimerRef.current = null;
    }, Platform.OS === 'ios' ? 350 : 80);
  };

  const handleRouteOverrideSelected = (location: MapLocationSelection) => {
    switch (form.routeOverridePickerTarget) {
      case 'directDeparture':
        form.setDirectAcceptDepartureLocation(location);
        break;
      case 'directArrival':
        form.setDirectAcceptArrivalLocation(location);
        break;
      default:
        break;
    }
    restoreDirectAcceptModalAfterLocationPicker();
  };

  // Fonctions pour appliquer uniquement la date ou l'heure
  const schedule = useRequestEditSchedule({
    editDepartureDateMin: form.editDepartureDateMin,
    editDepartureDateMax: form.editDepartureDateMax,
    setEditDepartureDateMin: form.setEditDepartureDateMin,
    setEditDepartureDateMax: form.setEditDepartureDateMax,
    setEditIosPickerModeMin: form.setEditIosPickerModeMin,
    setEditIosPickerModeMax: form.setEditIosPickerModeMax,
    editIosPickerModeMin: form.editIosPickerModeMin,
    editIosPickerModeMax: form.editIosPickerModeMax,
  });

  const driverActions = useRequestDriverActions({
    tripRequest: data.tripRequest,
    id: data.id,
    showDialog: data.showDialog,
    startTripFromRequest: data.startTripFromRequest,
    refetch: data.refetch,
    router: data.router,
    directAcceptDepartureDate: availability.directAcceptDepartureDate,
    canAcceptRequest: availability.canAcceptRequest,
    setShowDirectAcceptModal: form.setShowDirectAcceptModal,
    compatibleActiveVehicles: data.compatibleActiveVehicles,
    requestedVehicleType: data.requestedVehicleType,
    directAcceptVehicle: availability.directAcceptVehicle,
    directAcceptRequiresPassengerKyc: form.directAcceptRequiresPassengerKyc,
    directAcceptDepartureLocation: form.directAcceptDepartureLocation,
    directAcceptArrivalLocation: form.directAcceptArrivalLocation,
    directAcceptDepartureReference: form.directAcceptDepartureReference,
    directAcceptArrivalReference: form.directAcceptArrivalReference,
    acceptTripRequest: data.acceptTripRequest,
    startTrip: data.startTrip,
    setAreDirectOptionsExpanded: form.setAreDirectOptionsExpanded,
    isCurrentDriverAssigned: availability.isCurrentDriverAssigned,
  });

  const editor = useRequestEditInitialization({
    setEditVehicleType: form.setEditVehicleType,
    resetEditBudget: validation.resetEditBudget,
    tripRequest: data.tripRequest,
    setEditAddressInputMode: form.setEditAddressInputMode,
    setEditDepartureLocation: form.setEditDepartureLocation,
    setEditDepartureManualAddress: form.setEditDepartureManualAddress,
    setEditDepartureReference: form.setEditDepartureReference,
    setEditArrivalLocation: form.setEditArrivalLocation,
    setEditArrivalManualAddress: form.setEditArrivalManualAddress,
    setEditArrivalReference: form.setEditArrivalReference,
    setEditDepartureDateMin: form.setEditDepartureDateMin,
    setEditDepartureDateMax: form.setEditDepartureDateMax,
    setEditNumberOfSeats: form.setEditNumberOfSeats,
    requestedVehicleType: data.requestedVehicleType,
    setEditDescription: form.setEditDescription,
    setShowEditForm: form.setShowEditForm,
    shouldOpenScheduleEditor: data.shouldOpenScheduleEditor,
    overdueScheduleEditorOpenedRef: form.overdueScheduleEditorOpenedRef,
    currentUser: data.currentUser,
    editPickerRestorePendingRef: form.editPickerRestorePendingRef,
    editPickerTransitionTimerRef: form.editPickerTransitionTimerRef,
    setEditLocationPickerType: form.setEditLocationPickerType,
    setEditActivePicker: form.setEditActivePicker,
  });

  const passengerActions = useRequestPassengerActions({
    isUpdating: data.isUpdating,
    isEditVehicleOptionsLoading: validation.isEditVehicleOptionsLoading,
    showDialog: data.showDialog,
    id: data.id,
    editDepartureAddress: validation.editDepartureAddress,
    editArrivalAddress: validation.editArrivalAddress,
    editDepartureDateMin: form.editDepartureDateMin,
    editDepartureDateMax: form.editDepartureDateMax,
    parsedEditNumberOfSeats: validation.parsedEditNumberOfSeats,
    editSeatCapacity: validation.editSeatCapacity,
    isEditVehicleSelectionValid: validation.isEditVehicleSelectionValid,
    isIdentityVerified: data.isIdentityVerified,
    openEditIdentityVerification: validation.openEditIdentityVerification,
    parsedEditBudget: validation.parsedEditBudget,
    isEditBudgetValid: validation.isEditBudgetValid,
    updateTripRequest: data.updateTripRequest,
    editDepartureReference: form.editDepartureReference,
    editAddressInputMode: form.editAddressInputMode,
    editDepartureLocation: form.editDepartureLocation,
    editArrivalReference: form.editArrivalReference,
    editArrivalLocation: form.editArrivalLocation,
    editVehicleType: form.editVehicleType,
    editDescription: form.editDescription,
    setShowEditForm: form.setShowEditForm,
    refetch: data.refetch,
    tripRequest: data.tripRequest,
    cancelRequest: data.cancelRequest,
    goHome: data.goHome,
  });

  return {
    isLoading: data.isLoading,
    isFetchingRequest: data.isFetchingRequest,
    tripRequest: data.tripRequest,
    isOpeningAssignedTrip: data.isOpeningAssignedTrip,
    goHome: data.goHome,
    isError: data.isError,
    error: data.error,
    passengerTripId: data.passengerTripId,
    handleViewTrip: driverActions.handleViewTrip,
    refetch: data.refetch,
    routeCoordinates: form.routeCoordinates,
    canOpenAssignedTrip: availability.canOpenAssignedTrip,
    canStartAssignedTrip: availability.canStartAssignedTrip,
    canAcceptDirectly: availability.canAcceptDirectly,
    myOffer: availability.myOffer,
    isDriverAccount: data.isDriverAccount,
    isIdentityVerified: data.isIdentityVerified,
    compatibleActiveVehicles: data.compatibleActiveVehicles,
    requestedVehicleType: data.requestedVehicleType,
    isOwner: availability.isOwner,
    refreshing: data.refreshing,
    onRefresh: data.onRefresh,
    canEdit: availability.canEdit,
    canCancel: availability.canCancel,
    handleOpenEditForm: editor.handleOpenEditForm,
    isCancelling: data.isCancelling,
    handleCancelRequest: passengerActions.handleCancelRequest,
    handleStartTripFromRequest: driverActions.handleStartTripFromRequest,
    isStartingTripFromRequest: data.isStartingTripFromRequest,
    handleOpenDirectAcceptModal: driverActions.handleOpenDirectAcceptModal,
    isAcceptingTripRequest: data.isAcceptingTripRequest,
    isStartingTrip: data.isStartingTrip,
    openDriverOnboarding: data.openDriverOnboarding,
    checkIdentity: data.checkIdentity,
    showDirectAcceptModal: form.showDirectAcceptModal,
    closeDirectAcceptModal,
    directAcceptDepartureDate: availability.directAcceptDepartureDate,
    directAcceptRequiresPassengerKyc: form.directAcceptRequiresPassengerKyc,
    setDirectAcceptRequiresPassengerKyc: form.setDirectAcceptRequiresPassengerKyc,
    directAcceptVehicleId: form.directAcceptVehicleId,
    setDirectAcceptVehicleId: form.setDirectAcceptVehicleId,
    directAcceptVehicle: availability.directAcceptVehicle,
    areDirectOptionsExpanded: form.areDirectOptionsExpanded,
    setAreDirectOptionsExpanded: form.setAreDirectOptionsExpanded,
    openDirectRouteOverridePicker,
    directAcceptDepartureLocation: form.directAcceptDepartureLocation,
    directAcceptDepartureReference: form.directAcceptDepartureReference,
    setDirectAcceptDepartureReference: form.setDirectAcceptDepartureReference,
    directAcceptArrivalLocation: form.directAcceptArrivalLocation,
    directAcceptArrivalReference: form.directAcceptArrivalReference,
    setDirectAcceptArrivalReference: form.setDirectAcceptArrivalReference,
    canAcceptRequest: availability.canAcceptRequest,
    handleDirectAcceptTripRequest: driverActions.handleDirectAcceptTripRequest,
    showEditForm: form.showEditForm,
    setShowEditForm: form.setShowEditForm,
    editAddressInputMode: form.editAddressInputMode,
    setEditAddressInputMode: form.setEditAddressInputMode,
    editDepartureManualAddress: form.editDepartureManualAddress,
    setEditDepartureManualAddress: form.setEditDepartureManualAddress,
    editArrivalManualAddress: form.editArrivalManualAddress,
    setEditArrivalManualAddress: form.setEditArrivalManualAddress,
    openEditLocationPicker: editor.openEditLocationPicker,
    editDepartureAddress: validation.editDepartureAddress,
    editArrivalAddress: validation.editArrivalAddress,
    openEditDateOrTimePickerMin: schedule.openEditDateOrTimePickerMin,
    editDepartureDateMin: form.editDepartureDateMin,
    openEditDateOrTimePickerMax: schedule.openEditDateOrTimePickerMax,
    editDepartureDateMax: form.editDepartureDateMax,
    editScheduleError: validation.editScheduleError,
    editIosPickerModeMin: form.editIosPickerModeMin,
    handleEditIosPickerChangeMin: schedule.handleEditIosPickerChangeMin,
    editIosPickerModeMax: form.editIosPickerModeMax,
    handleEditIosPickerChangeMax: schedule.handleEditIosPickerChangeMax,
    editVehiclePriceMultiplier: validation.editVehiclePriceMultiplier,
    isEditVehicleOptionsLoading: validation.isEditVehicleOptionsLoading,
    editVehicleOptions: validation.editVehicleOptions,
    isEditVehicleOptionsError: validation.isEditVehicleOptionsError,
    retryEditVehicleOptions: validation.retryEditVehicleOptions,
    editVehicleType: form.editVehicleType,
    parsedEditNumberOfSeats: validation.parsedEditNumberOfSeats,
    handleSelectEditVehicle: editor.handleSelectEditVehicle,
    editNumberOfSeats: form.editNumberOfSeats,
    setEditNumberOfSeats: form.setEditNumberOfSeats,
    editMaxPricePerSeat: validation.editMaxPricePerSeat,
    setEditMaxPricePerSeat: validation.setEditMaxPricePerSeat,
    isEditBudgetValid: validation.isEditBudgetValid,
    parsedEditBudget: validation.parsedEditBudget,
    editSeatCapacity: validation.editSeatCapacity,
    openEditIdentityVerification: validation.openEditIdentityVerification,
    editDescription: form.editDescription,
    setEditDescription: form.setEditDescription,
    isEditFormValid: validation.isEditFormValid,
    handleUpdateRequest: passengerActions.handleUpdateRequest,
    isUpdating: data.isUpdating,
    editLocationPickerType: form.editLocationPickerType,
    editActivePicker: form.editActivePicker,
    restoreEditFormAfterLocationPicker: editor.restoreEditFormAfterLocationPicker,
    setEditDepartureLocation: form.setEditDepartureLocation,
    setEditArrivalLocation: form.setEditArrivalLocation,
    editDepartureLocation: form.editDepartureLocation,
    editArrivalLocation: form.editArrivalLocation,
    routeOverridePickerTarget: form.routeOverridePickerTarget,
    restoreDirectAcceptModalAfterLocationPicker,
    handleRouteOverrideSelected,
  };
}
