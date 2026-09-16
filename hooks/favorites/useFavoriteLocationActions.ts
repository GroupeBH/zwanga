import { FavoriteLocationType } from '../../features/favorites/favoriteModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import {
  useGetFavoriteLocationsQuery,
  useCreateFavoriteLocationMutation,
  useUpdateFavoriteLocationMutation,
  useDeleteFavoriteLocationMutation,
} from '@/store/api/userApi';
import type { FavoriteLocation } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import React from 'react';

interface Params {
  selectedLocation: MapLocationSelection | null;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  locationName: string;
  editingLocation: FavoriteLocation | null;
  updateFavoriteLocation: ReturnType<typeof useUpdateFavoriteLocationMutation>[0];
  locationType: FavoriteLocationType;
  isDefault: boolean;
  notes: string;
  setShowEditModal: React.Dispatch<React.SetStateAction<boolean>>;
  createFavoriteLocation: ReturnType<typeof useCreateFavoriteLocationMutation>[0];
  setShowAddModal: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedLocation: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setLocationName: React.Dispatch<React.SetStateAction<string>>;
  setLocationType: React.Dispatch<React.SetStateAction<FavoriteLocationType>>;
  setIsDefault: React.Dispatch<React.SetStateAction<boolean>>;
  setNotes: React.Dispatch<React.SetStateAction<string>>;
  setEditingLocation: React.Dispatch<React.SetStateAction<FavoriteLocation | null>>;
  refetch: ReturnType<typeof useGetFavoriteLocationsQuery>['refetch'];
  deleteFavoriteLocation: ReturnType<typeof useDeleteFavoriteLocationMutation>[0];
}

export function useFavoriteLocationActions({
  selectedLocation,
  showDialog,
  locationName,
  editingLocation,
  updateFavoriteLocation,
  locationType,
  isDefault,
  notes,
  setShowEditModal,
  createFavoriteLocation,
  setShowAddModal,
  setSelectedLocation,
  setLocationName,
  setLocationType,
  setIsDefault,
  setNotes,
  setEditingLocation,
  refetch,
  deleteFavoriteLocation,
}: Params) {
  const handleSaveLocation = async () => {
    if (!selectedLocation) {
      showDialog({
        variant: 'warning',
        title: 'Lieu requis',
        message: 'Veuillez sélectionner un lieu sur la carte.',
      });
      return;
    }

    if (!locationName.trim()) {
      showDialog({
        variant: 'warning',
        title: 'Nom requis',
        message: 'Veuillez entrer un nom pour ce lieu.',
      });
      return;
    }

    try {
      if (editingLocation) {
        // Mise à jour
        await updateFavoriteLocation({
          id: editingLocation.id,
          name: locationName.trim(),
          address: selectedLocation.address,
          coordinates: {
            latitude: selectedLocation.latitude,
            longitude: selectedLocation.longitude,
          },
          type: locationType,
          isDefault,
          notes: notes.trim() || undefined,
        }).unwrap();

        showDialog({
          variant: 'success',
          title: 'Lieu favori modifié',
          message: 'Votre lieu favori a été modifié avec succès.',
        });
        setShowEditModal(false);
      } else {
        // Création
        await createFavoriteLocation({
          name: locationName.trim(),
          address: selectedLocation.address,
          coordinates: {
            latitude: selectedLocation.latitude,
            longitude: selectedLocation.longitude,
          },
          type: locationType,
          isDefault,
          notes: notes.trim() || undefined,
        }).unwrap();

        showDialog({
          variant: 'success',
          title: 'Lieu favori ajouté',
          message: 'Votre lieu favori a été ajouté avec succès.',
        });
        setShowAddModal(false);
      }

      // Réinitialiser les champs
      setSelectedLocation(null);
      setLocationName('');
      setLocationType('other');
      setIsDefault(false);
      setNotes('');
      setEditingLocation(null);
      refetch();
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(error, 'Impossible de sauvegarder le lieu favori.'),
      });
    }
  };

  const handleDeleteLocation = async (location: FavoriteLocation) => {
    showDialog({
      variant: 'warning',
      title: 'Supprimer le lieu favori',
      message: `Êtes-vous sûr de vouloir supprimer "${location.name}" ?`,
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Supprimer',
          variant: 'danger',
          onPress: async () => {
            try {
              await deleteFavoriteLocation(location.id).unwrap();
              showDialog({
                variant: 'success',
                title: 'Lieu favori supprimé',
                message: 'Votre lieu favori a été supprimé avec succès.',
              });
              refetch();
            } catch (error: any) {
              showDialog({
                variant: 'danger',
                title: 'Erreur',
                message: getApiErrorMessage(error, 'Impossible de supprimer le lieu favori.'),
              });
            }
          },
        },
      ],
    });
  };

  return {
    handleDeleteLocation,
    handleSaveLocation,
  };
}
