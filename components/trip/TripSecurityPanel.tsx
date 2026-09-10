import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useGetBookingByIdQuery,
  useSetBookingEmergencyContactsMutation,
} from '@/store/api/bookingApi';
import {
  useCreateEmergencyContactMutation,
  useGetEmergencyContactsQuery,
} from '@/store/api/safetyApi';
import {
  useGetTripByIdQuery,
  useSetDriverEmergencyContactsMutation,
} from '@/store/api/tripApi';
import type { TripStatus } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

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

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    padding: Spacing.md,
  },
  cardCompact: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
  },
  compactIntro: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 19,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  headerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  subtitle: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    lineHeight: 17,
  },
  selectionCard: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[50],
    padding: Spacing.sm,
  },
  selectionCardCompact: {
    backgroundColor: Colors.white,
    borderColor: Colors.gray[200],
  },
  selectionLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  selectionPreview: {
    marginTop: 4,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  liveEditHint: {
    marginTop: 6,
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
  },
  warningCard: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.warning + '55',
    backgroundColor: Colors.warning + '12',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  warningText: {
    flex: 1,
    fontSize: FontSizes.xs,
    lineHeight: 17,
    color: Colors.gray[700],
  },
  actionsRow: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  actionsRowCompact: {
    marginTop: Spacing.xs,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '45',
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  inlineSelectorCard: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    maxHeight: 520,
  },
  inlineSelectorCardCompact: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    maxHeight: 560,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalHeaderCopy: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  modalTitleCompact: {
    fontSize: FontSizes.base,
  },
  modalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginBottom: Spacing.sm,
    lineHeight: 19,
  },
  modalSubtitleCompact: {
    fontSize: FontSizes.xs,
    lineHeight: 17,
    marginBottom: Spacing.xs,
  },
  selectorToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  addContactTrigger: {
    minHeight: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
  },
  addContactTriggerActive: {
    backgroundColor: Colors.primary + '10',
    borderWidth: 1,
    borderColor: Colors.primary + '24',
  },
  addContactTriggerText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  addContactTriggerTextActive: {
    color: Colors.primary,
  },
  selectorToolbarCount: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.semibold,
  },
  addContactCard: {
    borderWidth: 1,
    borderColor: Colors.primary + '24',
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary + '08',
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  addContactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  addContactIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  addContactHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  addContactTitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
  },
  addContactHint: {
    marginTop: 1,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    lineHeight: 17,
  },
  addContactFields: {
    gap: Spacing.xs,
  },
  addContactInput: {
    minHeight: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.sm,
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  addContactActions: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  addContactActionButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addContactCancelButton: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  addContactSaveButton: {
    backgroundColor: Colors.primary,
  },
  addContactCancelText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  addContactSaveText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  loadingText: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  emptyTitle: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  emptyText: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    lineHeight: 17,
  },
  emptyButton: {
    marginTop: Spacing.md,
    minHeight: 38,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  emptyButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  toolButton: {
    minHeight: 32,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  toolButtonText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[700],
    fontWeight: FontWeights.semibold,
  },
  selectedCount: {
    marginLeft: 'auto',
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.semibold,
  },
  list: {
    maxHeight: 300,
  },
  listCompact: {
    maxHeight: 220,
  },
  listWithContactForm: {
    maxHeight: 150,
  },
  contactRow: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contactRowCompact: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  contactRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '12',
  },
  contactInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  contactName: {
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.semibold,
  },
  contactPhone: {
    marginTop: 2,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  contactRelationship: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  modalActions: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modalButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryButton: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  modalSecondaryButtonText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  modalPrimaryButton: {
    backgroundColor: Colors.primary,
  },
  modalPrimaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
});

export default TripSecurityPanel;
