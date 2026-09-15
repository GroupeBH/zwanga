import {
  RouteOverridePickerTarget,
  LANDMARK_PLACEHOLDER,
  TRIP_REQUEST_VEHICLE_LABELS,
  TRIP_REQUEST_VEHICLE_ICONS,
  normalizeTripRequestVehicleType,
} from './requestDetailModel';
import { styles } from '../screen-styles/app/request/detail/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { Colors } from '@/constants/styles';
import type { TripRequestVehicleType } from '@/types';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';
import type { Vehicle } from '@/types';

interface RequestAcceptModalProps {
  showDirectAcceptModal: boolean;
  closeDirectAcceptModal: () => void;
  directAcceptDepartureDate: Date | null;
  requestedVehicleType: TripRequestVehicleType;
  directAcceptRequiresPassengerKyc: boolean;
  setDirectAcceptRequiresPassengerKyc: React.Dispatch<React.SetStateAction<boolean>>;
  compatibleActiveVehicles: Vehicle[];
  directAcceptVehicleId: string;
  setDirectAcceptVehicleId: React.Dispatch<React.SetStateAction<string>>;
  directAcceptVehicle: Vehicle | null;
  areDirectOptionsExpanded: boolean;
  setAreDirectOptionsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  openDirectRouteOverridePicker: (target: RouteOverridePickerTarget) => void;
  directAcceptDepartureLocation: MapLocationSelection | null;
  directAcceptDepartureReference: string;
  setDirectAcceptDepartureReference: React.Dispatch<React.SetStateAction<string>>;
  directAcceptArrivalLocation: MapLocationSelection | null;
  directAcceptArrivalReference: string;
  setDirectAcceptArrivalReference: React.Dispatch<React.SetStateAction<string>>;
  canAcceptRequest: boolean;
  isAcceptingTripRequest: boolean;
  isStartingTrip: boolean;
  handleDirectAcceptTripRequest: (startImmediately: boolean) => Promise<void>;
}

