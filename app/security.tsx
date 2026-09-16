import { useEmergencyContactActions } from '../hooks/security/useEmergencyContactActions';
import { MAX_CONTACTS } from '../features/security/emergencyContactsModel';
import { useDeviceEmergencyContacts } from '../hooks/security/useDeviceEmergencyContacts';
import { EmergencyContactFormModal } from '../features/security/EmergencyContactFormModal';
import { styles } from '../features/screen-styles/app/security/index';
import { Colors } from '@/constants/styles';
import { PoliceContactPanel } from '@/components/PoliceContactPanel';
import { useDialog } from '@/components/ui/DialogProvider';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useGetEmergencyContactsQuery,
  useCreateEmergencyContactMutation,
  useUpdateEmergencyContactMutation,
  useDeleteEmergencyContactMutation,
} from '@/store/api/safetyApi';
import type { EmergencyContact } from '@/types';

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

  const { pickFromContacts } = useDeviceEmergencyContacts({
    showDialog,
    setFormData,
    formData,
  });

  const { openAddModal, openEditModal, handleDeleteContact, resetForm, handleEditContact, handleAddContact } = useEmergencyContactActions({
    setFormData,
    setEditingContact,
    formData,
    showDialog,
    contacts,
    createContact,
    setShowAddModal,
    refetch,
    editingContact,
    updateContact,
    deleteContact,
  });

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
      <EmergencyContactFormModal
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        resetForm={resetForm}
        insets={insets}
        editingContact={editingContact}
        formData={formData}
        setFormData={setFormData}
        pickFromContacts={pickFromContacts}
        handleEditContact={handleEditContact}
        handleAddContact={handleAddContact}
        loading={loading}
      />
    </SafeAreaView>
  );
}





