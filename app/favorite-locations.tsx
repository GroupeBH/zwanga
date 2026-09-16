import { useFavoriteLocationEditor } from '../hooks/favorites/useFavoriteLocationEditor';
import { useFavoriteLocationActions } from '../hooks/favorites/useFavoriteLocationActions';
import { FavoriteLocationType, TYPE_LABELS, TYPE_ICONS } from '../features/favorites/favoriteModel';
import { styles } from '../features/screen-styles/app/favorite-locations/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { useDialog } from '@/components/ui/DialogProvider';
import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { Colors } from '@/constants/styles';
import {
  useGetFavoriteLocationsQuery,
  useCreateFavoriteLocationMutation,
  useUpdateFavoriteLocationMutation,
  useDeleteFavoriteLocationMutation,
} from '@/store/api/userApi';
import type { FavoriteLocation } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from '@/utils/reanimated';

export default function FavoriteLocationsScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const { data: favoriteLocations = [], isLoading, refetch } = useGetFavoriteLocationsQuery();
  const [createFavoriteLocation, { isLoading: isCreating }] = useCreateFavoriteLocationMutation();
  const [updateFavoriteLocation, { isLoading: isUpdating }] = useUpdateFavoriteLocationMutation();
  const [deleteFavoriteLocation, { isLoading: isDeleting }] = useDeleteFavoriteLocationMutation();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [isOpeningLocationPicker, setIsOpeningLocationPicker] = useState(false);
  const [editingLocation, setEditingLocation] = useState<FavoriteLocation | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<MapLocationSelection | null>(null);
  const [locationName, setLocationName] = useState('');
  const [locationType, setLocationType] = useState<FavoriteLocationType>('other');
  const [isDefault, setIsDefault] = useState(false);
  const [notes, setNotes] = useState('');
  const locationPickerOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { handleAddLocation, handleEditLocation, handleLocationPickerClose, handleLocationSelected } = useFavoriteLocationEditor({
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
  });

  const { handleDeleteLocation, handleSaveLocation } = useFavoriteLocationActions({
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
  });

  const groupedLocations = favoriteLocations.reduce(
    (acc, location) => {
      if (!acc[location.type]) {
        acc[location.type] = [];
      }
      acc[location.type].push(location);
      return acc;
    },
    {} as Record<FavoriteLocationType, FavoriteLocation[]>
  );
  const isFormModalVisible =
    (showAddModal || showEditModal) && !showLocationPicker && !isOpeningLocationPicker;

  const openLocationPicker = () => {
    if (locationPickerOpenTimerRef.current) {
      clearTimeout(locationPickerOpenTimerRef.current);
      locationPickerOpenTimerRef.current = null;
    }
    setShowLocationPicker(true);
    setIsOpeningLocationPicker(false);
  };

  const handleOpenLocationPicker = () => {
    if (showLocationPicker || isOpeningLocationPicker) {
      return;
    }

    setIsOpeningLocationPicker(true);

    if (Platform.OS === 'ios') {
      return;
    }

    if (locationPickerOpenTimerRef.current) {
      clearTimeout(locationPickerOpenTimerRef.current);
    }
    locationPickerOpenTimerRef.current = setTimeout(() => {
      openLocationPicker();
    }, 250);
  };

  const handleFormModalDismiss = () => {
    if (Platform.OS === 'ios' && isOpeningLocationPicker && !showLocationPicker) {
      openLocationPicker();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Lieux favoris</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleAddLocation}>
          <Ionicons name="add" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loaderText}>Chargement des lieux favoris...</Text>
          </View>
        ) : favoriteLocations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="location-outline" size={48} color={Colors.gray[400]} />
            </View>
            <Text style={styles.emptyTitle}>Aucun lieu favori</Text>
            <Text style={styles.emptyDescription}>
              Ajoutez vos lieux fréquents pour les retrouver rapidement lors de la création d&apos;un trajet.
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={handleAddLocation}>
              <Ionicons name="add-circle" size={20} color={Colors.white} />
              <Text style={styles.emptyButtonText}>Ajouter un lieu favori</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {(['home', 'work', 'other'] as FavoriteLocationType[]).map((type) => {
              const locations = groupedLocations[type] || [];
              if (locations.length === 0) return null;

              return (
                <Animated.View key={type} entering={FadeInDown.delay(100)} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionHeaderLeft}>
                      <Ionicons name={TYPE_ICONS[type]} size={18} color={Colors.gray[700]} />
                      <Text style={styles.sectionTitle}>{TYPE_LABELS[type]}</Text>
                    </View>
                    <Text style={styles.sectionCount}>{locations.length}</Text>
                  </View>
                  {locations.map((location, index) => (
                    <TouchableOpacity
                      key={location.id}
                      style={[
                        styles.locationCard,
                        index !== locations.length - 1 && styles.locationCardBorder,
                      ]}
                      onPress={() => handleEditLocation(location)}
                    >
                      <View style={styles.locationContent}>
                        <View style={styles.locationHeader}>
                          <Text style={styles.locationName}>
                            {location.name}
                            {location.isDefault && (
                              <Text style={styles.defaultBadge}> • Par défaut</Text>
                            )}
                          </Text>
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              handleDeleteLocation(location);
                            }}
                            disabled={isDeleting}
                          >
                            <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.locationAddress} numberOfLines={2}>
                          {location.address}
                        </Text>
                        {location.notes && (
                          <Text style={styles.locationNotes} numberOfLines={1}>
                            {location.notes}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </Animated.View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Modal pour ajouter/modifier un lieu favori */}
      <Modal
        visible={isFormModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onDismiss={handleFormModalDismiss}
        onRequestClose={() => {
          setShowAddModal(false);
          setShowEditModal(false);
        }}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowAddModal(false);
                setShowEditModal(false);
              }}
            >
              <Ionicons name="close" size={24} color={Colors.gray[900]} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingLocation ? 'Modifier le lieu favori' : 'Ajouter un lieu favori'}
            </Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView
            style={styles.modalScrollView}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>Sélectionner le lieu *</Text>
              <TouchableOpacity
                style={styles.locationPickerButton}
                onPress={handleOpenLocationPicker}
              >
                <Ionicons name="location" size={20} color={Colors.primary} />
                <View style={styles.locationPickerContent}>
                  {selectedLocation ? (
                    <>
                      <Text style={styles.locationPickerTitle}>{selectedLocation.title}</Text>
                      <Text style={styles.locationPickerAddress} numberOfLines={1}>
                        {selectedLocation.address}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.locationPickerPlaceholder}>
                      Touchez pour sélectionner un lieu sur la carte
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>Nom du lieu *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: Domicile, Bureau, Maison de maman"
                value={locationName}
                onChangeText={setLocationName}
                placeholderTextColor={Colors.gray[400]}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>Type</Text>
              <View style={styles.typeButtons}>
                {(['home', 'work', 'other'] as FavoriteLocationType[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeButton,
                      locationType === type && styles.typeButtonActive,
                    ]}
                    onPress={() => setLocationType(type)}
                  >
                    <Ionicons
                      name={TYPE_ICONS[type]}
                      size={18}
                      color={locationType === type ? Colors.white : Colors.gray[700]}
                    />
                    <Text
                      style={[
                        styles.typeButtonText,
                        locationType === type && styles.typeButtonTextActive,
                      ]}
                    >
                      {TYPE_LABELS[type]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formSection}>
              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => setIsDefault(!isDefault)}
              >
                <View style={[styles.checkbox, isDefault && styles.checkboxChecked]}>
                  {isDefault && <Ionicons name="checkmark" size={16} color={Colors.white} />}
                </View>
                <Text style={styles.checkboxLabel}>
                  Définir comme lieu par défaut pour ce type
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>Notes (optionnel)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Ajoutez des notes sur ce lieu..."
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                placeholderTextColor={Colors.gray[400]}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[
                styles.saveButton,
                (!selectedLocation || !locationName.trim() || isCreating || isUpdating) &&
                  styles.saveButtonDisabled,
              ]}
              onPress={handleSaveLocation}
              disabled={!selectedLocation || !locationName.trim() || isCreating || isUpdating}
            >
              {isCreating || isUpdating ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Text style={styles.saveButtonText}>
                    {editingLocation ? 'Modifier' : 'Ajouter'}
                  </Text>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* LocationPickerModal pour la sélection */}
      <LocationPickerModal
        visible={showLocationPicker}
        onClose={handleLocationPickerClose}
        onSelect={handleLocationSelected}
        title="Choisir un lieu"
        initialLocation={selectedLocation}
      />
    </SafeAreaView>
  );
}



