import { RequestEditFields } from './RequestEditFields';
import { styles } from '../screen-styles/app/request/detail/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import type { AddressInputMode } from '@/components/AddressEntryModeSelector';
import { Colors } from '@/constants/styles';
import { type TripRequestVehiclePriceOption } from '@/store/api/tripRequestApi';
import type { TripRequestVehicleType } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, TouchableOpacity, View } from 'react-native';

interface RequestEditModalProps {
  showEditForm: boolean;
  setShowEditForm: React.Dispatch<React.SetStateAction<boolean>>;
  editAddressInputMode: AddressInputMode;
  setEditAddressInputMode: React.Dispatch<React.SetStateAction<AddressInputMode>>;
  editDepartureManualAddress: string;
  setEditDepartureManualAddress: React.Dispatch<React.SetStateAction<string>>;
  editArrivalManualAddress: string;
  setEditArrivalManualAddress: React.Dispatch<React.SetStateAction<string>>;
  openEditLocationPicker: (target: "departure" | "arrival") => void;
  editDepartureAddress: string;
  editArrivalAddress: string;
  openEditDateOrTimePickerMin: (mode: "date" | "time") => void;
  editDepartureDateMin: Date | null;
  openEditDateOrTimePickerMax: (mode: "date" | "time") => void;
  editDepartureDateMax: Date | null;
  editScheduleError: string | null;
  editIosPickerModeMin: "date" | "time" | null;
  handleEditIosPickerChangeMin: (_event: DateTimePickerEvent, selectedDate?: Date) => void;
  editIosPickerModeMax: "date" | "time" | null;
  handleEditIosPickerChangeMax: (_event: DateTimePickerEvent, selectedDate?: Date) => void;
  editVehiclePriceMultiplier: number;
  isEditVehicleOptionsLoading: boolean;
  editVehicleOptions: TripRequestVehiclePriceOption[];
  isEditVehicleOptionsError: boolean;
  retryEditVehicleOptions: () => void;
  editVehicleType: TripRequestVehicleType;
  parsedEditNumberOfSeats: number;
  handleSelectEditVehicle: (option: TripRequestVehiclePriceOption) => void;
  editNumberOfSeats: string;
  setEditNumberOfSeats: React.Dispatch<React.SetStateAction<string>>;
  editMaxPricePerSeat: string;
  setEditMaxPricePerSeat: (value: string) => void;
  isEditBudgetValid: boolean;
  parsedEditBudget: number | undefined;
  editSeatCapacity: number | null;
  isIdentityVerified: boolean;
  openEditIdentityVerification: (source?: "extra_seats" | "book" | "request") => void;
  editDescription: string;
  setEditDescription: React.Dispatch<React.SetStateAction<string>>;
  isEditFormValid: boolean;
  handleUpdateRequest: () => Promise<void>;
  isUpdating: boolean;
}

