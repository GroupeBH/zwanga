import { TRIP_REQUEST_VEHICLE_ICONS, formatCdfPrice } from './requestDetailModel';
import { styles } from '../screen-styles/app/request/detail/index';
import { Colors } from '@/constants/styles';
import { type TripRequestVehiclePriceOption } from '@/store/api/tripRequestApi';
import type { TripRequestVehicleType } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

interface RequestEditVehicleOptionsProps {
  editVehiclePriceMultiplier: number;
  isEditVehicleOptionsLoading: boolean;
  editVehicleOptions: TripRequestVehiclePriceOption[];
  isEditVehicleOptionsError: boolean;
  retryEditVehicleOptions: () => void;
  editVehicleType: TripRequestVehicleType;
  parsedEditNumberOfSeats: number;
  handleSelectEditVehicle: (option: TripRequestVehiclePriceOption) => void;
}

export function RequestEditVehicleOptions({
  editVehiclePriceMultiplier,
  isEditVehicleOptionsLoading,
  editVehicleOptions,
  isEditVehicleOptionsError,
  retryEditVehicleOptions,
  editVehicleType,
  parsedEditNumberOfSeats,
  handleSelectEditVehicle,
}: RequestEditVehicleOptionsProps) {
  return (
    <View style={styles.editSection}>
      <View style={styles.editVehicleHeader}>
        <View style={styles.editSectionHeaderCompact}>
          <Ionicons name="car-sport-outline" size={20} color={Colors.primary} />
          <View>
            <Text style={styles.editSectionTitle}>Type de véhicule</Text>
            <Text style={styles.editVehicleSubtitle}>Estimation par place</Text>
          </View>
        </View>
        {editVehiclePriceMultiplier > 1 ? (
          <View style={styles.editWeatherBadge}>
            <Ionicons name="rainy-outline" size={12} color={Colors.primaryDark} />
            <Text style={styles.editWeatherBadgeText}>
              x{editVehiclePriceMultiplier.toFixed(1)}
            </Text>
          </View>
        ) : null}
      </View>

      {isEditVehicleOptionsLoading && editVehicleOptions.length === 0 ? (
        <View style={styles.editVehicleLoading}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.editVehicleLoadingText}>Mise à jour des tarifs…</Text>
        </View>
      ) : null}

      {!isEditVehicleOptionsLoading && isEditVehicleOptionsError && editVehicleOptions.length === 0 ? (
        <View style={styles.editVehicleError}>
          <Text style={styles.editVehicleErrorText}>Tarifs indisponibles. Fixez votre budget ci-dessous ou réessayez.</Text>
          <TouchableOpacity
            style={styles.editVehicleRetry}
            onPress={retryEditVehicleOptions}
          >
            <Text style={styles.editVehicleRetryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.editVehicleOptionsList}>
        {editVehicleOptions.map((option) => {
          const selected = option.vehicleType === editVehicleType;
          const unavailable = !option.availableForRequestedSeats;
          const price = option.recommendedPricePerSeat === null
            ? 'À confirmer'
            : formatCdfPrice(option.recommendedPricePerSeat);
          const detail = unavailable
            ? `Indisponible pour ${parsedEditNumberOfSeats} places`
            : option.recommendedTotalPrice !== null && parsedEditNumberOfSeats > 1
              ? `${formatCdfPrice(option.recommendedTotalPrice)} au total`
              : `${formatCdfPrice(option.pricePerKmPerPassenger)} / km / pers.`;

          return (
            <TouchableOpacity
              key={option.vehicleType}
              style={[
                styles.editVehicleOption,
                selected && styles.editVehicleOptionSelected,
                unavailable && styles.editVehicleOptionDisabled,
              ]}
              onPress={() => handleSelectEditVehicle(option)}
              disabled={unavailable}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: unavailable }}
              activeOpacity={0.82}
            >
              <View style={[
                styles.editVehicleIcon,
                selected && styles.editVehicleIconSelected,
              ]}>
                <Ionicons
                  name={TRIP_REQUEST_VEHICLE_ICONS[option.vehicleType]}
                  size={20}
                  color={unavailable ? Colors.gray[400] : selected ? Colors.primary : Colors.gray[700]}
                />
              </View>
              <View style={styles.editVehicleCopy}>
                <Text style={[
                  styles.editVehicleName,
                  unavailable && styles.editVehicleTextDisabled,
                ]}>
                  {option.displayName}
                </Text>
                <Text style={[
                  styles.editVehicleMeta,
                  unavailable && styles.editVehicleTextDisabled,
                ]}>
                  {detail}
                </Text>
              </View>
              <View style={styles.editVehiclePriceBlock}>
                <Text style={[
                  styles.editVehiclePrice,
                  unavailable && styles.editVehicleTextDisabled,
                ]}>
                  {price}
                </Text>
                {!unavailable ? <Text style={styles.editVehiclePriceUnit}>par place</Text> : null}
              </View>
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={unavailable ? Colors.gray[300] : selected ? Colors.primary : Colors.gray[300]}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
