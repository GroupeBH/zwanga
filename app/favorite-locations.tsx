import { useDialog } from '@/components/ui/DialogProvider';
import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useGetFavoriteLocationsQuery,
  useCreateFavoriteLocationMutation,
  useUpdateFavoriteLocationMutation,
  useDeleteFavoriteLocationMutation,
} from '@/store/api/userApi';
import type { FavoriteLocation } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

type FavoriteLocationType = 'home' | 'work' | 'other';

const TYPE_LABELS: Record<FavoriteLocationType, string> = {
  home: 'Domicile',
  work: 'Bureau',
  other: 'Autre',
};

const TYPE_ICONS: Record<FavoriteLocationType, keyof typeof Ionicons.glyphMap> = {
  home: 'home',
  work: 'briefcase',
  other: 'location',
};

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
  const [editingLocation, setEditingLocation] = useState<FavoriteLocation | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<MapLocationSelection | null>(null);
  const [locationName, setLocationName] = useState('');
  const [locationType, setLocationType] = useState<FavoriteLocationType>('other');
  const [isDefault, setIsDefault] = useState(false);
  const [notes, setNotes] = useState('');

  const handleAddLocation = () => {
    setSelectedLocation(null);
    setLocationName('');
    setLocationType('other');
    setIsDefault(false);
    setNotes('');
    setShowAddModal(true);
  };

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
    if (!locationName.trim()) {
      // Suggérer un nom basé sur le type si aucun nom n'est entré
      setLocationName(location.title || TYPE_LABELS[locationType]);
    }
  };

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
        message: error?.data?.message || 'Impossible de sauvegarder le lieu favori.',
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
                message: error?.data?.message || 'Impossible de supprimer le lieu favori.',
              });
            }
          },
        },
      ],
    });
  };

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
              Ajoutez vos lieux fréquents pour les retrouver rapidement lors de la création d'un trajet.
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
        visible={showAddModal || showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
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

          <ScrollView style={styles.modalScrollView} contentContainerStyle={styles.modalContent}>
            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>Sélectionner le lieu *</Text>
              <TouchableOpacity
                style={styles.locationPickerButton}
                onPress={() => setShowLocationPicker(true)}
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
        onClose={() => setShowLocationPicker(false)}
        onSelect={handleLocationSelected}
        title="Choisir un lieu"
        initialLocation={selectedLocation}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  addButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: Spacing.xl,
  },
  loaderContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  loaderText: {
    marginTop: Spacing.md,
    color: Colors.gray[600],
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
  },
  emptyDescription: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    textAlign: 'center',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  emptyButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.base,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  sectionCount: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  locationCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  locationCardBorder: {
    marginBottom: Spacing.sm,
  },
  locationContent: {
    flex: 1,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  locationName: {
    flex: 1,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  defaultBadge: {
    fontSize: FontSizes.sm,
    color: Colors.secondary,
    fontWeight: FontWeights.medium,
  },
  locationAddress: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  locationNotes: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontStyle: 'italic',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  modalHeaderSpacer: {
    width: 24,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  modalScrollView: {
    flex: 1,
  },
  modalContent: {
    padding: Spacing.xl,
  },
  formSection: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  locationPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  locationPickerContent: {
    flex: 1,
  },
  locationPickerTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  locationPickerAddress: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 2,
  },
  locationPickerPlaceholder: {
    fontSize: FontSizes.base,
    color: Colors.gray[400],
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    backgroundColor: Colors.white,
  },
  textArea: {
    minHeight: 80,
    paddingTop: Spacing.md,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    gap: Spacing.xs,
  },
  typeButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[700],
  },
  typeButtonTextActive: {
    color: Colors.white,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[700],
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
});

