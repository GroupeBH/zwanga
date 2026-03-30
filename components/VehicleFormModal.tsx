import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
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
  brand: string;
  model: string;
  color: string;
  licensePlate: string;
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

export function VehicleFormModal({
  visible,
  title = DEFAULT_TITLE,
  subtitle = DEFAULT_SUBTITLE,
  submitLabel = DEFAULT_SUBMIT_LABEL,
  submitting = false,
  brand,
  model,
  color,
  licensePlate,
  onBrandChange,
  onModelChange,
  onColorChange,
  onLicensePlateChange,
  onClose,
  onSubmit,
}: VehicleFormModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          style={styles.keyboardAvoiding}
        >
          <View style={styles.card}>
            <SafeAreaView edges={['bottom']} style={styles.safeArea}>
              <View style={styles.header}>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
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
                contentContainerStyle={[
                  styles.content,
                  { paddingBottom: Math.max(insets.bottom, 16) + Spacing.xl },
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                bounces={false}
              >
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
                  <Text style={styles.label}>Mod\u00e8le</Text>
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
                      submitting && styles.primaryButtonDisabled,
                    ]}
                    onPress={onSubmit}
                    disabled={submitting}
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
