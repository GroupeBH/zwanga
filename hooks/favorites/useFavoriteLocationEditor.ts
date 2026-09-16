import { FavoriteLocationType, TYPE_LABELS } from '../../features/favorites/favoriteModel';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import type { FavoriteLocation } from '@/types';
import React, { useEffect } from 'react';

interface Params {
  setSelectedLocation: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setLocationName: React.Dispatch<React.SetStateAction<string>>;
  setLocationType: React.Dispatch<React.SetStateAction<FavoriteLocationType>>;
  setIsDefault: React.Dispatch<React.SetStateAction<boolean>>;
  setNotes: React.Dispatch<React.SetStateAction<string>>;
  setShowAddModal: React.Dispatch<React.SetStateAction<boolean>>;
  locationPickerOpenTimerRef: React.RefObject<NodeJS.Timeout | null>;
  setEditingLocation: React.Dispatch<React.SetStateAction<FavoriteLocation | null>>;
  setShowEditModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowLocationPicker: React.Dispatch<React.SetStateAction<boolean>>;
  setIsOpeningLocationPicker: React.Dispatch<React.SetStateAction<boolean>>;
  locationName: string;
  locationType: FavoriteLocationType;
}

export function useFavoriteLocationEditor({
  setSelectedLocation,
  setLocationName,
  setLocationType,
  setIsDefault,
  setNotes,
  setShowAddModal,
  locationPickerOpenTimerRef,
  setEditingLocation,
  setShowEditModal,
  setShowLocationPicker,
  setIsOpeningLocationPicker,
  locationName,
  locationType,
}: Params) {
  const handleAddLocation = () => {
    setSelectedLocation(null);
    setLocationName('');
    setLocationType('other');
    setIsDefault(false);
    setNotes('');
    setShowAddModal(true);
  };

  useEffect(() => {
    return () => {
      if (locationPickerOpenTimerRef.current) {
        clearTimeout(locationPickerOpenTimerRef.current);
      }
    };
  }, []);

  const handleEditLocation = (location: FavoriteLocation) => {
    setEditingLocation(location);
    setSelectedLocation({
      title: location.name,
      address: location.address,
      latitude: location.coordinates.latitude,
      longitude: location.coordinates.longitude,
    });
    setLocationName(location.name);
    setLocationType(location.type);
    setIsDefault(location.isDefault);
    setNotes(location.notes || '');
    setShowEditModal(true);
  };

  const handleLocationSelected = (location: MapLocationSelection) => {
    setSelectedLocation(location);
    setShowLocationPicker(false);
    setIsOpeningLocationPicker(false);
    if (!locationName.trim()) {
      // Suggérer un nom basé sur le type si aucun nom n'est entré
      setLocationName(location.title || TYPE_LABELS[locationType]);
    }
  };

  const handleLocationPickerClose = () => {
    if (locationPickerOpenTimerRef.current) {
      clearTimeout(locationPickerOpenTimerRef.current);
      locationPickerOpenTimerRef.current = null;
    }
    setIsOpeningLocationPicker(false);
    setShowLocationPicker(false);
  };

  return {
    handleAddLocation,
    handleEditLocation,
    handleLocationPickerClose,
    handleLocationSelected,
  };
}
