import { TripEditVehicleList } from './TripEditVehicleList';
import { EditTripStep } from './tripDetailModel';
import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Trip, Vehicle } from '@/types';

interface TripEditFieldsProps {
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
  trip: Trip | undefined;
  editPrice: string;
  setEditPrice: React.Dispatch<React.SetStateAction<string>>;
  editRequiresPassengerKyc: boolean;
  setEditRequiresPassengerKyc: React.Dispatch<React.SetStateAction<boolean>>;
}

export function TripEditFields({
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
  trip,
  editPrice,
  setEditPrice,
  editRequiresPassengerKyc,
  setEditRequiresPassengerKyc,
}: TripEditFieldsProps) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      style={[styles.editModalScrollView, Platform.OS === 'ios' && styles.editModalScrollViewIos]}
      contentContainerStyle={[
        styles.editModalScroll,
        { paddingBottom: Spacing.xl },
      ]}
      scrollIndicatorInsets={{ bottom: editModalBottomPadding }}
    >
      {editStep === 1 ? (
        <>
      {/* ── Section Itinéraire ── */}
      <View style={styles.editSectionHeader}>
        <View style={styles.editSectionIconWrap}>
          <Ionicons name="map-outline" size={15} color={Colors.primary} />
        </View>
        <Text style={styles.editSectionTitle}>Itinéraire</Text>
        <TouchableOpacity style={styles.editSwapBtn} onPress={swapEditRoutePoints}>
          <Ionicons name="swap-vertical" size={14} color={Colors.primary} />
          <Text style={styles.editSwapText}>Inverser</Text>
        </TouchableOpacity>
      </View>

      {/* Mode selector */}
      <View style={styles.editModeRow}>
        <TouchableOpacity
          style={[styles.editModeChip, editRouteMode === 'map' && styles.editModeChipActive]}
          onPress={() => setEditRouteMode('map')}
        >
          <Ionicons name="map-outline" size={13} color={editRouteMode === 'map' ? Colors.primary : Colors.gray[500]} />
          <Text style={[styles.editModeChipText, editRouteMode === 'map' && styles.editModeChipTextActive]}>Carte</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.editModeChip, editRouteMode === 'manual' && styles.editModeChipActive]}
          onPress={() => setEditRouteMode('manual')}
        >
          <Ionicons name="create-outline" size={13} color={editRouteMode === 'manual' ? Colors.primary : Colors.gray[500]} />
          <Text style={[styles.editModeChipText, editRouteMode === 'manual' && styles.editModeChipTextActive]}>Saisie manuelle</Text>
        </TouchableOpacity>
      </View>

      {editRouteMode === 'manual' ? (
        <View style={styles.editRouteCard}>
          <View style={styles.editRouteManualItem}>
            <View style={[styles.editRouteManualDot, { backgroundColor: Colors.success }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.editRouteManualLabel}>Départ</Text>
              <TextInput
                style={styles.editRouteManualInput}
                placeholder="Ex: avenue Kasa-Vubu, Bandal"
                placeholderTextColor={Colors.gray[400]}
                value={editDepartureManualAddress}
                onChangeText={setEditDepartureManualAddress}
                returnKeyType="next"
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
                placeholder="Ex: rond-point Victoire"
                placeholderTextColor={Colors.gray[400]}
                value={editArrivalManualAddress}
                onChangeText={setEditArrivalManualAddress}
                returnKeyType="done"
                onSubmitEditing={handleContinueEditTrip}
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.editRouteCard}>
          <TouchableOpacity
            style={styles.editRouteMapBtn}
            onPress={() => openEditRoutePicker('departure')}
            activeOpacity={0.75}
          >
            <View style={[styles.editRouteMapDot, { backgroundColor: Colors.success + '20' }]}>
              <Ionicons name="location" size={16} color={Colors.success} />
            </View>
            <View style={styles.editRouteMapContent}>
              <Text style={[styles.editRouteMapType, { color: Colors.success }]}>DÉPART</Text>
              <Text style={styles.editRouteMapValue} numberOfLines={1}>{editDepartureDisplay}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>

          <View style={styles.editRouteDividerLine} />

          <TouchableOpacity
            style={styles.editRouteMapBtn}
            onPress={() => openEditRoutePicker('arrival')}
            activeOpacity={0.75}
          >
            <View style={[styles.editRouteMapDot, { backgroundColor: Colors.primary + '18' }]}>
              <Ionicons name="navigate" size={16} color={Colors.primary} />
            </View>
            <View style={styles.editRouteMapContent}>
              <Text style={[styles.editRouteMapType, { color: Colors.primary }]}>ARRIVÉE</Text>
              <Text style={styles.editRouteMapValue} numberOfLines={1}>{editArrivalDisplay}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Section Date & Heure ── */}
        </>
      ) : (
        <>
      <View style={styles.editSectionHeader}>
        <View style={styles.editSectionIconWrap}>
          <Ionicons name="car-sport-outline" size={15} color={Colors.primary} />
        </View>
        <Text style={styles.editSectionTitle}>Véhicule</Text>
      </View>
      {editVehiclesLoading ? (
        <View style={styles.editVehicleState}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.editVehicleStateText}>Chargement des véhicules...</Text>
        </View>
      ) : activeEditVehicles.length === 0 ? (
        <View style={styles.editVehicleState}>
          <Ionicons name="car-outline" size={20} color={Colors.gray[500]} />
          <Text style={styles.editVehicleStateText}>Aucun véhicule actif dans votre profil.</Text>
        </View>
      ) : (
        <TripEditVehicleList
          activeEditVehicles={activeEditVehicles}
          editVehicleId={editVehicleId}
          setEditVehicleId={setEditVehicleId}
        />
      )}

      <View style={styles.editSectionHeader}>
        <View style={[styles.editSectionIconWrap, { backgroundColor: Colors.secondary + '18' }]}>
          <Ionicons name="calendar-outline" size={15} color={Colors.secondary} />
        </View>
        <Text style={styles.editSectionTitle}>Date & Heure de départ</Text>
      </View>
      <View style={styles.editDatetimeRow}>
        <TouchableOpacity
          style={styles.editDatetimeCard}
          onPress={() => openDateOrTimePicker('date')}
          activeOpacity={0.8}
        >
          <View style={styles.editDatetimeIconBox}>
            <Ionicons name="calendar" size={18} color={Colors.primary} />
          </View>
          <View style={styles.editDatetimeTexts}>
            <Text style={styles.editDatetimeLabel}>Date</Text>
            <Text style={styles.editDatetimeValue} numberOfLines={1}>{formattedEditDate}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={Colors.gray[300]} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.editDatetimeCard, { marginLeft: Spacing.sm, borderColor: Colors.secondary + '40' }]}
          onPress={() => openDateOrTimePicker('time')}
          activeOpacity={0.8}
        >
          <View style={[styles.editDatetimeIconBox, { backgroundColor: Colors.secondary + '18' }]}>
            <Ionicons name="time" size={18} color={Colors.secondary} />
          </View>
          <View style={styles.editDatetimeTexts}>
            <Text style={styles.editDatetimeLabel}>Heure</Text>
            <Text style={[styles.editDatetimeValue, { color: Colors.secondary }]}>{formattedEditTime}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={Colors.gray[300]} />
        </TouchableOpacity>
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

      {/* ── Section Capacité & Prix ── */}
      <View style={[styles.editSectionHeader, { marginTop: Spacing.lg }]}>
        <View style={[styles.editSectionIconWrap, { backgroundColor: Colors.success + '18' }]}>
          <Ionicons name="people-outline" size={15} color={Colors.success} />
        </View>
        <Text style={styles.editSectionTitle}>Capacité & Tarif</Text>
      </View>
      <View style={styles.editFieldsRow}>
        <View style={styles.editFieldCard}>
          <View style={styles.editFieldLabelRow}>
            <Ionicons name="people" size={13} color={Colors.success} />
            <Text style={styles.editFieldLabel}>Places dispo.</Text>
          </View>
          <TextInput
            style={styles.editFieldInput}
            keyboardType="numeric"
            placeholder="4"
            placeholderTextColor={Colors.gray[400]}
            value={editSeats}
            onChangeText={setEditSeats}
          />
        </View>
        <View style={[styles.editFieldCard, { marginLeft: Spacing.sm, borderColor: Colors.secondary + '40' }]}>
          <View style={styles.editFieldLabelRow}>
            <Ionicons name="cash" size={13} color={Colors.secondary} />
            <Text style={[styles.editFieldLabel, { color: Colors.secondary }]}>
              {trip?.tripRequestId ? 'Prix validé (FC)' : 'Prix (FC)'}
            </Text>
          </View>
          <TextInput
            style={[styles.editFieldInput, { color: Colors.secondary }]}
            keyboardType="numeric"
            placeholder="5000"
            placeholderTextColor={Colors.gray[400]}
            value={trip?.tripRequestId ? String(trip.price) : editPrice}
            editable={!trip?.tripRequestId}
            accessibilityLabel={trip?.tripRequestId ? 'Prix par place validé par le passager, non modifiable' : 'Prix par place'}
            onChangeText={setEditPrice}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.editPassengerKycCard,
          editRequiresPassengerKyc && styles.editPassengerKycCardActive,
        ]}
        onPress={() => setEditRequiresPassengerKyc((current) => !current)}
        activeOpacity={0.84}
      >
        <View style={styles.editPassengerKycCopy}>
          <View style={styles.editPassengerKycTitleRow}>
            <Ionicons name="shield-checkmark-outline" size={17} color={Colors.primary} />
            <Text style={styles.editPassengerKycTitle}>Passagers vérifiés uniquement</Text>
          </View>
          <Text style={styles.editPassengerKycText}>
            Les passagers devront avoir une vérification d&apos;identité approuvée avant de réserver ou embarquer.
          </Text>
        </View>
        <View
          style={[
            styles.editPassengerKycSwitch,
            editRequiresPassengerKyc && styles.editPassengerKycSwitchActive,
          ]}
        >
          <View
            style={[
              styles.editPassengerKycThumb,
              editRequiresPassengerKyc && styles.editPassengerKycThumbActive,
            ]}
          />
        </View>
      </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}
