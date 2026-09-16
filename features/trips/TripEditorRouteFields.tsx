import { styles } from '../screen-styles/app/tabs/trips/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

interface TripEditorRouteFieldsProps {
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
}

export function TripEditorRouteFields({
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
}: TripEditorRouteFieldsProps) {
  return (
    <View style={styles.modalRouteCard}>
      <View style={styles.modalRouteHeader}>
        <Text style={styles.modalRouteTitle}>Points du trajet</Text>
        <TouchableOpacity style={styles.modalSwapButton} onPress={swapEditRoutePoints}>
          <Ionicons name="swap-vertical" size={16} color={Colors.primary} />
          <Text style={styles.modalSwapButtonText}>Echanger</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.modalRouteModeRow}>
        <TouchableOpacity
          style={[
            styles.modalRouteModeChip,
            editRouteMode === 'map' && styles.modalRouteModeChipActive,
          ]}
          onPress={() => setEditRouteMode('map')}
        >
          <Ionicons
            name="map-outline"
            size={14}
            color={editRouteMode === 'map' ? Colors.primary : Colors.gray[500]}
          />
          <Text
            style={[
              styles.modalRouteModeChipText,
              editRouteMode === 'map' && styles.modalRouteModeChipTextActive,
            ]}
          >
            Sélection sur carte
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modalRouteModeChip,
            editRouteMode === 'manual' && styles.modalRouteModeChipActive,
          ]}
          onPress={() => setEditRouteMode('manual')}
        >
          <Ionicons
            name="create-outline"
            size={14}
            color={editRouteMode === 'manual' ? Colors.primary : Colors.gray[500]}
          />
          <Text
            style={[
              styles.modalRouteModeChipText,
              editRouteMode === 'manual' && styles.modalRouteModeChipTextActive,
            ]}
          >
            Saisie manuelle
          </Text>
        </TouchableOpacity>
      </View>

      {editRouteMode === 'manual' ? (
        <>
          <Text style={styles.modalLabel}>Adresse de départ</Text>
          <TextInput
            style={[styles.modalInput, styles.modalRouteInput]}
            placeholder="Ex: avenue Kasa-Vubu, Bandal"
            placeholderTextColor={Colors.gray[400]}
            value={editDepartureManualAddress}
            onChangeText={setEditDepartureManualAddress}
            returnKeyType="next"
          />
          <Text style={styles.modalLabel}>Adresse d’arrivée</Text>
          <TextInput
            style={[styles.modalInput, styles.modalRouteInput]}
            placeholder="Ex: rond-point Victoire"
            placeholderTextColor={Colors.gray[400]}
            value={editArrivalManualAddress}
            onChangeText={setEditArrivalManualAddress}
            returnKeyType="done"
            onSubmitEditing={handleContinueEditTrip}
          />
        </>
      ) : (
        <>
          <TouchableOpacity
            style={styles.modalRoutePointButton}
            onPress={() => openEditRoutePicker('departure')}
          >
            <View style={styles.modalRoutePointIcon}>
              <Ionicons name="location" size={15} color={Colors.success} />
            </View>
            <View style={styles.modalRoutePointContent}>
              <Text style={styles.modalRoutePointLabel}>Départ</Text>
              <Text style={styles.modalRoutePointValue} numberOfLines={2}>
                {editDepartureDisplay}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modalRoutePointButton}
            onPress={() => openEditRoutePicker('arrival')}
          >
            <View style={styles.modalRoutePointIcon}>
              <Ionicons name="navigate" size={15} color={Colors.primary} />
            </View>
            <View style={styles.modalRoutePointContent}>
              <Text style={styles.modalRoutePointLabel}>Arrivée</Text>
              <Text style={styles.modalRoutePointValue} numberOfLines={2}>
                {editArrivalDisplay}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
