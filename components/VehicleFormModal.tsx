import { styles } from '../features/screen-styles/components/VehicleFormModal/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { Colors, Spacing } from '@/constants/styles';
import { REGISTERED_VEHICLE_TYPE_OPTIONS } from '@/constants/vehicleTypes';
import type { TripRequestVehicleType } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type VehicleFormModalProps = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  submitting?: boolean;
  errorMessage?: string | null;
  vehicleType: TripRequestVehicleType | null;
  brand: string;
  model: string;
  color: string;
  licensePlate: string;
  onVehicleTypeChange: (value: TripRequestVehicleType) => void;
  onBrandChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onLicensePlateChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

const DEFAULT_TITLE = 'Ajouter un véhicule';
const DEFAULT_SUBTITLE =
  'Indiquez les détails exacts de votre véhicule pour rassurer vos passagers.';
const DEFAULT_SUBMIT_LABEL = 'Enregistrer';

export function VehicleFormModal({
  visible,
  title = DEFAULT_TITLE,
  subtitle = DEFAULT_SUBTITLE,
  submitLabel = DEFAULT_SUBMIT_LABEL,
  submitting = false,
  errorMessage = null,
  vehicleType,
  brand,
  model,
  color,
  licensePlate,
  onVehicleTypeChange,
  onBrandChange,
  onModelChange,
  onColorChange,
  onLicensePlateChange,
  onClose,
  onSubmit,
}: VehicleFormModalProps) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const modelInputRef = useRef<TextInput>(null);
  const colorInputRef = useRef<TextInput>(null);
  const licensePlateInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setKeyboardVisible(false);
    }
  }, [visible]);

  const handleClose = () => {
    if (!submitting) {
      Keyboard.dismiss();
      onClose();
    }
  };

  return (
    <Modal
      transparent
      statusBarTranslucent
      animationType="slide"
      visible={visible}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          style={styles.keyboardAvoiding}
        >
          <View style={[styles.card, keyboardVisible && styles.cardWithKeyboard]}>
            <SafeAreaView edges={keyboardVisible ? [] : ['bottom']} style={styles.safeArea}>
              <View style={[styles.header, keyboardVisible && styles.headerWithKeyboard]}>
                <View style={[styles.badge, keyboardVisible && styles.badgeWithKeyboard]}>
                  <Ionicons
                    name="car-sport-outline"
                    size={keyboardVisible ? 20 : 24}
                    color={Colors.white}
                  />
                </View>
                <View style={styles.headerCopy}>
                  <Text
                    style={[styles.title, keyboardVisible && styles.titleWithKeyboard]}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                  {!keyboardVisible ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Fermer le formulaire"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.closeButton}
                  onPress={handleClose}
                  disabled={submitting}
                >
                  <Ionicons name="close" size={24} color={Colors.gray[500]} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.content,
                  keyboardVisible && styles.contentWithKeyboard,
                  { paddingBottom: Spacing.md },
                ]}
              >
                <View style={styles.inputGroup}>
                  <Text style={styles.sectionLabel}>Type de véhicule</Text>
                  <View style={styles.vehicleTypeList}>
                    {REGISTERED_VEHICLE_TYPE_OPTIONS.map((option) => {
                      const selected = vehicleType === option.id;

                      return (
                        <TouchableOpacity
                          key={option.id}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          accessibilityLabel={`${option.label}. ${option.description}`}
                          activeOpacity={0.82}
                          style={[
                            styles.vehicleTypeOption,
                            selected && styles.vehicleTypeOptionSelected,
                          ]}
                          onPress={() => onVehicleTypeChange(option.id)}
                          disabled={submitting}
                        >
                          <View
                            style={[
                              styles.vehicleTypeIcon,
                              selected && styles.vehicleTypeIconSelected,
                            ]}
                          >
                            <Ionicons
                              name={option.icon}
                              size={22}
                              color={selected ? Colors.primary : Colors.gray[500]}
                            />
                          </View>
                          <View style={styles.vehicleTypeCopy}>
                            <Text
                              style={[
                                styles.vehicleTypeLabel,
                                selected && styles.vehicleTypeLabelSelected,
                              ]}
                              numberOfLines={2}
                            >
                              {option.label}
                            </Text>
                            <Text style={styles.vehicleTypeDescription} numberOfLines={2}>
                              {option.description}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.selectionDot,
                              selected && styles.selectionDotSelected,
                            ]}
                          >
                            {selected ? <View style={styles.selectionDotCore} /> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.fieldsGrid}>
                  <View style={styles.fieldCell}>
                    <Text style={styles.label}>Marque</Text>
                    <TextInput
                      accessibilityLabel="Marque du véhicule"
                      style={[styles.input, keyboardVisible && styles.inputWithKeyboard]}
                      placeholder="Toyota"
                      placeholderTextColor={Colors.gray[400]}
                      value={brand}
                      onChangeText={onBrandChange}
                      onFocus={() => setKeyboardVisible(true)}
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={() => modelInputRef.current?.focus()}
                      blurOnSubmit={false}
                    />
                  </View>

                  <View style={styles.fieldCell}>
                    <Text style={styles.label}>Modèle</Text>
                    <TextInput
                      ref={modelInputRef}
                      accessibilityLabel="Modèle du véhicule"
                      style={[styles.input, keyboardVisible && styles.inputWithKeyboard]}
                      placeholder="Corolla"
                      placeholderTextColor={Colors.gray[400]}
                      value={model}
                      onChangeText={onModelChange}
                      onFocus={() => setKeyboardVisible(true)}
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={() => colorInputRef.current?.focus()}
                      blurOnSubmit={false}
                    />
                  </View>

                  <View style={styles.fieldCell}>
                    <Text style={styles.label}>Couleur</Text>
                    <TextInput
                      ref={colorInputRef}
                      accessibilityLabel="Couleur du véhicule"
                      style={[styles.input, keyboardVisible && styles.inputWithKeyboard]}
                      placeholder="Bleu"
                      placeholderTextColor={Colors.gray[400]}
                      value={color}
                      onChangeText={onColorChange}
                      onFocus={() => setKeyboardVisible(true)}
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={() => licensePlateInputRef.current?.focus()}
                      blurOnSubmit={false}
                    />
                  </View>

                  <View style={styles.fieldCell}>
                    <Text style={styles.label}>Immatriculation</Text>
                    <TextInput
                      ref={licensePlateInputRef}
                      accessibilityLabel="Plaque d'immatriculation"
                      style={[styles.input, keyboardVisible && styles.inputWithKeyboard]}
                      placeholder="ABC-1234"
                      placeholderTextColor={Colors.gray[400]}
                      value={licensePlate}
                      onChangeText={onLicensePlateChange}
                      onFocus={() => setKeyboardVisible(true)}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </View>
                </View>

                {errorMessage ? (
                  <View style={styles.errorBanner} accessibilityRole="alert">
                    <Ionicons name="alert-circle" size={18} color={Colors.danger} />
                    <Text style={styles.errorText} numberOfLines={2}>
                      {errorMessage}
                    </Text>
                  </View>
                ) : null}

              </ScrollView>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.secondaryButton]}
                  onPress={handleClose}
                  disabled={submitting}
                >
                  <Text style={styles.secondaryButtonText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.primaryButton,
                    (submitting || !vehicleType) && styles.primaryButtonDisabled,
                  ]}
                  onPress={onSubmit}
                  disabled={submitting || !vehicleType}
                >
                  {submitting ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>{submitLabel}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}


