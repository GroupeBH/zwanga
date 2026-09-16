import { TripEditorRouteFields } from './TripEditorRouteFields';
import { EditTripStep } from './tripsModel';
import { styles } from '../screen-styles/app/tabs/trips/index';
import { FormModal } from '@/components/forms/FormLayout';
import { Colors, Spacing } from '@/constants/styles';
import type { Trip } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Vehicle } from '@/types';

interface TripsEditModalProps {
  editingTrip: Trip | null;
  editModalSuspended: boolean;
  closeEditModal: () => void;
  editModalBottomPadding: number;
  editStep: EditTripStep;
  swapEditRoutePoints: () => void;
  editRouteMode: "map" | "manual";
  setEditRouteMode: React.Dispatch<React.SetStateAction<"map" | "manual">>;
  editDepartureManualAddress: string;
  setEditDepartureManualAddress: React.Dispatch<React.SetStateAction<string>>;
  editArrivalManualAddress: string;
  setEditArrivalManualAddress: React.Dispatch<React.SetStateAction<string>>;
  handleContinueEditTrip: () => void;
  openEditRoutePicker: (target: "departure" | "arrival") => void;
  editDepartureDisplay: string;
  editArrivalDisplay: string;
  vehiclesLoading: boolean;
  activeUserVehicles: Vehicle[];
  editVehicleId: string | null;
  setEditVehicleId: React.Dispatch<React.SetStateAction<string | null>>;
  editSeats: string;
  setEditSeats: React.Dispatch<React.SetStateAction<string>>;
  editPrice: string;
  setEditPrice: React.Dispatch<React.SetStateAction<string>>;
  openDateOrTimePicker: (mode: "date" | "time") => void;
  formattedEditDate: string;
  formattedEditTime: string;
  iosPickerMode: "date" | "time" | null;
  getEditBaseDate: () => Date;
  handleIosPickerChange: (_event: DateTimePickerEvent, selectedDate?: Date) => void;
  closeIosPicker: () => void;
  handleBackToEditRoute: () => void;
  handleSaveTrip: () => Promise<void>;
  isSavingTrip: boolean;
}