export function RequestAcceptModal({
  showDirectAcceptModal,
  closeDirectAcceptModal,
  directAcceptDepartureDate,
  requestedVehicleType,
  directAcceptRequiresPassengerKyc,
  setDirectAcceptRequiresPassengerKyc,
  compatibleActiveVehicles,
  directAcceptVehicleId,
  setDirectAcceptVehicleId,
  directAcceptVehicle,
  areDirectOptionsExpanded,
  setAreDirectOptionsExpanded,
  openDirectRouteOverridePicker,
  directAcceptDepartureLocation,
  directAcceptDepartureReference,
  setDirectAcceptDepartureReference,
  directAcceptArrivalLocation,
  directAcceptArrivalReference,
  setDirectAcceptArrivalReference,
  canAcceptRequest,
  isAcceptingTripRequest,
  isStartingTrip,
  handleDirectAcceptTripRequest,
}: RequestAcceptModalProps) {
  return (
    <Modal
      visible={showDirectAcceptModal}
      animationType="slide"
      transparent
      onRequestClose={closeDirectAcceptModal}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.editModalRoot}
      >
        <TouchableOpacity
          style={styles.editModalBackdrop}
          activeOpacity={1}
          onPress={closeDirectAcceptModal}
        />

        <View style={[styles.editModalCard, styles.directAcceptModalCard]}>
          <View style={styles.editModalHeader}>
            <View style={styles.editModalHeaderContent}>
              <View style={styles.directAcceptModalIcon}>
                <Ionicons name="checkmark-circle-outline" size={20} color={Colors.primary} />
              </View>
              <View style={styles.directAcceptModalTitleCopy}>
                <Text style={styles.editModalTitle}>Accepter la demande</Text>
                <Text style={styles.editModalSubtitle}>Choisissez le véhicule utilisé</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.editModalCloseButton}
              onPress={closeDirectAcceptModal}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={20} color={Colors.gray[700]} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.editModalScrollView}
            contentContainerStyle={styles.directAcceptModalScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.directAcceptSummaryCard}>
              <View style={styles.directAcceptSummaryRow}>
                <Ionicons name="calendar-outline" size={17} color={Colors.primary} />
                <Text style={styles.directAcceptSummaryText}>
                  {directAcceptDepartureDate
                    ? formatDateWithRelativeLabel(directAcceptDepartureDate.toISOString(), true)
                    : 'Départ à confirmer'}
                </Text>
              </View>
              <View style={styles.directAcceptSummaryRow}>
                <Ionicons name={TRIP_REQUEST_VEHICLE_ICONS[requestedVehicleType]} size={17} color={Colors.primary} />
                <Text style={styles.directAcceptSummaryText}>
                  {TRIP_REQUEST_VEHICLE_LABELS[requestedVehicleType]} demandée
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: directAcceptRequiresPassengerKyc }}
              onPress={() => setDirectAcceptRequiresPassengerKyc((current) => !current)}
              style={({ pressed }) => [
                styles.directPassengerKycCard,
                directAcceptRequiresPassengerKyc && styles.directPassengerKycCardActive,
                pressed && styles.directPassengerKycCardPressed,
              ]}
            >
              <View
                style={[
                  styles.directPassengerKycIcon,
                  directAcceptRequiresPassengerKyc && styles.directPassengerKycIconActive,
                ]}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={19}
                  color={directAcceptRequiresPassengerKyc ? Colors.white : Colors.primary}
                />
              </View>
              <View style={styles.directPassengerKycCopy}>
                <Text style={styles.directPassengerKycTitle}>Passagers vérifiés uniquement</Text>
                <Text style={styles.directPassengerKycSubtitle}>
                  Le passager devra avoir une vérification d&apos;identité approuvée avant que ce trajet continue.
                </Text>
              </View>
              <View
                style={[
                  styles.directPassengerKycSwitch,
                  directAcceptRequiresPassengerKyc && styles.directPassengerKycSwitchActive,
                ]}
              >
                <View
                  style={[
                    styles.directPassengerKycThumb,
                    directAcceptRequiresPassengerKyc && styles.directPassengerKycThumbActive,
                  ]}
                />
              </View>
            </Pressable>

            <View style={styles.directVehiclePicker}>
              <View style={styles.directVehiclePickerHeader}>
                <View style={styles.directVehiclePickerIcon}>
                  <Ionicons name="car-sport-outline" size={18} color={Colors.primary} />
                </View>
                <View style={styles.directVehiclePickerCopy}>
                  <Text style={styles.directVehiclePickerTitle}>Véhicule pour ce trajet</Text>
                  <Text style={styles.directVehiclePickerSubtitle}>
                    {compatibleActiveVehicles.length > 1
                      ? 'Sélectionnez le véhicule que vous allez utiliser.'
                      : 'Ce véhicule sera communiqué au passager.'}
                  </Text>
                </View>
                <Text style={styles.directVehicleRequired}>REQUIS</Text>
              </View>

              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.directVehicleList}
              >
                {compatibleActiveVehicles.map((vehicle) => {
                  const isSelected = directAcceptVehicleId === vehicle.id;
                  const vehicleType = normalizeTripRequestVehicleType(vehicle.type);

                  return (
                    <Pressable
                      key={vehicle.id}
                      accessibilityRole="radio"
                      accessibilityLabel={`${vehicle.brand} ${vehicle.model}, ${vehicle.color}, plaque ${vehicle.licensePlate}`}
                      accessibilityState={{ checked: isSelected }}
                      onPress={() => setDirectAcceptVehicleId(vehicle.id)}
                      style={({ pressed }) => [
                        styles.directVehicleCard,
                        isSelected && styles.directVehicleCardSelected,
                        pressed && styles.directVehicleCardPressed,
                      ]}
                    >
                      <View style={styles.directVehicleCardHeader}>
                        <Ionicons
                          name={TRIP_REQUEST_VEHICLE_ICONS[vehicleType]}
                          size={21}
                          color={isSelected ? Colors.primary : Colors.gray[600]}
                        />
                        <View
                          style={[
                            styles.directVehicleRadio,
                            isSelected && styles.directVehicleRadioSelected,
                          ]}
                        >
                          {isSelected && <Ionicons name="checkmark" size={13} color={Colors.white} />}
                        </View>
                      </View>
                      <Text style={styles.directVehicleName} numberOfLines={1}>
                        {vehicle.brand} {vehicle.model}
                      </Text>
                      <Text style={styles.directVehicleDetails} numberOfLines={1}>
                        {vehicle.color} • {vehicle.licensePlate}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {!directAcceptVehicle && (
                <View style={styles.directVehicleHint}>
                  <Ionicons name="information-circle-outline" size={15} color={Colors.warning} />
                  <Text style={styles.directVehicleHintText}>
                    Sélectionnez un véhicule pour continuer.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.driverOverridePanel}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: areDirectOptionsExpanded }}
                onPress={() => setAreDirectOptionsExpanded((isExpanded) => !isExpanded)}
                style={({ pressed }) => [
                  styles.driverOverrideToggle,
                  pressed && styles.driverOverrideTogglePressed,
                ]}
              >
                <View style={styles.driverOverrideToggleIcon}>
                  <Ionicons name="options-outline" size={18} color={Colors.primary} />
                </View>
                <View style={styles.driverOverrideToggleCopy}>
                  <Text style={styles.driverOverrideTitle}>Ajuster les points de rendez-vous</Text>
                  <Text style={styles.driverOverrideSubtitle}>Optionnel · seulement si nécessaire</Text>
                </View>
                <Ionicons
                  name={areDirectOptionsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.gray[600]}
                />
              </Pressable>
              {areDirectOptionsExpanded && (
                <Animated.View entering={FadeInDown.duration(200)} style={styles.driverOverrideFields}>
                  <TouchableOpacity
                    style={styles.driverOverrideButton}
                    onPress={() => openDirectRouteOverridePicker('directDeparture')}
                  >
                    <Ionicons name="location-outline" size={16} color={Colors.primary} />
                    <Text style={styles.driverOverrideButtonText}>
                      {directAcceptDepartureLocation?.title || 'Point de départ sur la carte'}
                    </Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.driverOverrideInput}
                    placeholder={LANDMARK_PLACEHOLDER}
                    placeholderTextColor={Colors.gray[400]}
                    value={directAcceptDepartureReference}
                    onChangeText={setDirectAcceptDepartureReference}
                  />
                  <TouchableOpacity
                    style={styles.driverOverrideButton}
                    onPress={() => openDirectRouteOverridePicker('directArrival')}
                  >
                    <Ionicons name="navigate-outline" size={16} color={Colors.primary} />
                    <Text style={styles.driverOverrideButtonText}>
                      {directAcceptArrivalLocation?.title || 'Point d’arrivée sur la carte'}
                    </Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.driverOverrideInput}
                    placeholder={LANDMARK_PLACEHOLDER}
                    placeholderTextColor={Colors.gray[400]}
                    value={directAcceptArrivalReference}
                    onChangeText={setDirectAcceptArrivalReference}
                  />
                </Animated.View>
              )}
            </View>
          </ScrollView>

          <View style={styles.directAcceptModalFooter}>
            <TouchableOpacity
              style={[
                styles.directAcceptSecondaryButton,
                (!canAcceptRequest || !directAcceptVehicle || isAcceptingTripRequest || isStartingTrip) &&
                  styles.directAcceptSecondaryButtonDisabled,
              ]}
              onPress={() => handleDirectAcceptTripRequest(false)}
              disabled={!canAcceptRequest || !directAcceptVehicle || isAcceptingTripRequest || isStartingTrip}
            >
              <Text
                style={[
                  styles.directAcceptSecondaryButtonText,
                  (!canAcceptRequest || !directAcceptVehicle || isAcceptingTripRequest || isStartingTrip) &&
                    styles.directAcceptButtonTextDisabled,
                ]}
              >
                Accepter
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.directAcceptPrimaryButton,
                (!canAcceptRequest || !directAcceptVehicle || isAcceptingTripRequest || isStartingTrip) &&
                  styles.directAcceptButtonDisabled,
              ]}
              onPress={() => handleDirectAcceptTripRequest(true)}
              disabled={!canAcceptRequest || !directAcceptVehicle || isAcceptingTripRequest || isStartingTrip}
            >
              {isAcceptingTripRequest || isStartingTrip ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="play-circle-outline" size={18} color={Colors.white} />
                  <Text style={styles.directAcceptPrimaryButtonText}>Accepter et démarrer</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
