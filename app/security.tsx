import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useDialog } from '@/components/ui/DialogProvider';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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
  Linking,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import {
  useGetEmergencyContactsQuery,
  useCreateEmergencyContactMutation,
  useUpdateEmergencyContactMutation,
  useDeleteEmergencyContactMutation,
} from '@/store/api/safetyApi';
import type { EmergencyContact } from '@/types';

type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
  relationship?: string;
};

const MAX_CONTACTS = 5;

export default function SecurityScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const { data: contacts = [], isLoading: isLoadingContacts, refetch } = useGetEmergencyContactsQuery();
  const [createContact, { isLoading: isCreating }] = useCreateEmergencyContactMutation();
  const [updateContact, { isLoading: isUpdating }] = useUpdateEmergencyContactMutation();
  const [deleteContact, { isLoading: isDeleting }] = useDeleteEmergencyContactMutation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    relationship: '',
  });

  const loading = isLoadingContacts || isCreating || isUpdating || isDeleting;

  const requestContactsPermission = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting contacts permission:', error);
      return false;
    }
  };

  const pickFromContacts = async () => {
    try {
      const hasPermission = await requestContactsPermission();
      if (!hasPermission) {
        showDialog({
          title: 'Permission requise',
          message: 'Veuillez autoriser l\'accès aux contacts pour sélectionner un contact',
          variant: 'danger',
          actions: [
            {
              label: 'Paramètres',
              variant: 'primary',
              onPress: () => Linking.openSettings(),
            },
            {
              label: 'Annuler',
              variant: 'secondary',
              onPress: () => {},
            },
          ],
        });
        return;
      }

      const { data } = await Contacts.pickContactAsync();
      if (data && data.phoneNumbers && data.phoneNumbers.length > 0) {
        const phoneNumber = data.phoneNumbers[0].number.replace(/\s/g, '');
        setFormData({
          name: data.name || '',
          phone: phoneNumber,
          relationship: formData.relationship,
        });
      }
    } catch (error) {
      console.error('Error picking contact:', error);
    }
  };

  const handleAddContact = async () => {
    if (!formData.name.trim() || !formData.phone.trim()) {
      showDialog({
        title: 'Champs requis',
        message: 'Veuillez remplir le nom et le numéro de téléphone',
        variant: 'danger',
      });
      return;
    }

    if (contacts.length >= MAX_CONTACTS) {
      showDialog({
        title: 'Limite atteinte',
        message: `Vous ne pouvez ajouter que ${MAX_CONTACTS} contacts d'urgence maximum`,
        variant: 'danger',
      });
      return;
    }

    try {
      await createContact({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        relationship: formData.relationship.trim() || undefined,
      }).unwrap();

      showDialog({
        title: 'Succès',
        message: 'Contact d\'urgence ajouté avec succès',
        variant: 'success',
      });
      resetForm();
      setShowAddModal(false);
      refetch();
    } catch (error: any) {
      showDialog({
        title: 'Erreur',
        message: error?.data?.message || 'Impossible d\'ajouter le contact',
        variant: 'danger',
      });
    }
  };

  const handleEditContact = async () => {
    if (!editingContact || !formData.name.trim() || !formData.phone.trim()) {
      showDialog({
        title: 'Champs requis',
        message: 'Veuillez remplir le nom et le numéro de téléphone',
        variant: 'danger',
      });
      return;
    }

    try {
      await updateContact({
        id: editingContact.id,
        payload: {
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          relationship: formData.relationship.trim() || undefined,
        },
      }).unwrap();

      showDialog({
        title: 'Succès',
        message: 'Contact d\'urgence mis à jour avec succès',
        variant: 'success',
      });
      resetForm();
      setEditingContact(null);
      setShowAddModal(false);
      refetch();
    } catch (error: any) {
      showDialog({
        title: 'Erreur',
        message: error?.data?.message || 'Impossible de mettre à jour le contact',
        variant: 'danger',
      });
    }
  };

  const handleDeleteContact = (contactId: string) => {
    showDialog({
      title: 'Supprimer le contact',
      message: 'Êtes-vous sûr de vouloir supprimer ce contact d\'urgence ?',
      variant: 'danger',
      actions: [
        {
          label: 'Supprimer',
          variant: 'danger',
          onPress: async () => {
            try {
              await deleteContact(contactId).unwrap();
              showDialog({
                title: 'Succès',
                message: 'Contact d\'urgence supprimé avec succès',
                variant: 'success',
              });
              refetch();
            } catch (error: any) {
              showDialog({
                title: 'Erreur',
                message: error?.data?.message || 'Impossible de supprimer le contact',
                variant: 'danger',
              });
            }
          },
        },
        {
          label: 'Annuler',
          variant: 'secondary',
          onPress: () => {},
        },
      ],
    });
  };

  const openEditModal = (contact: EmergencyContact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      phone: contact.phone,
      relationship: contact.relationship || '',
    });
    setShowAddModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      relationship: '',
    });
    setEditingContact(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sécurité</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoadingContacts && contacts.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Section Contacts d'urgence */}
          <Animated.View entering={FadeInDown.delay(100)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Contacts d'urgence</Text>
                <Text style={styles.sectionSubtitle}>
                  Ajoutez jusqu'à {MAX_CONTACTS} personnes à contacter en cas d'urgence
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              {contacts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color={Colors.gray[400]} />
                  <Text style={styles.emptyText}>Aucun contact d'urgence</Text>
                  <Text style={styles.emptySubtext}>
                    Ajoutez des contacts pour qu'ils soient notifiés en cas de problème
                  </Text>
                </View>
              ) : (
                contacts.map((contact, index) => (
                  <View
                    key={contact.id}
                    style={[
                      styles.contactItem,
                      index !== contacts.length - 1 && styles.contactItemBorder,
                    ]}
                  >
                    <View style={styles.contactIcon}>
                      <Ionicons name="person" size={20} color={Colors.primary} />
                    </View>
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName}>{contact.name}</Text>
                      <Text style={styles.contactPhone}>{contact.phone}</Text>
                      {contact.relationship && (
                        <Text style={styles.contactRelationship}>{contact.relationship}</Text>
                      )}
                    </View>
                    <View style={styles.contactActions}>
                      <TouchableOpacity
                        onPress={() => openEditModal(contact)}
                        style={styles.actionButton}
                      >
                        <Ionicons name="create-outline" size={20} color={Colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteContact(contact.id)}
                        style={styles.actionButton}
                      >
                        <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}

              {contacts.length < MAX_CONTACTS && (
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={openAddModal}
                  disabled={loading}
                >
                  <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                  <Text style={styles.addButtonText}>Ajouter un contact</Text>
                </TouchableOpacity>
              )}

              {contacts.length >= MAX_CONTACTS && (
                <View style={styles.maxReached}>
                  <Ionicons name="information-circle-outline" size={18} color={Colors.gray[500]} />
                  <Text style={styles.maxReachedText}>
                    Vous avez atteint la limite de {MAX_CONTACTS} contacts
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Section Informations */}
          <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
            <View style={styles.infoCard}>
              <Ionicons name="shield-checkmark-outline" size={24} color={Colors.primary} />
              <Text style={styles.infoTitle}>Pourquoi ajouter des contacts d'urgence ?</Text>
              <Text style={styles.infoText}>
                En cas de problème pendant un trajet, vos contacts d'urgence seront automatiquement
                notifiés avec votre position et les détails de la situation.
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      )}

      {/* Modal d'ajout/édition */}
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
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
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

              <ScrollView
                style={styles.modalBody}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
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

              <View style={styles.modalFooter}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  backButton: {
    marginRight: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    flex: 1,
  },
  headerSpacer: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: Spacing.xxl,
  },
  section: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  sectionHeader: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  sectionSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...CommonStyles.shadowSm,
  },
  emptyState: {
    padding: Spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  contactItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  contactPhone: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  contactRelationship: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  contactActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    padding: Spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  addButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
    marginLeft: Spacing.sm,
  },
  maxReached: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.gray[50],
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  maxReachedText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginLeft: Spacing.xs,
  },
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  infoTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  infoText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalOverlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  keyboardAvoidingView: {
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  modalBody: {
    maxHeight: 400,
  },
  modalBodyContent: {
    padding: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  formLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  textInput: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  phoneInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  phoneInputContainer: {
    flex: 1,
  },
  contactPickerButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  saveButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  saveButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
});

