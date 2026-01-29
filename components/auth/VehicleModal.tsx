import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal } from 'react-native';
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
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Détails du véhicule</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.gray[900]} />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 16 }}>
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
                placeholder="Plaque (ex: 1234AB01)"
                placeholderTextColor={Colors.gray[400]}
                value={vehiclePlate}
                onChangeText={onPlateChange}
                autoCapitalize="characters"
              />
            </View>

            <TouchableOpacity
              style={[styles.mainButton, styles.mainButtonActive]}
              onPress={onClose}
            >
              <Text style={styles.mainButtonText}>Valider</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

