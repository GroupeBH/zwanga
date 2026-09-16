import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import type { Trip } from '@/types';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface TripVehicleDetailsModalProps {
  vehicleDetailModalVisible: boolean;
  setVehicleDetailModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  insets: EdgeInsets;
  trip: Trip | undefined;
  tripVehicleIconName: "car" | "bicycle" | "car-sport";
  tripVehicleLabel: string;
  tripVehicleTypeLabel: string;
  tripVehicleStatusLabel: string | null;
  tripVehicleLicensePlate: string | null;
  visibleTripVehicleDetailRows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; }[];
}

export function TripVehicleDetailsModal({
  vehicleDetailModalVisible,
  setVehicleDetailModalVisible,
  insets,
  trip,
  tripVehicleIconName,
  tripVehicleLabel,
  tripVehicleTypeLabel,
  tripVehicleStatusLabel,
  tripVehicleLicensePlate,
  visibleTripVehicleDetailRows,
}: TripVehicleDetailsModalProps) {
  return (
    <Modal
      visible={vehicleDetailModalVisible}
      animationType="slide"
      transparent
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={() => setVehicleDetailModalVisible(false)}
    >
      <View style={styles.vehicleDetailModalOverlay}>
        <TouchableOpacity
          style={styles.vehicleDetailModalBackdrop}
          activeOpacity={1}
          onPress={() => setVehicleDetailModalVisible(false)}
        />
        <View
          style={[
            styles.vehicleDetailModalCard,
            { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.md },
          ]}
        >
          <View style={styles.vehicleDetailModalHeader}>
            {trip?.vehicle?.photoUrl ? (
              <Image
                resizeMode="cover"
                source={{ uri: trip.vehicle.photoUrl }}
                style={styles.vehicleDetailModalPhoto}
              />
            ) : (
              <View style={styles.vehicleDetailModalBadge}>
                <Ionicons name={tripVehicleIconName} size={22} color={Colors.white} />
              </View>
            )}
            <View style={styles.vehicleDetailModalHeaderCopy}>
              <Text style={styles.vehicleDetailModalTitle} numberOfLines={1}>
                {tripVehicleLabel}
              </Text>
              <Text style={styles.vehicleDetailModalSubtitle} numberOfLines={1}>
                {tripVehicleTypeLabel}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Fermer les détails du véhicule"
              accessibilityRole="button"
              onPress={() => setVehicleDetailModalVisible(false)}
              style={styles.vehicleDetailModalCloseIcon}
            >
              <Ionicons name="close" size={20} color={Colors.gray[500]} />
            </TouchableOpacity>
          </View>

          <View style={styles.vehicleDetailModalBody}>
            {tripVehicleStatusLabel ? (
              <View style={styles.vehicleDetailModalChips}>
                <View
                  style={[
                    styles.vehicleDetailModalChip,
                    tripVehicleStatusLabel === 'Actif'
                      ? styles.vehicleDetailModalChipSuccess
                      : styles.vehicleDetailModalChipMuted,
                  ]}
                >
                  <Ionicons
                    name={tripVehicleStatusLabel === 'Actif' ? 'checkmark-circle' : 'pause-circle'}
                    size={14}
                    color={tripVehicleStatusLabel === 'Actif' ? Colors.successDark : Colors.gray[600]}
                  />
                  <Text
                    style={[
                      styles.vehicleDetailModalChipText,
                      tripVehicleStatusLabel === 'Actif'
                        ? styles.vehicleDetailModalChipTextSuccess
                        : styles.vehicleDetailModalChipTextMuted,
                    ]}
                  >
                    {tripVehicleStatusLabel}
                  </Text>
                </View>
              </View>
            ) : null}

            {tripVehicleLicensePlate ? (
              <View style={styles.vehicleDetailModalPlate}>
                <Text style={styles.vehicleDetailModalPlateCaption}>Plaque</Text>
                <Text style={styles.vehicleDetailModalPlateValue}>{tripVehicleLicensePlate}</Text>
              </View>
            ) : null}

            {visibleTripVehicleDetailRows.length > 0 ? (
              <View style={styles.vehicleDetailModalGrid}>
                {visibleTripVehicleDetailRows.map((row) => (
                  <View
                    key={row.label}
                    style={[
                      styles.vehicleDetailModalFact,
                      row.label === 'Information' && styles.vehicleDetailModalFactWide,
                    ]}
                  >
                    <View style={styles.vehicleDetailModalFactIcon}>
                      <Ionicons name={row.icon} size={16} color={Colors.primary} />
                    </View>
                    <View style={styles.vehicleDetailModalFactCopy}>
                      <Text style={styles.vehicleDetailModalFactLabel}>{row.label}</Text>
                      <Text style={styles.vehicleDetailModalFactValue} numberOfLines={2}>
                        {row.value}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.vehicleDetailModalSafetyNote}>
              <View style={styles.vehicleDetailModalSafetyIcon}>
                <Ionicons name="shield-checkmark" size={16} color={Colors.primary} />
              </View>
              <Text style={styles.vehicleDetailModalSafetyText}>
                Avant de monter, vérifiez que le véhicule et la plaque correspondent aux informations du trajet.
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setVehicleDetailModalVisible(false)}
              style={styles.vehicleDetailModalCloseButton}
            >
              <Text style={styles.vehicleDetailModalCloseText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
