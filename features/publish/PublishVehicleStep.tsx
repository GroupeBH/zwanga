import { PublishStep } from './publishModel';
import { styles } from '../screen-styles/app/publish/index';
import { Colors, Spacing } from '@/constants/styles';
import { getRegisteredVehicleTypeLabel } from '@/constants/vehicleTypes';
import type { Vehicle } from '@/types';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface PublishVehicleStepProps {
  stepEntering: FadeInDown | undefined;
  activeVehicles: Vehicle[];
  selectedVehicleId: string | null;
  vehicleCreationMessage: string | null;
  isLoadingVehicles: boolean;
  openVehicleForm: () => void;
  setSelectedVehicleId: React.Dispatch<React.SetStateAction<string | null>>;
  insets: EdgeInsets;
  goToStep: (nextStep: PublishStep) => void;
  handleNextStep: () => void;
}

export function PublishVehicleStep({
  stepEntering,
  activeVehicles,
  selectedVehicleId,
  vehicleCreationMessage,
  isLoadingVehicles,
  openVehicleForm,
  setSelectedVehicleId,
  insets,
  goToStep,
  handleNextStep,
}: PublishVehicleStepProps) {
  return (
    <Animated.View entering={stepEntering} style={styles.stepContainer}>
      <Text style={styles.sectionTitle}>Votre véhicule</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Sélectionnez un véhicule *</Text>

        {activeVehicles.length > 0 && selectedVehicleId && (
          <Text style={styles.vehicleDefaultHint}>
            Un véhicule actif est déjà sélectionné par défaut.
          </Text>
        )}
        {vehicleCreationMessage ? (
          <View style={styles.vehicleSuccessBanner} accessibilityRole="alert">
            <View style={styles.vehicleSuccessIcon}>
              <Ionicons name="checkmark" size={18} color={Colors.white} />
            </View>
            <View style={styles.vehicleSuccessContent}>
              <Text style={styles.vehicleSuccessTitle}>Véhicule prêt</Text>
              <Text style={styles.vehicleSuccessText}>{vehicleCreationMessage}</Text>
            </View>
          </View>
        ) : null}
        {isLoadingVehicles && activeVehicles.length === 0 ? (
          <View style={styles.vehicleLoadingState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.vehicleLoadingText}>Chargement de vos véhicules...</Text>
          </View>
        ) : activeVehicles.length === 0 ? (
          <View style={styles.vehicleEmptyState}>
            <Ionicons name="car-outline" size={48} color={Colors.gray[400]} />
            <Text style={styles.vehicleEmptyTitle}>Aucun véhicule</Text>
            <Text style={styles.vehicleEmptyText}>
              Ajoutez votre premier véhicule pour publier des trajets
            </Text>
            <TouchableOpacity
              style={styles.addVehicleButton}
              onPress={openVehicleForm}
            >
              <Ionicons name="add-circle" size={20} color={Colors.white} />
              <Text style={styles.addVehicleButtonText}>Ajouter un véhicule</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.vehicleScrollView}
              contentContainerStyle={styles.vehicleScrollContent}
            >
              {activeVehicles.map((vehicle) => {
                const isSelected = selectedVehicleId === vehicle.id;
                const vehicleName = `${vehicle.brand} ${vehicle.model}`.trim();

                return (
                  <TouchableOpacity
                    key={vehicle.id}
                    style={[
                      styles.vehicleCard,
                      isSelected && styles.vehicleCardActive,
                    ]}
                    onPress={() => setSelectedVehicleId(vehicle.id)}
                    activeOpacity={0.86}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={[styles.vehicleCardAccent, isSelected && styles.vehicleCardAccentActive]} />
                    <View style={styles.vehicleCardHeader}>
                      <View style={[styles.vehicleCardIconWrap, isSelected && styles.vehicleCardIconWrapActive]}>
                        <Ionicons
                          name="car-sport"
                          size={22}
                          color={isSelected ? Colors.white : Colors.primary}
                        />
                      </View>
                      <View style={[styles.vehicleCardStatus, isSelected && styles.vehicleCardStatusActive]}>
                        {isSelected ? <Ionicons name="checkmark" size={12} color={Colors.white} /> : null}
                        <Text style={[styles.vehicleCardStatusText, isSelected && styles.vehicleCardStatusTextActive]}>
                          {isSelected ? 'Choisi' : 'Actif'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.vehicleCardBrand} numberOfLines={1}>
                      {vehicleName || 'Véhicule'}
                    </Text>
                    <View style={styles.vehiclePlatePill}>
                      <Ionicons name="card-outline" size={13} color={Colors.gray[500]} />
                      <Text style={styles.vehiclePlateText} numberOfLines={1}>
                        {vehicle.licensePlate}
                      </Text>
                    </View>
                    <Text style={styles.vehicleCardDetails} numberOfLines={1}>
                      {getRegisteredVehicleTypeLabel(vehicle.type)} • {vehicle.color || 'Couleur non précisée'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.addVehicleButtonSecondary}
              onPress={openVehicleForm}
            >
              <Ionicons name="add" size={18} color={Colors.primary} />
              <Text style={styles.addVehicleButtonSecondaryText}>Ajouter un autre véhicule</Text>
            </TouchableOpacity>
          </>
        )}

      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.info} />
        <Text style={styles.infoText}>
          Les passagers pourront voir les détails de votre véhicule après avoir réservé.
        </Text>
      </View>

      <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => goToStep('datetime')}
        >
          <Text style={styles.buttonSecondaryText}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { flex: 1, marginLeft: Spacing.md }]} onPress={handleNextStep}>
          <Text style={styles.buttonText}>Continuer</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
