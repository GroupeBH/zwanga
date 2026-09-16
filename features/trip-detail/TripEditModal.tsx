import { TripEditFields } from './TripEditFields';
import { EditTripStep } from './tripDetailModel';
import { styles } from '../screen-styles/app/trip/detail/index';
import { FormModal } from '@/components/forms/FormLayout';
import { Colors } from '@/constants/styles';
import { useRouteLocationLabels } from '@/hooks/useRouteLocationLabels';
import { getRouteTitle } from '@/utils/routeLocationLabels';
import { Ionicons } from '@expo/vector-icons';
import { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, TouchableOpacity, View } from 'react-native';
import type { Trip, Vehicle } from '@/types';

interface TripEditModalProps {
  editTripModalVisible: boolean;
  closeEditModal: () => void;
  editModalBottomPadding: number;
  trip: Trip | undefined;
  editStep: EditTripStep;
  swapEditRoutePoints: () => void;
  editRouteMode: "manual" | "map";
  setEditRouteMode: React.Dispatch<React.SetStateAction<"manual" | "map">>;
  editDepartureManualAddress: string;
  setEditDepartureManualAddress: React.Dispatch<React.SetStateAction<string>>;
  editArrivalManualAddress: string;
  setEditArrivalManualAddress: React.Dispatch<React.SetStateAction<string>>;
  handleContinueEditTrip: () => void;
  openEditRoutePicker: (target: "departure" | "arrival") => void;
  editDepartureDisplay: string;
  editArrivalDisplay: string;
  editVehiclesLoading: boolean;
  activeEditVehicles: Vehicle[];
  editVehicleId: string | null;
  setEditVehicleId: React.Dispatch<React.SetStateAction<string | null>>;
  openDateOrTimePicker: (mode: "date" | "time") => void;
  formattedEditDate: string;
  formattedEditTime: string;
  iosPickerMode: "date" | "time" | null;
  getEditBaseDate: () => Date;
  handleIosPickerChange: (_event: DateTimePickerEvent, selectedDate?: Date) => void;
  closeIosPicker: () => void;
  editSeats: string;
  setEditSeats: React.Dispatch<React.SetStateAction<string>>;
  editPrice: string;
  setEditPrice: React.Dispatch<React.SetStateAction<string>>;
  editRequiresPassengerKyc: boolean;
  setEditRequiresPassengerKyc: React.Dispatch<React.SetStateAction<boolean>>;
  handleBackToEditRoute: () => void;
  isSavingTrip: boolean;
  handleSaveTrip: () => Promise<void>;
}

export function TripEditModal({
  editTripModalVisible,
  closeEditModal,
  editModalBottomPadding,
  trip,
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
  editVehiclesLoading,
  activeEditVehicles,
  editVehicleId,
  setEditVehicleId,
  openDateOrTimePicker,
  formattedEditDate,
  formattedEditTime,
  iosPickerMode,
  getEditBaseDate,
  handleIosPickerChange,
  closeIosPicker,
  editSeats,
  setEditSeats,
  editPrice,
  setEditPrice,
  editRequiresPassengerKyc,
  setEditRequiresPassengerKyc,
  handleBackToEditRoute,
  isSavingTrip,
  handleSaveTrip,
}: TripEditModalProps) {
  const routeLabels = useRouteLocationLabels(trip, editTripModalVisible);
  return (
    <FormModal
      transparent={Platform.OS === 'android'}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
      statusBarTranslucent={Platform.OS === 'android'}
      navigationBarTranslucent={Platform.OS === 'android'}
      visible={editTripModalVisible}
      onRequestClose={closeEditModal}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        style={[styles.editModalKeyboard, Platform.OS === 'ios' && styles.editModalKeyboardIos]}
      >
        <View style={[styles.editModalOverlay, Platform.OS === 'ios' && styles.editModalOverlayIos]}>
          {Platform.OS === 'android' && (
            <TouchableOpacity style={styles.editModalBackdrop} activeOpacity={1} onPress={closeEditModal} />
          )}
          <View
            style={[
              styles.editModalSheet,
              Platform.OS === 'ios' && styles.editModalSheetIos,
              { paddingBottom: editModalBottomPadding },
            ]}
          >
            {Platform.OS === 'android' && <View style={styles.editModalHandle} />}

          {/* Header */}
          <View style={styles.editModalHeader}>
            <View style={styles.editModalHeaderIcon}>
              <Ionicons name="create" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.editModalTitle}>Modifier le trajet</Text>
              {trip && (
                <Text style={styles.editModalSubtitle} numberOfLines={1}>
                  {getRouteTitle(routeLabels)}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={closeEditModal} style={styles.editModalCloseBtn}>
              <Ionicons name="close" size={20} color={Colors.gray[600]} />
            </TouchableOpacity>
          </View>

          <View style={styles.editStepIndicator}>
            <View style={[styles.editStepPill, editStep === 1 && styles.editStepPillActive]}>
              <Text style={[styles.editStepText, editStep === 1 && styles.editStepTextActive]}>
                1. Itinéraire
              </Text>
            </View>
            <View style={[styles.editStepPill, editStep === 2 && styles.editStepPillActive]}>
              <Text style={[styles.editStepText, editStep === 2 && styles.editStepTextActive]}>
                2. Détails
              </Text>
            </View>
          </View>

          <TripEditFields
            editModalBottomPadding={editModalBottomPadding}
            editStep={editStep}
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
            editVehiclesLoading={editVehiclesLoading}
            activeEditVehicles={activeEditVehicles}
            editVehicleId={editVehicleId}
            setEditVehicleId={setEditVehicleId}
            openDateOrTimePicker={openDateOrTimePicker}
            formattedEditDate={formattedEditDate}
            formattedEditTime={formattedEditTime}
            iosPickerMode={iosPickerMode}
            getEditBaseDate={getEditBaseDate}
            handleIosPickerChange={handleIosPickerChange}
            closeIosPicker={closeIosPicker}
            editSeats={editSeats}
            setEditSeats={setEditSeats}
            trip={trip}
            editPrice={editPrice}
            setEditPrice={setEditPrice}
            editRequiresPassengerKyc={editRequiresPassengerKyc}
            setEditRequiresPassengerKyc={setEditRequiresPassengerKyc}
          />

          {/* ── Actions ── */}
          <View style={styles.editModalActions}>
            <TouchableOpacity
              style={styles.editModalCancelBtn}
              onPress={editStep === 1 ? closeEditModal : handleBackToEditRoute}
            >
              {editStep === 2 && <Ionicons name="arrow-back" size={18} color={Colors.gray[700]} />}
              <Text style={styles.editModalCancelText}>{editStep === 1 ? 'Annuler' : 'Retour'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.editModalSaveBtn, isSavingTrip && { opacity: 0.7 }]}
              onPress={editStep === 1 ? handleContinueEditTrip : handleSaveTrip}
              disabled={isSavingTrip}
            >
              {editStep === 1 ? (
                <>
                  <Text style={styles.editModalSaveText}>Suivant</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                </>
              ) : isSavingTrip ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                  <Text style={styles.editModalSaveText}>Enregistrer</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
        </View>
      </KeyboardAvoidingView>
    </FormModal>
  );
}
