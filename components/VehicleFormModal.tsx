import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { REGISTERED_VEHICLE_TYPE_OPTIONS } from '@/constants/vehicleTypes';
import type { TripRequestVehicleType } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
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

const DEFAULT_TITLE = 'Ajouter un v\u00e9hicule';
const DEFAULT_SUBTITLE =
  'Indiquez les d\u00e9tails exacts de votre v\u00e9hicule pour rassurer vos passagers.';
const DEFAULT_SUBMIT_LABEL = 'Enregistrer';
const MODEL_LABEL = 'Mod\u00e8le';

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
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const keyboardOffset = Platform.OS === 'android' ? Math.max(keyboardHeight - insets.bottom, 0) : 0;
  const contentBottomPadding = Math.max(insets.bottom, 16) + Spacing.xl + keyboardOffset;
  const handleClose = () => {
    if (!submitting) {
      onClose();
    }
  };

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          style={styles.keyboardAvoiding}
        >
          <View style={[styles.card, keyboardOffset > 0 && { marginBottom: keyboardOffset }]}>
            <SafeAreaView edges={['bottom']} style={styles.safeArea}>
              <View style={styles.header}>
                <TouchableOpacity style={styles.closeButton} onPress={handleClose} disabled={submitting}>
                  <Ionicons name="close" size={24} color={Colors.gray[500]} />
                </TouchableOpacity>
              </View>

              <View style={styles.hero}>
                <View style={styles.badge}>
                  <Ionicons name="car" size={28} color={Colors.white} />
                </View>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </View>

              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                scrollIndicatorInsets={{ bottom: contentBottomPadding }}
                bounces={false}
              >
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Type de véhicule</Text>
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

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Marque</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Toyota"
                    placeholderTextColor={Colors.gray[400]}
                    value={brand}
                    onChangeText={onBrandChange}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{MODEL_LABEL}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Corolla"
                    placeholderTextColor={Colors.gray[400]}
                    value={model}
                    onChangeText={onModelChange}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Couleur</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Bleu"
                    placeholderTextColor={Colors.gray[400]}
                    value={color}
                    onChangeText={onColorChange}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Plaque d&apos;immatriculation</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="ABC-1234"
                    placeholderTextColor={Colors.gray[400]}
                    value={licensePlate}
                    onChangeText={onLicensePlateChange}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                  />
                </View>

                {errorMessage ? (
                  <View style={styles.errorBanner} accessibilityRole="alert">
                    <Ionicons name="alert-circle" size={20} color={Colors.danger} />
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  </View>
                ) : null}

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.secondaryButton]}
                    onPress={onClose}
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
              </ScrollView>
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
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    width: '100%',
    maxHeight: '92%',
    minHeight: 360,
    shadowColor: Colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -5 },
    elevation: 16,
  },
  safeArea: {
    width: '100%',
  },
  header: {
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  closeButton: {
    padding: 4,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollView: {
    maxHeight: '100%',
  },
  content: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  inputGroup: {
    gap: 4,
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
  label: {
    fontSize: 12,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
  },
  input: {
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: FontSizes.base,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
    padding: Spacing.md,
  },
  errorText: {
    flex: 1,
    color: Colors.danger,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
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
