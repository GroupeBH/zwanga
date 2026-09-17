import { useDialog } from '@/components/ui/DialogProvider';
import { MUTATION_RECONCILIATION_DELAYS_MS } from '@/constants/network';
import {
  vehicleMatchesFormData,
  wait
} from '@/features/profile/profileModel';
import {
  useCreateVehicleMutation,
  useDeleteVehicleMutation,
  useUpdateVehicleMutation
} from '@/store/api/vehicleApi';
import type {
  TripRequestVehicleType,
  Vehicle
} from '@/types';
import {
  createBecomeDriverAction,
  getApiErrorMessage,
  isAmbiguousTransportError,
  isDriverRequiredError,
} from '@/utils/errorHelpers';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { isValidVehiclePlate, normalizeVehiclePlate, VEHICLE_PLATE_FORMAT_MESSAGE } from '@/utils/vehiclePlate';
import type { useProfileData } from './useProfileData';

type Props = Pick<ReturnType<typeof useProfileData>,
  | 'refetchProfile'
  | 'refetchVehicles'
  | 'vehicleList'
>;

export function useProfileVehicles({
  refetchProfile,
  refetchVehicles,
  vehicleList,
}: Props) {
  const router = useRouter();

  const { showDialog } = useDialog();

  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);

  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);

  const [vehicleFormError, setVehicleFormError] = useState<string | null>(null);

  const [vehicleType, setVehicleType] = useState<TripRequestVehicleType | null>(null);

  const [vehicleBrand, setVehicleBrand] = useState('');

  const [vehicleModel, setVehicleModel] = useState('');

  const [vehicleColor, setVehicleColor] = useState('');

  const [vehiclePlate, setVehiclePlate] = useState('');

  const [createVehicle, { isLoading: creatingVehicle }] = useCreateVehicleMutation();

  const [updateVehicle, { isLoading: updatingVehicle }] = useUpdateVehicleMutation();

  const [deleteVehicle, { isLoading: deletingVehicle }] = useDeleteVehicleMutation();

  const resetVehicleForm = useCallback(() => {
    setEditingVehicleId(null);
    setVehicleFormError(null);
    setVehicleType(null);
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleColor('');
    setVehiclePlate('');
  }, []);

  const closeVehicleModal = useCallback(() => {
    setVehicleModalVisible(false);
    resetVehicleForm();
  }, [resetVehicleForm]);

  const openCreateVehicleModal = useCallback(() => {
    resetVehicleForm();
    setVehicleModalVisible(true);
  }, [resetVehicleForm]);

  const openEditVehicleModal = useCallback((vehicle: Vehicle) => {
    setEditingVehicleId(vehicle.id);
    setVehicleFormError(null);
    setVehicleType(vehicle.type);
    setVehicleBrand(vehicle.brand);
    setVehicleModel(vehicle.model);
    setVehicleColor(vehicle.color);
    setVehiclePlate(normalizeVehiclePlate(vehicle.licensePlate));
    setVehicleModalVisible(true);
  }, []);

  const vehicleModalCopy = editingVehicleId
    ? {
      title: 'Modifier le v\u00e9hicule',
      subtitle: 'Mettez à jour les informations visibles par vos passagers.',
    }
    : {
      title: 'Ajouter un v\u00e9hicule',
      subtitle: 'Indiquez les d\u00e9tails exacts de votre v\u00e9hicule pour rassurer vos passagers.',
    };

  const handleVehicleBrandChange = useCallback((text: string) => {
    setVehicleBrand(text);
    setVehicleFormError(null);
  }, []);

  const handleVehicleModelChange = useCallback((text: string) => {
    setVehicleModel(text);
    setVehicleFormError(null);
  }, []);

  const handleVehicleColorChange = useCallback((text: string) => {
    setVehicleColor(text);
    setVehicleFormError(null);
  }, []);

  const handleVehiclePlateChange = useCallback((text: string) => {
    setVehiclePlate(normalizeVehiclePlate(text));
    setVehicleFormError(null);
  }, []);

  const reconcileVehicleMutation = useCallback(
    async (isConfirmed: (refreshedVehicles: Vehicle[]) => boolean) => {
      for (const delayMs of MUTATION_RECONCILIATION_DELAYS_MS) {
        if (delayMs > 0) {
          await wait(delayMs);
        }

        try {
          const result = await refetchVehicles();
          if (Array.isArray(result.data) && isConfirmed(result.data)) {
            return true;
          }
        } catch {
          // Preserve the original mutation error when verification also fails.
        }
      }

      return false;
    },
    [refetchVehicles],
  );

  const handleSaveVehicle = async () => {
    if (!vehicleType || !vehicleBrand.trim() || !vehicleModel.trim() || !vehicleColor.trim() || !vehiclePlate.trim()) {
      setVehicleFormError('Choisissez le type et renseignez la marque, le modèle, la couleur et la plaque.');
      return;
    }
    if (!isValidVehiclePlate(vehiclePlate)) {
      setVehicleFormError(VEHICLE_PLATE_FORMAT_MESSAGE);
      return;
    }

    setVehicleFormError(null);
    const isEditing = editingVehicleId !== null;

    try {
      const vehicleData = {
        type: vehicleType,
        brand: vehicleBrand.trim(),
        model: vehicleModel.trim(),
        color: vehicleColor.trim(),
        licensePlate: normalizeVehiclePlate(vehiclePlate),
      };

      if (editingVehicleId) {
        await updateVehicle({
          id: editingVehicleId,
          data: vehicleData,
        }).unwrap();
      } else {
        const matchingVehicleIdsBeforeCreation = new Set(
          vehicleList.filter((vehicle) => vehicleMatchesFormData(vehicle, vehicleData)).map((vehicle) => vehicle.id),
        );

        try {
          await createVehicle(vehicleData).unwrap();
        } catch (error: any) {
          if (!isAmbiguousTransportError(error)) {
            throw error;
          }

          const wasCreatedDespiteTransportError = await reconcileVehicleMutation((refreshedVehicles) =>
            refreshedVehicles.some(
              (vehicle) =>
                !matchingVehicleIdsBeforeCreation.has(vehicle.id) && vehicleMatchesFormData(vehicle, vehicleData),
            ),
          );

          if (!wasCreatedDespiteTransportError) {
            throw error;
          }
        }
      }

      closeVehicleModal();
      void Promise.allSettled([refetchVehicles(), refetchProfile()]);
      showDialog({
        variant: 'success',
        title: isEditing ? 'Véhicule modifié' : 'V\u00e9hicule ajout\u00e9',
        message: isEditing
          ? 'Les informations du véhicule ont été mises à jour.'
          : 'Votre v\u00e9hicule est maintenant disponible dans votre profil.',
      });
    } catch (error: any) {
      const message = getApiErrorMessage(
        error,
        isEditing
          ? 'Impossible de modifier le véhicule pour le moment.'
          : "Impossible d'ajouter le véhicule pour le moment.",
      );
      const isDriverError = isDriverRequiredError(error);

      setVehicleFormError(message);
      if (isDriverError) {
        showDialog({
          variant: 'danger',
          title: 'Action requise',
          message,
          actions: [{ label: 'Fermer', variant: 'ghost' }, createBecomeDriverAction(router)],
        });
      }
    }
  };

  const handleDeleteVehicle = useCallback(
    (vehicle: Vehicle) => {
      showDialog({
        variant: 'warning',
        title: 'Supprimer le véhicule',
        message: `Êtes-vous sûr de vouloir supprimer ${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate}) ? Cette action est irréversible.`,
        actions: [
          { label: 'Annuler', variant: 'ghost' },
          {
            label: 'Supprimer',
            variant: 'primary',
            onPress: async () => {
              try {
                try {
                  await deleteVehicle(vehicle.id).unwrap();
                } catch (error: any) {
                  if (!isAmbiguousTransportError(error)) {
                    throw error;
                  }

                  const wasDeletedDespiteTransportError = await reconcileVehicleMutation(
                    (refreshedVehicles) => !refreshedVehicles.some(({ id }) => id === vehicle.id),
                  );

                  if (!wasDeletedDespiteTransportError) {
                    throw error;
                  }
                }

                void Promise.allSettled([refetchVehicles(), refetchProfile()]);
                showDialog({
                  variant: 'success',
                  title: 'Véhicule supprimé',
                  message: 'Le véhicule a été supprimé avec succès.',
                });
              } catch (error: any) {
                const message = getApiErrorMessage(error, 'Impossible de supprimer le véhicule pour le moment.');
                const isDriverError = isDriverRequiredError(error);

                showDialog({
                  variant: 'danger',
                  title: 'Erreur',
                  message,
                  actions: isDriverError
                    ? [{ label: 'Fermer', variant: 'ghost' }, createBecomeDriverAction(router)]
                    : undefined,
                });
              }
            },
          },
        ],
      });
    },
    [deleteVehicle, reconcileVehicleMutation, refetchProfile, refetchVehicles, router, showDialog],
  );
  return {
    closeVehicleModal,
    creatingVehicle,
    deletingVehicle,
    editingVehicleId,
    handleDeleteVehicle,
    handleSaveVehicle,
    handleVehicleBrandChange,
    handleVehicleColorChange,
    handleVehicleModelChange,
    handleVehiclePlateChange,
    openCreateVehicleModal,
    openEditVehicleModal,
    setVehicleFormError,
    setVehicleType,
    updatingVehicle,
    vehicleBrand,
    vehicleColor,
    vehicleFormError,
    vehicleModalCopy,
    vehicleModalVisible,
    vehicleModel,
    vehiclePlate,
    vehicleType,
  };
}
