import { Colors } from '@/constants/styles';
import { getRegisteredVehicleTypeLabel } from '@/constants/vehicleTypes';
import { styles } from '@/features/profile/ProfileVehiclesSection.styles';
import type { useProfileController } from '@/hooks/profile/useProfileController';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

type Props = Pick<ReturnType<typeof useProfileController>,
  | 'deletingVehicle'
  | 'handleDeleteVehicle'
  | 'openCreateVehicleModal'
  | 'openEditVehicleModal'
  | 'refetchVehicles'
  | 'shouldShowVehicleLoadError'
  | 'updatingVehicle'
  | 'vehicleList'
  | 'vehiclesFetching'
  | 'vehiclesLoading'
>;

export function ProfileVehiclesSection({
  deletingVehicle,
  handleDeleteVehicle,
  openCreateVehicleModal,
  openEditVehicleModal,
  refetchVehicles,
  shouldShowVehicleLoadError,
  updatingVehicle,
  vehicleList,
  vehiclesFetching,
  vehiclesLoading,
}: Props) {
  return (<View style={styles.vehiclesContainer}>
    <View style={styles.vehiclesHeader}>
      <Text style={styles.sectionHeaderTitle}>Mes véhicules</Text>
      <TouchableOpacity
        style={styles.vehicleAddButton}
        accessibilityRole="button"
        accessibilityLabel="Ajouter un véhicule"
        onPress={openCreateVehicleModal}
      >
        <Ionicons name="add" size={18} color={Colors.white} />
      </TouchableOpacity>
    </View>
    {shouldShowVehicleLoadError ? (
      <View accessibilityLiveRegion="polite" style={styles.vehicleLoadErrorContainer}>
        <View style={styles.profileLoadErrorIcon}>
          <Ionicons name="cloud-offline-outline" size={28} color={Colors.danger} />
        </View>
        <Text style={styles.profileLoadErrorTitle}>Véhicules indisponibles</Text>
        <Text style={styles.profileLoadErrorMessage}>
          Impossible d’afficher vos véhicules pour le moment. Le reste du profil reste disponible.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Réessayer le chargement des véhicules"
          activeOpacity={0.85}
          disabled={vehiclesFetching}
          onPress={() => void refetchVehicles()}
          style={styles.profileLoadRetryButton}
        >
          {vehiclesFetching ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Ionicons name="refresh" size={18} color={Colors.white} />
          )}
          <Text style={styles.profileLoadRetryButtonText}>
            {vehiclesFetching ? 'Chargement…' : 'Réessayer'}
          </Text>
        </TouchableOpacity>
      </View>
    ) : vehiclesLoading ? (
      <ActivityIndicator color={Colors.primary} />
    ) : vehicleList.length > 0 ? (
      vehicleList.map((vehicle) => (
        <View key={vehicle.id} style={styles.vehicleItem}>
          <View style={styles.vehicleItemLeft}>
            <View>
              <Text style={styles.vehicleTitle}>
                {vehicle.brand} {vehicle.model}
              </Text>
              <Text style={styles.vehiclePlate}>{vehicle.licensePlate}</Text>
              <Text style={styles.vehicleColor}>
                {getRegisteredVehicleTypeLabel(vehicle.type)} • {vehicle.color}
              </Text>
            </View>
            <View
              style={[
                styles.vehicleStatus,
                {
                  backgroundColor: vehicle.isActive ? Colors.success + '20' : Colors.gray[200],
                },
              ]}
            >
              <Text
                style={[
                  styles.vehicleStatusText,
                  {
                    color: vehicle.isActive ? Colors.success : Colors.gray[600],
                  },
                ]}
              >
                {vehicle.isActive ? 'Actif' : 'Inactif'}
              </Text>
            </View>
          </View>
          <View style={styles.vehicleActions}>
            <TouchableOpacity
              style={styles.vehicleEditButton}
              accessibilityRole="button"
              accessibilityLabel={`Modifier ${vehicle.brand} ${vehicle.model}`}
              onPress={() => openEditVehicleModal(vehicle)}
              disabled={updatingVehicle || deletingVehicle}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="pencil-outline" size={19} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.vehicleDeleteButton}
              accessibilityRole="button"
              accessibilityLabel={`Supprimer ${vehicle.brand} ${vehicle.model}`}
              onPress={() => handleDeleteVehicle(vehicle)}
              disabled={deletingVehicle || updatingVehicle}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {deletingVehicle ? (
                <ActivityIndicator size="small" color={Colors.danger} />
              ) : (
                <Ionicons name="trash-outline" size={19} color={Colors.danger} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      ))
    ) : (
      <Text style={styles.vehicleEmptyText}>
        Aucun véhicule enregistré. Ajoutez-en un pour devenir conducteur.
      </Text>
    )}
  </View>);
}
