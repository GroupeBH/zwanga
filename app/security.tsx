import { styles } from '../features/screen-styles/app/security/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { Colors, Spacing } from '@/constants/styles';
import { PoliceContactPanel } from '@/components/PoliceContactPanel';
import { useDialog } from '@/components/ui/DialogProvider';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
} from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import {
  useGetEmergencyContactsQuery,
  useCreateEmergencyContactMutation,
  useUpdateEmergencyContactMutation,
  useDeleteEmergencyContactMutation,
} from '@/store/api/safetyApi';
import type { EmergencyContact } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';

const MAX_CONTACTS = 5;

export default function SecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const remainingContacts = Math.max(0, MAX_CONTACTS - contacts.length);

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

      const pickedContact = await Contacts.presentContactPickerAsync();
      if (pickedContact && pickedContact.phoneNumbers && pickedContact.phoneNumbers.length > 0) {
        const phoneNumber = pickedContact.phoneNumbers[0]?.number?.replace(/\s/g, '') ?? '';
        if (!phoneNumber) return;
        setFormData({
          name: pickedContact.name || '',
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
        message: getApiErrorMessage(error, 'Impossible d\'ajouter le contact.'),
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
        message: getApiErrorMessage(error, 'Impossible de mettre à jour le contact.'),
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
          variant: 'primary',
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
                message: getApiErrorMessage(error, 'Impossible de supprimer le contact.'),
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
          {/* Section Demarrage rapide */}
          <Animated.View entering={FadeInDown.delay(40)} style={styles.section}>
            <View style={styles.quickStartCard}>
              <View style={styles.quickStartHeader}>
                <View style={styles.quickStartIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={Colors.primary} />
                </View>
                <View style={styles.quickStartHeaderCopy}>
                  <Text style={styles.quickStartTitle}>Protection trajet en 3 étapes</Text>
                  <Text style={styles.quickStartSubtitle}>
                    Ajoutez vos proches ici, puis choisissez qui notifier pendant le trajet.
                  </Text>
                </View>
              </View>

              <View style={styles.quickStartSteps}>
                <View style={styles.quickStartStepRow}>
                  <View style={styles.quickStartStepBullet}>
                    <Text style={styles.quickStartStepBulletText}>1</Text>
                  </View>
                  <Text style={styles.quickStartStepText}>
                    Ajoutez vos contacts d’urgence sur cette page.
                  </Text>
                </View>
                <View style={styles.quickStartStepRow}>
                  <View style={styles.quickStartStepBullet}>
                    <Text style={styles.quickStartStepBulletText}>2</Text>
                  </View>
                  <Text style={styles.quickStartStepText}>
                    Pendant un trajet, choisissez simplement ceux à notifier.
                  </Text>
                </View>
                <View style={styles.quickStartStepRow}>
                  <View style={styles.quickStartStepBullet}>
                    <Text style={styles.quickStartStepBulletText}>3</Text>
                  </View>
                  <Text style={styles.quickStartStepText}>
                    Le backend gère ensuite les notifications automatiques selon les étapes du trajet.
                  </Text>
                </View>
              </View>

              {contacts.length < MAX_CONTACTS ? (
                <TouchableOpacity
                  style={styles.quickStartButton}
                  onPress={openAddModal}
                  disabled={loading}
                >
                  <Ionicons name="add-circle" size={18} color={Colors.white} />
                  <Text style={styles.quickStartButtonText}>
                    {contacts.length === 0
                      ? 'Ajouter mon premier contact d’urgence'
                      : 'Ajouter un autre contact d’urgence'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.quickStartLimitBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  <Text style={styles.quickStartLimitText}>
                    Limite atteinte ({MAX_CONTACTS} contacts)
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80)} style={styles.section}>
            <PoliceContactPanel />
          </Animated.View>

          {/* Section Contacts d'urgence */}
          <Animated.View entering={FadeInDown.delay(120)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Contacts d’urgence</Text>
                <Text style={styles.sectionSubtitle}>
                  Sélectionnables ensuite pendant le suivi d’un trajet ({remainingContacts} place(s) restante(s))
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              {contacts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color={Colors.gray[400]} />
                  <Text style={styles.emptyText}>Aucun contact d’urgence</Text>
                  <Text style={styles.emptySubtext}>
                    Commencez par ajouter au moins 1 proche. Vous pourrez ensuite le sélectionner sur chaque trajet.
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyPrimaryButton}
                    onPress={openAddModal}
                    disabled={loading}
                  >
                    <Ionicons name="add-circle" size={18} color={Colors.white} />
                    <Text style={styles.emptyPrimaryButtonText}>Ajouter un contact d’urgence</Text>
                  </TouchableOpacity>
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
                  <Text style={styles.addButtonText}>Ajouter un contact d’urgence</Text>
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
              <Text style={styles.infoTitle}>Pourquoi ajouter des contacts d’urgence ?</Text>
              <Text style={styles.infoText}>
                Les proches ajoutés ici sont proposés quand vous choisissez qui notifier sur un trajet.
                Une fois sélectionnés, le backend gere automatiquement les notifications de sécurité.
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
    </SafeAreaView>
  );
}





