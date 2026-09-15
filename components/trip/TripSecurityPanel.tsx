import { styles } from '../../features/screen-styles/components/trip/TripSecurityPanel/index';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import { useGetBookingByIdQuery, useSetBookingEmergencyContactsMutation } from '@/store/api/bookingApi';
import { useCreateEmergencyContactMutation, useGetEmergencyContactsQuery } from '@/store/api/safetyApi';
import { useGetTripByIdQuery, useSetDriverEmergencyContactsMutation } from '@/store/api/tripApi';
import type { TripStatus } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

type TripSecurityPanelProps = {
  tripId: string;
  role: 'driver' | 'passenger';
  tripStatus: TripStatus;
  bookingId?: string;
  openSelectorByDefault?: boolean;
  compact?: boolean;
};

const parseErrorMessage = (error: unknown, fallback: string): string => {
  return getApiErrorMessage(error, fallback);
};

function TripSecurityPanel({
  tripId,
  role,
  tripStatus,
  bookingId,
  openSelectorByDefault = false,
  compact = false,
}: TripSecurityPanelProps) {
  const router = useRouter();
  const { showDialog } = useDialog();

  const [selectorVisible, setSelectorVisible] = useState(openSelectorByDefault);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactFormVisible, setContactFormVisible] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactRelationship, setNewContactRelationship] = useState('');
  const [savedDriverSelectionOverride, setSavedDriverSelectionOverride] = useState<string[] | null>(null);

  const {
    data: emergencyContacts = [],
    isLoading: isLoadingContacts,
    refetch: refetchContacts,
  } = useGetEmergencyContactsQuery(undefined, {
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });

  const {
    data: trip,
    refetch: refetchTrip,
  } = useGetTripByIdQuery(tripId, {
    skip: role !== 'driver' || !tripId,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });

  const {
    data: booking,
    isLoading: isLoadingBooking,
    refetch: refetchBooking,
  } = useGetBookingByIdQuery(bookingId ?? '', {
    skip: role !== 'passenger' || !bookingId,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });

  const [setDriverEmergencyContacts, { isLoading: isSavingDriverSelection }] =
    useSetDriverEmergencyContactsMutation();
  const [setBookingEmergencyContacts, { isLoading: isSavingBookingSelection }] =
    useSetBookingEmergencyContactsMutation();
  const [createEmergencyContact, { isLoading: isCreatingContact }] =
    useCreateEmergencyContactMutation();

  const isSaving = isSavingDriverSelection || isSavingBookingSelection;

  const activeContacts = useMemo(
    () => emergencyContacts.filter((contact) => contact.isActive),
    [emergencyContacts],
  );

  const savedSelectionIds = useMemo(() => {
    if (role === 'driver') {
      if (savedDriverSelectionOverride) {
        return savedDriverSelectionOverride;
      }
      return trip?.driverSafetyEmergencyContactIds ?? [];
    }
    return booking?.safetyEmergencyContactIds ?? [];
  }, [
    role,
    trip?.driverSafetyEmergencyContactIds,
    booking?.safetyEmergencyContactIds,
    savedDriverSelectionOverride,
  ]);

  const savedSelectionContacts = useMemo(
    () => activeContacts.filter((contact) => savedSelectionIds.includes(contact.id)),
    [activeContacts, savedSelectionIds],
  );

  const isPassengerReadyForSelection = useMemo(() => {
    if (role !== 'passenger') return true;
    if (!bookingId || !booking) return false;
    return booking.status === 'accepted';
  }, [role, bookingId, booking]);

  const passengerBlockingReason = useMemo(() => {
    if (role !== 'passenger') return null;
    if (!bookingId) return 'Reservez le trajet pour choisir les proches à prévenir.';
    if (!booking) return 'Chargement de votre réservation...';
    if (booking.status === 'pending') {
      return 'Vous pourrez choisir vos proches dès que le conducteur acceptera.';
    }
    if (booking.status !== 'accepted') {
      return "Cette réservation n'est plus modifiable.";
    }
    return null;
  }, [role, bookingId, booking]);

  const openSelector = () => {
    setSelectorVisible(true);
    const saved = savedSelectionIds.filter((id) =>
      activeContacts.some((contact) => contact.id === id),
    );
    const defaults = saved.length > 0 ? saved : activeContacts.map((contact) => contact.id);
    setSelectedContactIds(defaults);
  };

  const handlePrimaryAction = () => {
    if (selectorVisible) {
      setSelectorVisible(false);
      return;
    }
    openSelector();
  };

  useEffect(() => {
    if (openSelectorByDefault) {
      setSelectorVisible(true);
      return;
    }

    if (compact) {
      setSelectorVisible(false);
      if (!isCreatingContact) {
        setContactFormVisible(false);
        setNewContactName('');
        setNewContactPhone('');
        setNewContactRelationship('');
      }
    }
  }, [openSelectorByDefault, compact, isCreatingContact]);

  useEffect(() => {
    if (!selectorVisible) {
      return;
    }
    void refetchContacts();
  }, [selectorVisible, refetchContacts]);

  useEffect(() => {
    if (!selectorVisible || selectedContactIds.length > 0 || activeContacts.length === 0) {
      return;
    }
    const saved = savedSelectionIds.filter((id) =>
      activeContacts.some((contact) => contact.id === id),
    );
    setSelectedContactIds(saved.length > 0 ? saved : activeContacts.map((contact) => contact.id));
  }, [selectorVisible, selectedContactIds.length, activeContacts, savedSelectionIds]);

  const toggleContact = (contactId: string) => {
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    );
  };

  const selectAll = () => {
    setSelectedContactIds(activeContacts.map((contact) => contact.id));
  };

  const clearAll = () => {
    setSelectedContactIds([]);
  };

  const resetContactForm = () => {
    setNewContactName('');
    setNewContactPhone('');
    setNewContactRelationship('');
  };

  const closeContactForm = () => {
    if (isCreatingContact) return;
    setContactFormVisible(false);
    resetContactForm();
  };

  const handleCreateContact = async () => {
    const name = newContactName.trim();
    const phone = newContactPhone.trim();
    const relationship = newContactRelationship.trim();
    const phoneDigits = phone.replace(/\D/g, '');

    if (!name) {
      showDialog({
        variant: 'warning',
        title: 'Nom manquant',
        message: 'Ajoutez le nom du proche à prévenir.',
      });
      return;
    }

    if (phoneDigits.length < 6) {
      showDialog({
        variant: 'warning',
        title: 'Téléphone invalide',
        message: 'Ajoutez un numéro de téléphone valide pour ce proche.',
      });
      return;
    }

    try {
      const createdContact = await createEmergencyContact({
        name,
        phone,
        relationship: relationship || undefined,
      }).unwrap();

      await refetchContacts();
      setSelectedContactIds((current) =>
        current.includes(createdContact.id) ? current : [...current, createdContact.id],
      );
      setContactFormVisible(false);
      resetContactForm();
      showDialog({
        variant: 'success',
        title: 'Proche ajouté',
        message: 'Il est déjà coché pour ce trajet.',
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: "Impossible d'ajouter ce proche",
        message: parseErrorMessage(error, 'Vérifiez les informations puis réessayez.'),
      });
    }
  };

  const handleSaveSelection = async () => {
    if (selectedContactIds.length === 0) {
      showDialog({
        variant: 'warning',
        title: 'Choisissez un proche',
        message: 'Sélectionnez au moins une personne à prévenir.',
      });
      return;
    }

    try {
      if (role === 'driver') {
        await setDriverEmergencyContacts({
          tripId,
          emergencyContactIds: selectedContactIds,
        }).unwrap();

        await refetchTrip();
        setSavedDriverSelectionOverride(selectedContactIds);
        showDialog({
          variant: 'success',
          title: 'Proches enregistrés',
          message: 'Ils seront prévenus automatiquement pendant ce trajet.',
        });
      } else {
        if (!bookingId || !booking || booking.status !== 'accepted') {
          showDialog({
            variant: 'info',
            title: 'Réservation pas encore prête',
            message: 'Vous pourrez choisir vos proches après acceptation.',
          });
          return;
        }

        await setBookingEmergencyContacts({
          bookingId,
          emergencyContactIds: selectedContactIds,
        }).unwrap();

        await refetchBooking();
        showDialog({
          variant: 'success',
          title: 'Proches enregistrés',
          message: 'Ils seront prévenus automatiquement pendant ce trajet.',
        });
      }

      setSelectorVisible(false);
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: "Impossible d'enregistrer",
        message: parseErrorMessage(error, 'Une erreur est survenue.'),
      });
    }
  };

  const isContextLoading = role === 'passenger' ? isLoadingBooking : false;
  const currentSelectionLabel =
    savedSelectionContacts.length === 0
      ? 'Aucun proche choisi'
      : `${savedSelectionContacts.length} proche${savedSelectionContacts.length > 1 ? 's' : ''} choisi${savedSelectionContacts.length > 1 ? 's' : ''}`;

  const savedPreview = savedSelectionContacts.map((contact) => contact.name).slice(0, 3).join(', ');
  const isPrimaryDisabled =
    isContextLoading ||
    (role === 'passenger' && !isPassengerReadyForSelection) ||
    tripStatus === 'cancelled' ||
    tripStatus === 'completed';
  const showPrimaryChooserButton = !(compact && selectorVisible);

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      {compact ? (
        !selectorVisible ? (
          <Text style={styles.compactIntro}>
            Ajoutez ou choisissez les proches qui recevront les alertes de ce trajet.
          </Text>
        ) : null
      ) : (
        <View style={styles.headerRow}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Proches à notifier</Text>
            <Text style={styles.subtitle}>
              {role === 'driver'
                ? 'Choisissez les personnes qui doivent recevoir les alertes de votre trajet.'
                : 'Choisissez les personnes qui doivent recevoir les alertes de votre réservation.'}
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.selectionCard, compact && styles.selectionCardCompact]}>
        <Text style={styles.selectionLabel}>{currentSelectionLabel}</Text>
        {savedPreview ? <Text style={styles.selectionPreview}>{savedPreview}</Text> : null}
        {role === 'driver' && tripStatus === 'ongoing' ? (
          <Text style={styles.liveEditHint}>
            Modifiable pendant le trajet.
          </Text>
        ) : null}
      </View>

      {role === 'passenger' && passengerBlockingReason ? (
        <View style={styles.warningCard}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
          <Text style={styles.warningText}>{passengerBlockingReason}</Text>
        </View>
      ) : null}

      {showPrimaryChooserButton || !compact ? (
        <View style={[styles.actionsRow, compact && styles.actionsRowCompact]}>
          {showPrimaryChooserButton ? (
            <TouchableOpacity
              style={[styles.primaryButton, isPrimaryDisabled && styles.buttonDisabled]}
              onPress={handlePrimaryAction}
              disabled={isPrimaryDisabled}
              activeOpacity={0.85}
            >
              {isContextLoading ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name={selectorVisible ? 'chevron-up' : 'people'} size={16} color={Colors.white} />
                  <Text style={styles.primaryButtonText}>
                    {selectorVisible ? 'Masquer la liste' : 'Ajouter / notifier mes proches'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {!compact ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push('/security')}
              activeOpacity={0.85}
            >
              <Ionicons name="settings-outline" size={16} color={Colors.primary} />
              <Text style={styles.secondaryButtonText}>Gérer mes proches</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {selectorVisible ? (
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
      ) : null}

    </View>
  );
}



export default TripSecurityPanel;
