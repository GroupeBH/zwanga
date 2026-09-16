import { styles } from '../screen-styles/app/security/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { EmergencyContact } from '@/types';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface EmergencyContactFormModalProps {
  showAddModal: boolean;
  setShowAddModal: React.Dispatch<React.SetStateAction<boolean>>;
  resetForm: () => void;
  insets: EdgeInsets;
  editingContact: EmergencyContact | null;
  formData: { name: string; phone: string; relationship: string; };
  setFormData: React.Dispatch<React.SetStateAction<{ name: string; phone: string; relationship: string; }>>;
  pickFromContacts: () => Promise<void>;
  handleEditContact: () => Promise<void>;
  handleAddContact: () => Promise<void>;
  loading: boolean;
}

export function EmergencyContactFormModal({
  showAddModal,
  setShowAddModal,
  resetForm,
  insets,
  editingContact,
  formData,
  setFormData,
  pickFromContacts,
  handleEditContact,
  handleAddContact,
  loading,
}: EmergencyContactFormModalProps) {
  return (
    <Modal
      visible={showAddModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        setShowAddModal(false);
        resetForm();
      }}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalOverlayTouchable}
          activeOpacity={1}
          onPress={() => {
            setShowAddModal(false);
            resetForm();
          }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 12) : 0}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingContact ? 'Modifier le contact' : 'Ajouter un contact'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                <Ionicons name="close" size={24} color={Colors.gray[600]} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalHintWrap}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
              <Text style={styles.modalHintText}>
                Ce contact sera ensuite disponible dans le choix Qui notifier sur ce trajet.
              </Text>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              contentContainerStyle={styles.modalBodyContent}
            >
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nom *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ex: Jean Dupont"
                  placeholderTextColor={Colors.gray[400]}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                />
              </View>

              <View style={styles.formGroup}>
                <View style={styles.phoneInputRow}>
                  <View style={styles.phoneInputContainer}>
                    <Text style={styles.formLabel}>Numéro de téléphone *</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Ex: +243 900 000 000"
                      placeholderTextColor={Colors.gray[400]}
                      value={formData.phone}
                      onChangeText={(text) => setFormData({ ...formData, phone: text })}
                      keyboardType="phone-pad"
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.contactPickerButton}
                    onPress={pickFromContacts}
                  >
                    <Ionicons name="person-add-outline" size={20} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Relation (optionnel)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ex: Mère, Père, Ami..."
                  placeholderTextColor={Colors.gray[400]}
                  value={formData.relationship}
                  onChangeText={(text) => setFormData({ ...formData, relationship: text })}
                />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { paddingBottom: Platform.OS === 'android' ? Spacing.lg : Math.max(insets.bottom, 16) + 16 }]}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (!formData.name.trim() || !formData.phone.trim()) && styles.saveButtonDisabled,
                ]}
                onPress={editingContact ? handleEditContact : handleAddContact}
                disabled={!formData.name.trim() || !formData.phone.trim() || loading}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingContact ? 'Enregistrer' : 'Ajouter'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