export function RequestEditModal({
  showEditForm,
  setShowEditForm,
  editAddressInputMode,
  setEditAddressInputMode,
  editDepartureManualAddress,
  setEditDepartureManualAddress,
  editArrivalManualAddress,
  setEditArrivalManualAddress,
  openEditLocationPicker,
  editDepartureAddress,
  editArrivalAddress,
  openEditDateOrTimePickerMin,
  editDepartureDateMin,
  openEditDateOrTimePickerMax,
  editDepartureDateMax,
  editScheduleError,
  editIosPickerModeMin,
  handleEditIosPickerChangeMin,
  editIosPickerModeMax,
  handleEditIosPickerChangeMax,
  editVehiclePriceMultiplier,
  isEditVehicleOptionsLoading,
  editVehicleOptions,
  isEditVehicleOptionsError,
  retryEditVehicleOptions,
  editVehicleType,
  parsedEditNumberOfSeats,
  handleSelectEditVehicle,
  editNumberOfSeats,
  setEditNumberOfSeats,
  editMaxPricePerSeat,
  setEditMaxPricePerSeat,
  isEditBudgetValid,
  parsedEditBudget,
  editSeatCapacity,
  isIdentityVerified,
  openEditIdentityVerification,
  editDescription,
  setEditDescription,
  isEditFormValid,
  handleUpdateRequest,
  isUpdating,
}: RequestEditModalProps) {
  return (
    <Modal
      visible={showEditForm}
      animationType="slide"
      transparent
      onRequestClose={() => setShowEditForm(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.editModalRoot}
      >
        <TouchableOpacity
          style={styles.editModalBackdrop}
          activeOpacity={1}
          onPress={() => setShowEditForm(false)}
        />
        
        <View style={styles.editModalCard}>
          {/* En-tête */}
          <View style={styles.editModalHeader}>
            <View style={styles.editModalHeaderContent}>
              <Ionicons name="create-outline" size={24} color={Colors.primary} />
              <View>
                <Text style={styles.editModalTitle}>Modifier la demande</Text>
                <Text style={styles.editModalSubtitle}>Ajustez les détails avant de republier</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.editModalCloseButton}
              onPress={() => setShowEditForm(false)}
            >
              <Ionicons name="close" size={24} color={Colors.gray[600]} />
            </TouchableOpacity>
          </View>

          {/* Contenu Scrollable */}
          <RequestEditFields
            editAddressInputMode={editAddressInputMode}
            setEditAddressInputMode={setEditAddressInputMode}
            editDepartureManualAddress={editDepartureManualAddress}
            setEditDepartureManualAddress={setEditDepartureManualAddress}
            editArrivalManualAddress={editArrivalManualAddress}
            setEditArrivalManualAddress={setEditArrivalManualAddress}
            openEditLocationPicker={openEditLocationPicker}
            editDepartureAddress={editDepartureAddress}
            editArrivalAddress={editArrivalAddress}
            openEditDateOrTimePickerMin={openEditDateOrTimePickerMin}
            editDepartureDateMin={editDepartureDateMin}
            openEditDateOrTimePickerMax={openEditDateOrTimePickerMax}
            editDepartureDateMax={editDepartureDateMax}
            editScheduleError={editScheduleError}
            editIosPickerModeMin={editIosPickerModeMin}
            handleEditIosPickerChangeMin={handleEditIosPickerChangeMin}
            editIosPickerModeMax={editIosPickerModeMax}
            handleEditIosPickerChangeMax={handleEditIosPickerChangeMax}
            editVehiclePriceMultiplier={editVehiclePriceMultiplier}
            isEditVehicleOptionsLoading={isEditVehicleOptionsLoading}
            editVehicleOptions={editVehicleOptions}
            isEditVehicleOptionsError={isEditVehicleOptionsError}
            retryEditVehicleOptions={retryEditVehicleOptions}
            editVehicleType={editVehicleType}
            parsedEditNumberOfSeats={parsedEditNumberOfSeats}
            handleSelectEditVehicle={handleSelectEditVehicle}
            editNumberOfSeats={editNumberOfSeats}
            setEditNumberOfSeats={setEditNumberOfSeats}
            editMaxPricePerSeat={editMaxPricePerSeat}
            setEditMaxPricePerSeat={setEditMaxPricePerSeat}
            isEditBudgetValid={isEditBudgetValid}
            parsedEditBudget={parsedEditBudget}
            editSeatCapacity={editSeatCapacity}
            isIdentityVerified={isIdentityVerified}
            openEditIdentityVerification={openEditIdentityVerification}
            editDescription={editDescription}
            setEditDescription={setEditDescription}
          />

          {/* Actions fixes en bas */}
          <View style={styles.editModalFooter}>
            <TouchableOpacity style={styles.editModalCancelButton} onPress={() => setShowEditForm(false)}>
              <Text style={styles.editModalCancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.editModalSaveButton,
                (!isEditFormValid || isEditVehicleOptionsLoading) && styles.editModalSaveButtonDisabled
              ]}
              onPress={handleUpdateRequest}
              disabled={isUpdating || isEditVehicleOptionsLoading || !isEditFormValid}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color={Colors.white} />
                  <Text style={styles.editModalSaveText}>Enregistrer</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
