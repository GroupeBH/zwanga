import { isUserDriver } from '../../features/publish/publishModel';
import { useGetProfileSummaryQuery } from '@/store/api/userApi';
import { useCreateVehicleMutation, useGetVehiclesQuery } from '@/store/api/vehicleApi';
import type { TripRequestVehicleType, Vehicle } from '@/types';
import { useEffect, useMemo, useState } from 'react';



export function usePublishVehicleState() {
  const {
    data: profileSummary,
    refetch: refetchProfile,
    isLoading: isLoadingProfile,
    isFetching: isFetchingProfile,
  } = useGetProfileSummaryQuery();
  const user = profileSummary?.user;
  const isDriver = useMemo(() => isUserDriver(user), [user]);
  const [showDriverRequiredModal, setShowDriverRequiredModal] = useState(false);

  const {
    data: vehicles = [],
    refetch: refetchVehicles,
    isLoading: isLoadingVehicles,
  } = useGetVehiclesQuery(undefined, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });

  const [createdVehicle, setCreatedVehicle] = useState<Vehicle | null>(null);

  // Keep the POST response visible while the profile and vehicle caches refresh.
  const activeVehicles = useMemo(() => {
    const vehiclesById = new Map<string, Vehicle>();

    if (createdVehicle && createdVehicle.isActive !== false) {
      vehiclesById.set(createdVehicle.id, createdVehicle);
    }

    vehicles.forEach((vehicle) => {
      if (vehicle.isActive !== false) {
        vehiclesById.set(vehicle.id, vehicle);
      }
    });

    return Array.from(vehiclesById.values());
  }, [createdVehicle, vehicles]);

  const [createVehicle, { isLoading: isCreatingVehicle }] = useCreateVehicleMutation();

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [vehicleType, setVehicleType] = useState<TripRequestVehicleType | null>(null);
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehicleLicensePlate, setVehicleLicensePlate] = useState('');
  const [vehicleFormError, setVehicleFormError] = useState<string | null>(null);
  const [vehicleCreationMessage, setVehicleCreationMessage] = useState<string | null>(null);
  const [isFinalizingVehicleCreation, setIsFinalizingVehicleCreation] = useState(false);

  useEffect(() => {
    if (activeVehicles.length === 0) {
      if (selectedVehicleId !== null) {
        setSelectedVehicleId(null);
      }
      return;
    }

    const currentSelectionStillValid = selectedVehicleId
      ? activeVehicles.some((vehicle) => vehicle.id === selectedVehicleId)
      : false;

    if (currentSelectionStillValid) {
      return;
    }

    const preferredVehicleId =
      user?.vehicle?.id && activeVehicles.some((vehicle) => vehicle.id === user.vehicle?.id)
        ? user.vehicle.id
        : activeVehicles[0].id;

    setSelectedVehicleId(preferredVehicleId);
  }, [activeVehicles, selectedVehicleId, user?.vehicle?.id]);

  return {
    setVehicleType,
    setVehicleBrand,
    setVehicleModel,
    setVehicleColor,
    setVehicleLicensePlate,
    setShowVehicleForm,
    setVehicleFormError,
    setIsFinalizingVehicleCreation,
    setVehicleCreationMessage,
    vehicleType,
    vehicleBrand,
    vehicleModel,
    vehicleColor,
    vehicleLicensePlate,
    createVehicle,
    setCreatedVehicle,
    setSelectedVehicleId,
    refetchProfile,
    refetchVehicles,
    selectedVehicleId,
    isDriver,
    createdVehicle,
    isLoadingProfile,
    isFetchingProfile,
    user,
    setShowDriverRequiredModal,
    activeVehicles,
    vehicleCreationMessage,
    isLoadingVehicles,
    showDriverRequiredModal,
    showVehicleForm,
    isCreatingVehicle,
    isFinalizingVehicleCreation,
    vehicleFormError,
  };
}
