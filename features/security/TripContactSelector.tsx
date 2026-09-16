import { styles } from '../screen-styles/components/trip/TripSecurityPanel/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { EmergencyContact } from '@/types';

interface TripContactSelectorProps {
  compact: boolean;
  role: "driver" | "passenger";
  setSelectorVisible: React.Dispatch<React.SetStateAction<boolean>>;
  closeContactForm: () => void;
  isCreatingContact: boolean;
  activeContacts: EmergencyContact[];
  contactFormVisible: boolean;
  setContactFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  selectedContactIds: string[];
  newContactName: string;
  setNewContactName: React.Dispatch<React.SetStateAction<string>>;
  newContactPhone: string;
  setNewContactPhone: React.Dispatch<React.SetStateAction<string>>;
  newContactRelationship: string;
  setNewContactRelationship: React.Dispatch<React.SetStateAction<string>>;
  handleCreateContact: () => Promise<void>;
  isLoadingContacts: boolean;
  selectAll: () => void;
  clearAll: () => void;
  toggleContact: (contactId: string) => void;
  isSaving: boolean;
  isPassengerReadyForSelection: boolean;
  handleSaveSelection: () => Promise<void>;
}

export function TripContactSelector({
  compact,
  role,
  setSelectorVisible,
  closeContactForm,
  isCreatingContact,
  activeContacts,
  contactFormVisible,
  setContactFormVisible,
  selectedContactIds,
  newContactName,
  setNewContactName,
  newContactPhone,
  setNewContactPhone,
  newContactRelationship,
  setNewContactRelationship,
  handleCreateContact,
  isLoadingContacts,
  selectAll,
  clearAll,
  toggleContact,
  isSaving,
  isPassengerReadyForSelection,
  handleSaveSelection,
}: TripContactSelectorProps) {
  return (
    <View style={[styles.inlineSelectorCard, compact && styles.inlineSelectorCardCompact]}>
      <View style={styles.modalHeader}>
        <View style={styles.modalHeaderCopy}>
          <Text style={[styles.modalTitle, compact && styles.modalTitleCompact]}>
            Ajouter / notifier des proches
          </Text>
          <Text style={[styles.modalSubtitle, compact && styles.modalSubtitleCompact]}>
            {compact
              ? 'Ajoutez un proche ou cochez une personne existante.'
              : role === 'driver'
                ? 'Ces contacts seront prévenus automatiquement au début et à la fin du trajet.'
                : 'Ces contacts seront prévenus automatiquement pendant ce trajet.'}
          </Text>
        </View>
        {!compact ? (
          <TouchableOpacity
            onPress={() => {
              setSelectorVisible(false);
              closeContactForm();
            }}
            disabled={isCreatingContact}
          >
            <Ionicons name="close" size={22} color={Colors.gray[700]} />
          </TouchableOpacity>
        ) : null}
      </View>

      {activeContacts.length > 0 || contactFormVisible ? (
        <View style={styles.selectorToolbar}>
          <TouchableOpacity
            style={[
              styles.addContactTrigger,
              contactFormVisible && styles.addContactTriggerActive,
            ]}
            onPress={() => setContactFormVisible(true)}
            disabled={contactFormVisible || isCreatingContact}
            activeOpacity={0.85}
          >
            <Ionicons
              name={contactFormVisible ? 'person' : 'person-add-outline'}
              size={15}
              color={contactFormVisible ? Colors.primary : Colors.white}
            />
            <Text
              style={[
                styles.addContactTriggerText,
                contactFormVisible && styles.addContactTriggerTextActive,
              ]}
            >
              {contactFormVisible ? 'Nouveau proche' : 'Ajouter un proche'}
            </Text>
          </TouchableOpacity>
          {activeContacts.length > 0 ? (
            <Text style={styles.selectorToolbarCount}>
              {selectedContactIds.length} coché{selectedContactIds.length > 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>
      ) : null}

      {contactFormVisible ? (
        <View style={styles.addContactCard}>
          <View style={styles.addContactHeader}>
            <View style={styles.addContactIcon}>
              <Ionicons name="person-add" size={17} color={Colors.primary} />
            </View>
            <View style={styles.addContactHeaderCopy}>
              <Text style={styles.addContactTitle}>Nouveau proche</Text>
              <Text style={styles.addContactHint}>
                Il sera enregistré et coché pour ce trajet.
              </Text>
            </View>
          </View>

          <View style={styles.addContactFields}>
            <TextInput
              style={styles.addContactInput}
              value={newContactName}
              onChangeText={setNewContactName}
              placeholder="Nom du proche"
              placeholderTextColor={Colors.gray[400]}
              autoCapitalize="words"
              returnKeyType="next"
            />
            <TextInput
              style={styles.addContactInput}
              value={newContactPhone}
              onChangeText={setNewContactPhone}
              placeholder="Téléphone"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="phone-pad"
              autoComplete="tel"
              returnKeyType="next"
            />
            <TextInput
              style={styles.addContactInput}
              value={newContactRelationship}
              onChangeText={setNewContactRelationship}
              placeholder="Lien avec vous, facultatif"
              placeholderTextColor={Colors.gray[400]}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>

          <View style={styles.addContactActions}>
            <TouchableOpacity
              style={[styles.addContactActionButton, styles.addContactCancelButton]}
              onPress={closeContactForm}
              disabled={isCreatingContact}
              activeOpacity={0.85}
            >
              <Text style={styles.addContactCancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.addContactActionButton,
                styles.addContactSaveButton,
                isCreatingContact && styles.buttonDisabled,
              ]}
              onPress={handleCreateContact}
              disabled={isCreatingContact}
              activeOpacity={0.85}
            >
              {isCreatingContact ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.addContactSaveText}>Ajouter</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {isLoadingContacts ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>Chargement des contacts...</Text>
        </View>
      ) : activeContacts.length === 0 && !contactFormVisible ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={34} color={Colors.gray[400]} />
          <Text style={styles.emptyTitle}>Aucun contact actif</Text>
          <Text style={styles.emptyText}>
            Ajoutez un proche sans quitter cette fenêtre.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => setContactFormVisible(true)}
          >
            <Text style={styles.emptyButtonText}>Ajouter un proche</Text>
          </TouchableOpacity>
        </View>
      ) : activeContacts.length > 0 ? (
        <>
          {!compact ? (
            <View style={styles.toolsRow}>
              <TouchableOpacity style={styles.toolButton} onPress={selectAll}>
                <Text style={styles.toolButtonText}>Tout sélectionner</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolButton} onPress={clearAll}>
                <Text style={styles.toolButtonText}>Vider tout</Text>
              </TouchableOpacity>
              <Text style={styles.selectedCount}>{selectedContactIds.length} choisis</Text>
            </View>
          ) : null}

          <ScrollView
            style={[
              styles.list,
              compact && styles.listCompact,
              contactFormVisible && styles.listWithContactForm,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {activeContacts.map((contact) => {
              const selected = selectedContactIds.includes(contact.id);
              return (
                <TouchableOpacity
                  key={contact.id}
                  style={[
                    styles.contactRow,
                    compact && styles.contactRowCompact,
                    selected && styles.contactRowSelected,
                  ]}
                  onPress={() => toggleContact(contact.id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactPhone}>{contact.phone}</Text>
                    {!compact && contact.relationship ? (
                      <Text style={styles.contactRelationship}>{contact.relationship}</Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={selected ? Colors.primary : Colors.gray[400]}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      <View style={styles.modalActions}>
        <TouchableOpacity
          style={[styles.modalButton, styles.modalSecondaryButton]}
          onPress={() => {
            setSelectorVisible(false);
            closeContactForm();
          }}
          disabled={isCreatingContact}
          activeOpacity={0.85}
        >
          <Text style={styles.modalSecondaryButtonText}>Annuler</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modalButton,
            styles.modalPrimaryButton,
            (isSaving ||
              isCreatingContact ||
              activeContacts.length === 0 ||
              selectedContactIds.length === 0 ||
              (role === 'passenger' && !isPassengerReadyForSelection)) &&
              styles.buttonDisabled,
          ]}
          onPress={handleSaveSelection}
          disabled={
            isSaving ||
            isCreatingContact ||
            activeContacts.length === 0 ||
            selectedContactIds.length === 0 ||
            (role === 'passenger' && !isPassengerReadyForSelection)
          }
          activeOpacity={0.85}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.modalPrimaryButtonText}>Enregistrer</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
