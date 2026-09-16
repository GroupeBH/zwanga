import { EditTripStep } from '../../features/trip-detail/tripDetailModel';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import { useUpdateTripMutation } from '@/store/api/tripApi';
import { useGetVehiclesQuery } from '@/store/api/vehicleApi';
import { useMemo, useRef, useState } from 'react';



export function useTripDetailEditState() {
  const [updateTripMutation, { isLoading: isSavingTrip }] = useUpdateTripMutation();
  const [geocodeManualAddress] = useGeocodeMutation();
  const { data: userVehicles = [], isLoading: editVehiclesLoading } = useGetVehiclesQuery();
  const activeEditVehicles = useMemo(
    () => userVehicles.filter((vehicle) => vehicle.isActive !== false),
    [userVehicles],
  );
  const [editTripModalVisible, setEditTripModalVisible] = useState(false);
  const [editStep, setEditStep] = useState<EditTripStep>(1);
  const [editSeats, setEditSeats] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editRequiresPassengerKyc, setEditRequiresPassengerKyc] = useState(false);
  const [editDateTime, setEditDateTime] = useState<Date | null>(null);
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);
  const [editRouteMode, setEditRouteMode] = useState<'map' | 'manual'>('map');
  const [editDepartureSelection, setEditDepartureSelection] = useState<MapLocationSelection | null>(null);
  const [editArrivalSelection, setEditArrivalSelection] = useState<MapLocationSelection | null>(null);
  const [editDepartureManualAddress, setEditDepartureManualAddress] = useState('');
  const [editArrivalManualAddress, setEditArrivalManualAddress] = useState('');
  const [editRoutePickerTarget, setEditRoutePickerTarget] = useState<'departure' | 'arrival' | null>(null);
  const [editVehicleId, setEditVehicleId] = useState<string | null>(null);
  const openEditModalRef = useRef<() => void>(() => undefined);
  const handledOpenEditParamKeyRef = useRef<string | null>(null);

  return {
    editDateTime,
    setEditDateTime,
    setIosPickerMode,
    iosPickerMode,
    setEditSeats,
    setEditPrice,
    setEditRequiresPassengerKyc,
    setEditDepartureSelection,
    setEditArrivalSelection,
    setEditDepartureManualAddress,
    setEditArrivalManualAddress,
    setEditRouteMode,
    setEditRoutePickerTarget,
    setEditVehicleId,
    setEditStep,
    setEditTripModalVisible,
    openEditModalRef,
    handledOpenEditParamKeyRef,
    editTripModalVisible,
    editArrivalSelection,
    editDepartureSelection,
    editArrivalManualAddress,
    editDepartureManualAddress,
    geocodeManualAddress,
    editRouteMode,
    editVehicleId,
    editSeats,
    editPrice,
    editRequiresPassengerKyc,
    updateTripMutation,
    editStep,
    editVehiclesLoading,
    activeEditVehicles,
    isSavingTrip,
    editRoutePickerTarget,
  };
}
