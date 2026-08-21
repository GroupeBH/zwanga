import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { REGISTERED_VEHICLE_TYPE_OPTIONS } from '@/constants/vehicleTypes';
import type { TripRequestVehicleType } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const modelInputRef = useRef<TextInput>(null);
  const colorInputRef = useRef<TextInput>(null);
  const licensePlateInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

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

              <View
                style={[
                  styles.content,
                  keyboardVisible && styles.contentWithKeyboard,
                  { paddingBottom: keyboardVisible ? Spacing.sm : Math.max(insets.bottom, Spacing.lg) },
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
              </View>
            </SafeAreaView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  keyboardAvoiding: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    minHeight: '70%',
    maxHeight: '96%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    shadowColor: Colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -5 },
    elevation: 16,
  },
  cardWithKeyboard: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  safeArea: {
    width: '100%',
  },
  header: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerWithKeyboard: {
    minHeight: 56,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWithKeyboard: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Colors.gray[900],
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  titleWithKeyboard: {
    fontSize: FontSizes.lg,
  },
  subtitle: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    lineHeight: 17,
    marginTop: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[50],
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    gap: Spacing.md,
  },
  contentWithKeyboard: {
    gap: Spacing.sm,
  },
  inputGroup: {
    gap: 6,
  },
  sectionLabel: {
    color: Colors.gray[700],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  vehicleTypeList: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
  },
  vehicleTypeOption: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    minHeight: 126,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.white,
    paddingHorizontal: 6,
    paddingVertical: Spacing.sm,
  },
  vehicleTypeOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '0D',
  },
  vehicleTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  vehicleTypeIconSelected: {
    backgroundColor: Colors.primary + '18',
  },
  vehicleTypeCopy: {
    width: '100%',
    alignItems: 'center',
    gap: 3,
    marginTop: 6,
  },
  vehicleTypeLabel: {
    color: Colors.gray[800],
    fontSize: FontSizes.xs,
    lineHeight: 15,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  vehicleTypeLabelSelected: {
    color: Colors.primaryDark,
  },
  vehicleTypeDescription: {
    color: Colors.gray[500],
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },
  selectionDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionDotSelected: {
    borderColor: Colors.primary,
  },
  selectionDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  fieldsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  fieldCell: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '46%',
    gap: 4,
  },
  label: {
    color: Colors.gray[700],
    fontSize: 11,
    fontWeight: FontWeights.bold,
  },
  input: {
    minHeight: 48,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
  },
  inputWithKeyboard: {
    minHeight: 42,
    paddingVertical: 7,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  errorText: {
    flex: 1,
    color: Colors.danger,
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingTop: Spacing.lg,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: Colors.primary,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  secondaryButtonText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
});
