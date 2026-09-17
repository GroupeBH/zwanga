import React from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { VehiclePlateHint } from '@/components/forms/VehiclePlateHint';
import { isValidVehiclePlate, normalizeVehiclePlate, VEHICLE_PLATE_EXAMPLE } from '@/utils/vehiclePlate';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from './styles';

interface VehicleModalProps {
  visible: boolean;
  onClose: () => void;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehiclePlate: string;
  onBrandChange: (brand: string) => void;
  onModelChange: (model: string) => void;
  onColorChange: (color: string) => void;
  onPlateChange: (plate: string) => void;
}

export function VehicleModal({
  visible,
  onClose,
  vehicleBrand,
  vehicleModel,
  vehicleColor,
  vehiclePlate,
  onBrandChange,
  onModelChange,
  onColorChange,
  onPlateChange,
}: VehicleModalProps) {
  const plateValid = isValidVehiclePlate(vehiclePlate);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.modalContent, { maxHeight: '100%', flexShrink: 1 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Détails du véhicule</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.gray[900]} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingBottom: 16 }}>
            <View style={styles.inputWrapper}>
              <Ionicons name="car-sport-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Marque (ex: Toyota)"
                placeholderTextColor={Colors.gray[400]}
                value={vehicleBrand}
                onChangeText={onBrandChange}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="car-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Modèle (ex: RAV4)"
                placeholderTextColor={Colors.gray[400]}
                value={vehicleModel}
                onChangeText={onModelChange}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="color-palette-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Couleur"
                placeholderTextColor={Colors.gray[400]}
                value={vehicleColor}
                onChangeText={onColorChange}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="card-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                accessibilityLabel="Plaque d'immatriculation"
                placeholder={`Plaque (ex. ${VEHICLE_PLATE_EXAMPLE})`}
                placeholderTextColor={Colors.gray[400]}
                value={vehiclePlate}
                onChangeText={(text) => onPlateChange(normalizeVehiclePlate(text))}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
            <VehiclePlateHint value={vehiclePlate} />

            <TouchableOpacity
              style={[styles.mainButton, plateValid ? styles.mainButtonActive : styles.mainButtonDisabled]}
              disabled={!plateValid}
              onPress={() => { if (plateValid) onClose(); }}
            >
              <Text style={styles.mainButtonText}>Valider</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