export function TripsEditModal({
  editingTrip,
  editModalSuspended,
  closeEditModal,
  editModalBottomPadding,
  editStep,
  swapEditRoutePoints,
  editRouteMode,
  setEditRouteMode,
  editDepartureManualAddress,
  setEditDepartureManualAddress,
  editArrivalManualAddress,
  setEditArrivalManualAddress,
  handleContinueEditTrip,
  openEditRoutePicker,
  editDepartureDisplay,
  editArrivalDisplay,
  vehiclesLoading,
  activeUserVehicles,
  editVehicleId,
  setEditVehicleId,
  editSeats,
  setEditSeats,
  editPrice,
  setEditPrice,
  openDateOrTimePicker,
  formattedEditDate,
  formattedEditTime,
  iosPickerMode,
  getEditBaseDate,
  handleIosPickerChange,
  closeIosPicker,
  handleBackToEditRoute,
  handleSaveTrip,
  isSavingTrip,
}: TripsEditModalProps) {
  return (
    <FormModal
      transparent={Platform.OS === 'android'}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
      statusBarTranslucent={Platform.OS === 'android'}
      navigationBarTranslucent={Platform.OS === 'android'}
      visible={Boolean(editingTrip) && !editModalSuspended}
      onRequestClose={closeEditModal}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        style={[styles.modalKeyboard, Platform.OS === 'ios' && styles.modalKeyboardIos]}
      >
        <View style={[styles.modalOverlay, Platform.OS === 'ios' && styles.modalOverlayIos]}>
          {Platform.OS === 'android' && (
            <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeEditModal} />
          )}
          <View
            style={[
              styles.modalCard,
              Platform.OS === 'ios' && styles.modalCardIos,
              { paddingBottom: editModalBottomPadding },
            ]}
          >
            {Platform.OS === 'android' && <View style={styles.modalHandle} />}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Modifier le trajet</Text>
              {editingTrip && (
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {editingTrip.departure.name} {'->'} {editingTrip.arrival.name}
                </Text>
              )}
            </View>
            <TouchableOpacity style={styles.modalCloseButton} onPress={closeEditModal}>
              <Ionicons name="close" size={20} color={Colors.gray[600]} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalStepIndicator}>
            <View style={[styles.modalStepPill, editStep === 1 && styles.modalStepPillActive]}>
              <Text style={[styles.modalStepText, editStep === 1 && styles.modalStepTextActive]}>
                1. Itinéraire
              </Text>
            </View>
            <View style={[styles.modalStepPill, editStep === 2 && styles.modalStepPillActive]}>
              <Text style={[styles.modalStepText, editStep === 2 && styles.modalStepTextActive]}>
                2. Détails
              </Text>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            style={[styles.modalScrollView, Platform.OS === 'ios' && styles.modalScrollViewIos]}
            contentContainerStyle={styles.modalScrollContent}
            scrollIndicatorInsets={{ bottom: editModalBottomPadding }}
          >

            {editStep === 1 ? (
              <>
          <TripEditorRouteFields
            swapEditRoutePoints={swapEditRoutePoints}
            editRouteMode={editRouteMode}
            setEditRouteMode={setEditRouteMode}
            editDepartureManualAddress={editDepartureManualAddress}
            setEditDepartureManualAddress={setEditDepartureManualAddress}
            editArrivalManualAddress={editArrivalManualAddress}
            setEditArrivalManualAddress={setEditArrivalManualAddress}
            handleContinueEditTrip={handleContinueEditTrip}
            openEditRoutePicker={openEditRoutePicker}
            editDepartureDisplay={editDepartureDisplay}
            editArrivalDisplay={editArrivalDisplay}
          />
              </>
            ) : (
              <>

          <View style={styles.modalField}>
            <Text style={styles.modalLabel}>Véhicule du trajet</Text>
            {vehiclesLoading ? (
              <View style={styles.modalVehicleLoading}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.modalVehicleLoadingText}>Chargement des véhicules...</Text>
              </View>
            ) : activeUserVehicles.length === 0 ? (
              <View style={styles.modalVehicleEmpty}>
                <Ionicons name="car-outline" size={20} color={Colors.gray[500]} />
                <Text style={styles.modalVehicleEmptyText}>
                  Aucun véhicule actif. Ajoutez-en un depuis votre profil.
                </Text>
              </View>
            ) : (
              <View style={styles.modalVehicleList}>
                {activeUserVehicles.map((vehicle) => {
                  const selected = editVehicleId === vehicle.id;
                  return (
                    <TouchableOpacity
                      key={vehicle.id}
                      style={[styles.modalVehicleOption, selected && styles.modalVehicleOptionSelected]}
                      onPress={() => setEditVehicleId(vehicle.id)}
                      activeOpacity={0.82}
                    >
                      <View style={[styles.modalVehicleIcon, selected && styles.modalVehicleIconSelected]}>
                        <Ionicons
                          name="car-sport-outline"
                          size={20}
                          color={selected ? Colors.white : Colors.primary}
                        />
                      </View>
                      <View style={styles.modalVehicleCopy}>
                        <Text style={styles.modalVehicleName}>{vehicle.brand} {vehicle.model}</Text>
                        <Text style={styles.modalVehicleMeta}>
                          {[vehicle.color, vehicle.licensePlate].filter(Boolean).join(' • ')}
                        </Text>
                      </View>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? Colors.primary : Colors.gray[300]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalLabel}>Places disponibles</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder="4"
              placeholderTextColor={Colors.gray[400]}
              value={editSeats}
              onChangeText={setEditSeats}
            />
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalLabel}>Prix (FC)</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder="5000"
              placeholderTextColor={Colors.gray[400]}
              value={editPrice}
              onChangeText={setEditPrice}
            />
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalLabel}>Date et heure de départ</Text>
            <View style={styles.modalDatetimeRow}>
              <TouchableOpacity
                style={styles.modalDatetimeButton}
                onPress={() => openDateOrTimePicker('date')}
              >
                <Ionicons name="calendar" size={18} color={Colors.primary} />
                <View style={{ marginLeft: Spacing.sm }}>
                  <Text style={styles.modalDatetimeLabel}>Date</Text>
                  <Text style={styles.modalDatetimeValue}>{formattedEditDate}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDatetimeButton, { marginRight: 0 }]}
                onPress={() => openDateOrTimePicker('time')}
              >
                <Ionicons name="time" size={18} color={Colors.gray[700]} />
                <View style={{ marginLeft: Spacing.sm }}>
                  <Text style={styles.modalDatetimeLabel}>Heure</Text>
                  <Text style={styles.modalDatetimeValue}>{formattedEditTime}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {Platform.OS === 'ios' && iosPickerMode && (
            <View style={styles.iosPickerContainer}>
              <DateTimePicker
                value={getEditBaseDate()}
                mode={iosPickerMode}
                display="inline"
                minuteInterval={5}
                minimumDate={iosPickerMode === 'date' ? new Date() : undefined}
                onChange={handleIosPickerChange}
              />
              <TouchableOpacity style={styles.iosPickerCloseButton} onPress={closeIosPicker}>
                <Text style={styles.iosPickerCloseText}>Terminé</Text>
              </TouchableOpacity>
            </View>
          )}
              </>
            )}
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonSecondary]}
              onPress={editStep === 1 ? closeEditModal : handleBackToEditRoute}
            >
              {editStep === 2 && (
                <Ionicons name="arrow-back" size={18} color={Colors.gray[800]} style={{ marginRight: 4 }} />
              )}
              <Text style={styles.modalButtonSecondaryText}>{editStep === 1 ? 'Annuler' : 'Retour'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonPrimary, { marginRight: 0 }]}
              onPress={editStep === 1 ? handleContinueEditTrip : handleSaveTrip}
              disabled={isSavingTrip}
            >
              {editStep === 1 ? (
                <>
                  <Text style={styles.modalButtonPrimaryText}>Suivant</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.white} style={{ marginLeft: 4 }} />
                </>
              ) : isSavingTrip ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.modalButtonPrimaryText}>Enregistrer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </FormModal>
  );
}
