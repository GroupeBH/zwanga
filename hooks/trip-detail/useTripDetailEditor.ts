import { useTripDetailEditLabels } from './useTripDetailEditLabels';
import { useTripDetailData } from './useTripDetailData';
import { useTripDetailEditState } from './useTripDetailEditState';
import { useTripDetailEditSubmission } from './useTripDetailEditSubmission';
import { useTripDetailEditRoute } from './useTripDetailEditRoute';
import { useTripDetailEditorLifecycle } from './useTripDetailEditorLifecycle';
import { useTripDetailEditSchedule } from './useTripDetailEditSchedule';

interface Params {
  data: ReturnType<typeof useTripDetailData>;
}

export function useTripDetailEditor({
  data,
}: Params) {
  const edit = useTripDetailEditState();

  const editSchedule = useTripDetailEditSchedule({
    editDateTime: edit.editDateTime,
    setEditDateTime: edit.setEditDateTime,
    setIosPickerMode: edit.setIosPickerMode,
    iosPickerMode: edit.iosPickerMode,
  });

  const editor = useTripDetailEditorLifecycle({
    trip: data.trip,
    isTripDriver: data.isTripDriver,
    setEditSeats: edit.setEditSeats,
    setEditPrice: edit.setEditPrice,
    setEditRequiresPassengerKyc: edit.setEditRequiresPassengerKyc,
    setEditDateTime: edit.setEditDateTime,
    getDefaultFutureDate: editSchedule.getDefaultFutureDate,
    setEditDepartureSelection: edit.setEditDepartureSelection,
    setEditArrivalSelection: edit.setEditArrivalSelection,
    setEditDepartureManualAddress: edit.setEditDepartureManualAddress,
    setEditArrivalManualAddress: edit.setEditArrivalManualAddress,
    setEditRouteMode: edit.setEditRouteMode,
    setEditRoutePickerTarget: edit.setEditRoutePickerTarget,
    setEditVehicleId: edit.setEditVehicleId,
    setEditStep: edit.setEditStep,
    setEditTripModalVisible: edit.setEditTripModalVisible,
    setIosPickerMode: edit.setIosPickerMode,
    openEditModalRef: edit.openEditModalRef,
    shouldOpenEditFromParams: data.shouldOpenEditFromParams,
    handledOpenEditParamKeyRef: edit.handledOpenEditParamKeyRef,
    isFocused: data.isFocused,
    editTripModalVisible: edit.editTripModalVisible,
    openEditParamKey: data.openEditParamKey,
    showDialog: data.showDialog,
  });

  const editRoute = useTripDetailEditRoute({
    setEditDepartureSelection: edit.setEditDepartureSelection,
    editArrivalSelection: edit.editArrivalSelection,
    setEditArrivalSelection: edit.setEditArrivalSelection,
    editDepartureSelection: edit.editDepartureSelection,
    setEditDepartureManualAddress: edit.setEditDepartureManualAddress,
    editArrivalManualAddress: edit.editArrivalManualAddress,
    setEditArrivalManualAddress: edit.setEditArrivalManualAddress,
    editDepartureManualAddress: edit.editDepartureManualAddress,
    setEditTripModalVisible: edit.setEditTripModalVisible,
    setEditRoutePickerTarget: edit.setEditRoutePickerTarget,
    geocodeManualAddress: edit.geocodeManualAddress,
    editRouteMode: edit.editRouteMode,
    showDialog: data.showDialog,
    setIosPickerMode: edit.setIosPickerMode,
    setEditStep: edit.setEditStep,
  });

  const editSubmission = useTripDetailEditSubmission({
    trip: data.trip,
    editDateTime: edit.editDateTime,
    isTripDriver: data.isTripDriver,
    showDialog: data.showDialog,
    editVehicleId: edit.editVehicleId,
    editSeats: edit.editSeats,
    editPrice: edit.editPrice,
    editRouteMode: edit.editRouteMode,
    editDepartureManualAddress: edit.editDepartureManualAddress,
    editDepartureSelection: edit.editDepartureSelection,
    editArrivalManualAddress: edit.editArrivalManualAddress,
    editArrivalSelection: edit.editArrivalSelection,
    resolveManualAddressSelection: editRoute.resolveManualAddressSelection,
    setEditDepartureSelection: edit.setEditDepartureSelection,
    setEditArrivalSelection: edit.setEditArrivalSelection,
    editRequiresPassengerKyc: edit.editRequiresPassengerKyc,
    updateTripMutation: edit.updateTripMutation,
    closeEditModal: editor.closeEditModal,
    refetchTrip: data.refetchTrip,
  });

  const editLabels = useTripDetailEditLabels({
    editDateTime: edit.editDateTime,
    editRouteMode: edit.editRouteMode,
    editDepartureManualAddress: edit.editDepartureManualAddress,
    editDepartureSelection: edit.editDepartureSelection,
    editArrivalManualAddress: edit.editArrivalManualAddress,
    editArrivalSelection: edit.editArrivalSelection,
    insets: data.insets,
  });

  return {
    editRoute,
    editor,
    edit,
    editLabels,
    editSchedule,
    editSubmission,
  };
}
