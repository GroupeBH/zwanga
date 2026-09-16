import { RequestEditVehicleOptions } from './RequestEditVehicleOptions';
import { formatCdfPrice } from './requestDetailModel';
import { styles } from '../screen-styles/app/request/detail/index';
import type { AddressInputMode } from '@/components/AddressEntryModeSelector';
import { Colors } from '@/constants/styles';
import { PassengerSeatNotice } from '@/components/PassengerSeatNotice';
import { getPassengerSeatValidation } from '@/utils/passengerSeats';
import { type TripRequestVehiclePriceOption } from '@/store/api/tripRequestApi';
import type { TripRequestVehicleType } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React from 'react';
import { Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface RequestEditFieldsProps {
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
}

export function RequestEditFields({
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
}: RequestEditFieldsProps) {
  return (
    <ScrollView
      style={styles.editModalScrollView}
      contentContainerStyle={styles.editModalScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* ── Section Itinéraire ── */}
      <View style={styles.editSectionHeader}>
        <View style={styles.editSectionIconWrap}>
          <Ionicons name="map-outline" size={15} color={Colors.primary} />
        </View>
        <Text style={styles.editSectionTitle}>Itinéraire</Text>
      </View>

      {/* Mode selector */}
      <View style={styles.editModeRow}>
        <TouchableOpacity
          style={[styles.editModeChip, editAddressInputMode === 'map' && styles.editModeChipActive]}
          onPress={() => setEditAddressInputMode('map')}
        >
          <Ionicons name="map-outline" size={13} color={editAddressInputMode === 'map' ? Colors.primary : Colors.gray[500]} />
          <Text style={[styles.editModeChipText, editAddressInputMode === 'map' && styles.editModeChipTextActive]}>Carte</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.editModeChip, editAddressInputMode === 'manual' && styles.editModeChipActive]}
          onPress={() => setEditAddressInputMode('manual')}
        >
          <Ionicons name="create-outline" size={13} color={editAddressInputMode === 'manual' ? Colors.primary : Colors.gray[500]} />
          <Text style={[styles.editModeChipText, editAddressInputMode === 'manual' && styles.editModeChipTextActive]}>Saisie manuelle</Text>
        </TouchableOpacity>
      </View>

      {editAddressInputMode === 'manual' ? (
        <View style={styles.editRouteCard}>
          <View style={styles.editRouteManualItem}>
            <View style={[styles.editRouteManualDot, { backgroundColor: Colors.success }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.editRouteManualLabel}>Départ</Text>
              <TextInput
                style={styles.editRouteManualInput}
                placeholder="Adresse de départ"
                placeholderTextColor={Colors.gray[400]}
                value={editDepartureManualAddress}
                onChangeText={setEditDepartureManualAddress}
              />
            </View>
          </View>
          <View style={styles.editRouteDividerLine} />
          <View style={styles.editRouteManualItem}>
            <View style={[styles.editRouteManualDot, { backgroundColor: Colors.primary }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.editRouteManualLabel}>Arrivée</Text>
              <TextInput
                style={styles.editRouteManualInput}
                placeholder="Adresse d'arrivée"
                placeholderTextColor={Colors.gray[400]}
                value={editArrivalManualAddress}
                onChangeText={setEditArrivalManualAddress}
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.editRouteCard}>
          <TouchableOpacity
            style={styles.editRouteMapBtn}
            onPress={() => openEditLocationPicker('departure')}
            activeOpacity={0.75}
          >
            <View style={[styles.editRouteMapDot, { backgroundColor: Colors.success + '20' }]}>
              <Ionicons name="location" size={16} color={Colors.success} />
            </View>
            <View style={styles.editRouteMapContent}>
              <Text style={[styles.editRouteMapType, { color: Colors.success }]}>DÉPART</Text>
              <Text style={styles.editRouteMapValue} numberOfLines={1}>
                {editDepartureAddress || 'Sélectionner sur la carte'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>

          <View style={styles.editRouteDividerLine} />

          <TouchableOpacity
            style={styles.editRouteMapBtn}
            onPress={() => openEditLocationPicker('arrival')}
            activeOpacity={0.75}
          >
            <View style={[styles.editRouteMapDot, { backgroundColor: Colors.primary + '18' }]}>
              <Ionicons name="navigate" size={16} color={Colors.primary} />
            </View>
            <View style={styles.editRouteMapContent}>
              <Text style={[styles.editRouteMapType, { color: Colors.primary }]}>ARRIVÉE</Text>
              <Text style={styles.editRouteMapValue} numberOfLines={1}>
                {editArrivalAddress || 'Sélectionner sur la carte'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>
        </View>
      )}

      {/* Fenêtre horaire */}
      <View style={styles.editSection}>
        <View style={styles.editSectionHeader}>
          <Ionicons name="calendar" size={20} color={Colors.warning} />
          <Text style={styles.editSectionTitle}>Créneau de départ</Text>
        </View>
        
        {/* Min */}
        <View style={styles.editDateTimeRow}>
          <Text style={styles.editDateTimeLabel}>Au plus tôt</Text>
          <TouchableOpacity style={styles.editDateTimeButton} onPress={() => openEditDateOrTimePickerMin('date')}>
            <Ionicons name="calendar-outline" size={16} color={Colors.gray[600]} />
            <Text style={styles.editDateTimeText}>{editDepartureDateMin ? editDepartureDateMin.toLocaleDateString('fr-FR') : 'Date'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editDateTimeButton} onPress={() => openEditDateOrTimePickerMin('time')}>
            <Ionicons name="time-outline" size={16} color={Colors.gray[600]} />
            <Text style={styles.editDateTimeText}>{editDepartureDateMin ? editDepartureDateMin.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : 'Heure'}</Text>
          </TouchableOpacity>
        </View>

        {/* Max */}
        <View style={styles.editDateTimeRow}>
          <Text style={styles.editDateTimeLabel}>Au plus tard</Text>
          <TouchableOpacity style={styles.editDateTimeButton} onPress={() => openEditDateOrTimePickerMax('date')}>
            <Ionicons name="calendar-outline" size={16} color={Colors.gray[600]} />
            <Text style={styles.editDateTimeText}>{editDepartureDateMax ? editDepartureDateMax.toLocaleDateString('fr-FR') : 'Date'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editDateTimeButton} onPress={() => openEditDateOrTimePickerMax('time')}>
            <Ionicons name="time-outline" size={16} color={Colors.gray[600]} />
            <Text style={styles.editDateTimeText}>{editDepartureDateMax ? editDepartureDateMax.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : 'Heure'}</Text>
          </TouchableOpacity>
        </View>

        {editScheduleError ? (
          <Text style={styles.editScheduleError}>{editScheduleError}</Text>
        ) : null}

        {/* iOS Pickers intégrés */}
        {Platform.OS === 'ios' && editIosPickerModeMin && editDepartureDateMin && (
          <View style={styles.editIosPickerWrapper}>
            <DateTimePicker value={editDepartureDateMin} mode={editIosPickerModeMin} display="spinner" onChange={handleEditIosPickerChangeMin} minimumDate={new Date()} />
          </View>
        )}
        {Platform.OS === 'ios' && editIosPickerModeMax && editDepartureDateMax && (
          <View style={styles.editIosPickerWrapper}>
            <DateTimePicker value={editDepartureDateMax} mode={editIosPickerModeMax} display="spinner" onChange={handleEditIosPickerChangeMax} minimumDate={editDepartureDateMin || new Date()} />
          </View>
        )}
      </View>

      {/* Type de véhicule et estimation */}
      <RequestEditVehicleOptions
        editVehiclePriceMultiplier={editVehiclePriceMultiplier}
        isEditVehicleOptionsLoading={isEditVehicleOptionsLoading}
        editVehicleOptions={editVehicleOptions}
        isEditVehicleOptionsError={isEditVehicleOptionsError}
        retryEditVehicleOptions={retryEditVehicleOptions}
        editVehicleType={editVehicleType}
        parsedEditNumberOfSeats={parsedEditNumberOfSeats}
        handleSelectEditVehicle={handleSelectEditVehicle}
      />

      {/* Capacité & Prix */}
      <View style={styles.editSection}>
        <View style={styles.editSectionHeader}>
          <Ionicons name="people" size={20} color={Colors.info} />
          <Text style={styles.editSectionTitle}>Capacité & Budget</Text>
        </View>
        <View style={styles.editRowInputs}>
          <View style={{flex: 1}}>
            <Text style={styles.editLabel}>Places demandées</Text>
            <TextInput
              style={styles.editInput}
              keyboardType="numeric"
              placeholder="Ex: 1"
              value={editNumberOfSeats}
              onChangeText={(value) => setEditNumberOfSeats(value.replace(/[^0-9]/g, ''))}
            />
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.editLabel}>Prix max/place (FC)</Text>
            <TextInput
              style={styles.editInput}
              keyboardType="numeric"
              placeholder={isEditVehicleOptionsLoading ? 'Calcul en cours…' : 'Votre budget'}
              value={editMaxPricePerSeat}
              onChangeText={setEditMaxPricePerSeat}
            />
          </View>
        </View>
        <Text style={styles.editVehicleSubtitle}>
          {isEditVehicleOptionsLoading
            ? 'Recalcul du prix pour votre demande…'
            : isEditBudgetValid && parsedEditBudget !== undefined && Number.isSafeInteger(parsedEditNumberOfSeats) && parsedEditNumberOfSeats > 0
              ? `Total : ${formatCdfPrice(parsedEditBudget * parsedEditNumberOfSeats)} pour ${parsedEditNumberOfSeats} place${parsedEditNumberOfSeats > 1 ? 's' : ''}. Ce prix sera enregistré à la confirmation.`
              : 'Indiquez un budget par place avant de confirmer.'}
        </Text>
      </View>

      {getPassengerSeatValidation(parsedEditNumberOfSeats, true, editSeatCapacity) && (
        <Text style={styles.editScheduleError}>{getPassengerSeatValidation(parsedEditNumberOfSeats, true, editSeatCapacity)?.message}</Text>
      )}
      <PassengerSeatNotice isIdentityVerified={isIdentityVerified} capacity={editSeatCapacity} onVerify={() => openEditIdentityVerification()} />

      {/* Description */}
      <View style={styles.editSection}>
        <Text style={styles.editLabel}>Note pour le conducteur (optionnel)</Text>
        <TextInput
          style={[styles.editInput, styles.editTextArea]}
          multiline
          numberOfLines={4}
          placeholder="Bagages, contraintes horaires, précisions..."
          value={editDescription}
          onChangeText={setEditDescription}
        />
      </View>
    </ScrollView>
  );
}
