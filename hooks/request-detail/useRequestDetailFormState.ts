import { RouteOverridePickerTarget } from '../../features/request-detail/requestDetailModel';
import type { AddressInputMode } from '@/components/AddressEntryModeSelector';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import type { TripRequestVehicleType } from '@/types';
import { useEffect, useRef, useState } from 'react';

export function useRequestDetailFormState() {
  const [showEditForm, setShowEditForm] = useState(false);
  const [editDepartureLocation, setEditDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [editArrivalLocation, setEditArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [editDepartureManualAddress, setEditDepartureManualAddress] = useState('');
  const [editDepartureReference, setEditDepartureReference] = useState('');
  const [editArrivalManualAddress, setEditArrivalManualAddress] = useState('');
  const [editArrivalReference, setEditArrivalReference] = useState('');
  const [editAddressInputMode, setEditAddressInputMode] = useState<AddressInputMode>('map');
  const [editDepartureDateMin, setEditDepartureDateMin] = useState<Date | null>(null);
  const [editDepartureDateMax, setEditDepartureDateMax] = useState<Date | null>(null);
  const [editNumberOfSeats, setEditNumberOfSeats] = useState('');
  const [editVehicleType, setEditVehicleType] = useState<TripRequestVehicleType>('car');
  const [editDescription, setEditDescription] = useState('');
  const [editIosPickerModeMin, setEditIosPickerModeMin] = useState<'date' | 'time' | null>(null);
  const [editIosPickerModeMax, setEditIosPickerModeMax] = useState<'date' | 'time' | null>(null);
  const [editActivePicker, setEditActivePicker] = useState<'departure' | 'arrival' | null>(null);
  const [editLocationPickerType, setEditLocationPickerType] = useState<'departure' | 'arrival' | null>(null);
  const editPickerTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editPickerRestorePendingRef = useRef(false);
  const overdueScheduleEditorOpenedRef = useRef(false);
  const directPickerTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const directPickerRestorePendingRef = useRef(false);

  useEffect(() => () => {
    if (editPickerTransitionTimerRef.current) {
      clearTimeout(editPickerTransitionTimerRef.current);
    }
    if (directPickerTransitionTimerRef.current) {
      clearTimeout(directPickerTransitionTimerRef.current);
    }
  }, []);

  const [directAcceptVehicleId, setDirectAcceptVehicleId] = useState<string>('');
  const [showDirectAcceptModal, setShowDirectAcceptModal] = useState(false);
  const [directAcceptDepartureLocation, setDirectAcceptDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [directAcceptDepartureReference, setDirectAcceptDepartureReference] = useState('');
  const [directAcceptArrivalLocation, setDirectAcceptArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [directAcceptArrivalReference, setDirectAcceptArrivalReference] = useState('');
  const [routeOverridePickerTarget, setRouteOverridePickerTarget] = useState<RouteOverridePickerTarget | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[] | null>(null);
  const [, setIsLoadingRoute] = useState(false);
  const [areDirectOptionsExpanded, setAreDirectOptionsExpanded] = useState(false);
  const [directAcceptRequiresPassengerKyc, setDirectAcceptRequiresPassengerKyc] = useState(false);

  return {
    setDirectAcceptRequiresPassengerKyc,
    directAcceptVehicleId,
    setDirectAcceptVehicleId,
    setIsLoadingRoute,
    setRouteCoordinates,
    showDirectAcceptModal,
    setShowDirectAcceptModal,
    editAddressInputMode,
    editDepartureManualAddress,
    editDepartureLocation,
    editArrivalManualAddress,
    editArrivalLocation,
    editNumberOfSeats,
    showEditForm,
    editVehicleType,
    editDepartureReference,
    editArrivalReference,
    setShowEditForm,
    editDepartureDateMin,
    editDepartureDateMax,
    directPickerRestorePendingRef,
    directPickerTransitionTimerRef,
    setRouteOverridePickerTarget,
    routeOverridePickerTarget,
    setDirectAcceptDepartureLocation,
    setDirectAcceptArrivalLocation,
    setEditDepartureDateMin,
    setEditDepartureDateMax,
    setEditIosPickerModeMin,
    setEditIosPickerModeMax,
    editIosPickerModeMin,
    editIosPickerModeMax,
    directAcceptRequiresPassengerKyc,
    directAcceptDepartureLocation,
    directAcceptArrivalLocation,
    directAcceptDepartureReference,
    directAcceptArrivalReference,
    setAreDirectOptionsExpanded,
    setEditVehicleType,
    setEditAddressInputMode,
    setEditDepartureLocation,
    setEditDepartureManualAddress,
    setEditDepartureReference,
    setEditArrivalLocation,
    setEditArrivalManualAddress,
    setEditArrivalReference,
    setEditNumberOfSeats,
    setEditDescription,
    overdueScheduleEditorOpenedRef,
    editPickerRestorePendingRef,
    editPickerTransitionTimerRef,
    setEditLocationPickerType,
    setEditActivePicker,
    editDescription,
    routeCoordinates,
    areDirectOptionsExpanded,
    setDirectAcceptDepartureReference,
    setDirectAcceptArrivalReference,
    editLocationPickerType,
    editActivePicker,
  };
}
