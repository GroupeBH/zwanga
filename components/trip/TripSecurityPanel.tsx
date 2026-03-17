import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useGetBookingByIdQuery,
  useSetBookingEmergencyContactsMutation,
} from '@/store/api/bookingApi';
import { useGetEmergencyContactsQuery } from '@/store/api/safetyApi';
import {
  useGetTripByIdQuery,
  useSetDriverEmergencyContactsMutation,
} from '@/store/api/tripApi';
import type { TripStatus } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
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
  if (!error || typeof error !== 'object') {
    return fallback;
  }
  const err = error as { data?: { message?: string | string[] }; error?: string };
  const apiMessage = err.data?.message ?? err.error;
  if (Array.isArray(apiMessage)) {
    return apiMessage.join('\n');
  }
  if (typeof apiMessage === 'string' && apiMessage.trim().length > 0) {
    return apiMessage;
  }
  return fallback;
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
  const [savedDriverSelectionOverride, setSavedDriverSelectionOverride] = useState<string[] | null>(null);

  const {
    data: emergencyContacts = [],
    isLoading: isLoadingContacts,
    refetch: refetchContacts,
  } = useGetEmergencyContactsQuery(undefined, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: trip,
    refetch: refetchTrip,
  } = useGetTripByIdQuery(tripId, {
    skip: role !== 'driver' || !tripId,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: booking,
    isLoading: isLoadingBooking,
    refetch: refetchBooking,
  } = useGetBookingByIdQuery(bookingId ?? '', {
    skip: role !== 'passenger' || !bookingId,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const [setDriverEmergencyContacts, { isLoading: isSavingDriverSelection }] =
    useSetDriverEmergencyContactsMutation();
  const [setBookingEmergencyContacts, { isLoading: isSavingBookingSelection }] =
    useSetBookingEmergencyContactsMutation();

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
    if (!bookingId) return 'La selection sera disponible apres creation de reservation.';
    if (!booking) return 'Chargement de votre reservation...';
    if (booking.status === 'pending') {
      return 'La selection sera active des que la reservation est acceptee.';
    }
    if (booking.status !== 'accepted') {
      return `La reservation est ${booking.status}. La configuration n est plus editable.`;
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
    }
  }, [openSelectorByDefault]);

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

  const handleSaveSelection = async () => {
    if (selectedContactIds.length === 0) {
      showDialog({
        variant: 'warning',
        title: 'Selection requise',
        message: 'Choisissez au moins un contact a notifier.',
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
          title: 'Configuration enregistree',
          message:
            'Le backend notifiera automatiquement ces contacts au demarrage, a la recuperation, puis a la fin.',
        });
      } else {
        if (!bookingId || !booking || booking.status !== 'accepted') {
          showDialog({
            variant: 'info',
            title: 'Reservation non prete',
            message:
              'Cette selection sera possible quand la reservation sera acceptee.',
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
          title: 'Configuration enregistree',
          message:
            'Le backend notifiera automatiquement ces contacts a la recuperation et a la depose.',
        });
      }

      setSelectorVisible(false);
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Impossible d enregistrer',
        message: parseErrorMessage(error, 'Une erreur est survenue.'),
      });
    }
  };

  const isContextLoading = role === 'passenger' ? isLoadingBooking : false;
  const currentSelectionLabel =
    savedSelectionContacts.length === 0
      ? 'Aucun contact selectionne pour ce trajet.'
      : `${savedSelectionContacts.length} contact(s) selectionne(s) pour ce trajet.`;

  const savedPreview = savedSelectionContacts.map((contact) => contact.name).slice(0, 3).join(', ');
  const isPrimaryDisabled =
    isContextLoading ||
    (role === 'passenger' && !isPassengerReadyForSelection) ||
    tripStatus === 'cancelled' ||
    tripStatus === 'completed';

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.headerRow}>
        <View style={styles.headerIconWrap}>
          <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Securite trajet</Text>
          <Text style={styles.subtitle}>
            {compact
              ? 'Choisissez rapidement les proches a notifier pour ce trajet.'
              : role === 'driver'
              ? 'Choisissez les proches a notifier pour ce trajet conducteur, meme pendant la course.'
              : 'Choisissez les proches a notifier pour cette reservation passager.'}
          </Text>
        </View>
      </View>

      {!compact ? (
        <View style={styles.flowCard}>
          <Text style={styles.flowTitle}>Parcours simple</Text>
          <Text style={styles.flowText}>1. Ajoutez vos contacts dans Profil {'>'} Parametres {'>'} Securite.</Text>
          <Text style={styles.flowText}>2. Selectionnez ici qui doit suivre ce trajet.</Text>
          <Text style={styles.flowText}>
            3. Le backend envoie automatiquement les notifications WhatsApp aux etapes du trajet.
          </Text>
        </View>
      ) : null}

      <View style={styles.selectionCard}>
        <Text style={styles.selectionLabel}>{currentSelectionLabel}</Text>
        {savedPreview ? <Text style={styles.selectionPreview}>{savedPreview}</Text> : null}
        {role === 'driver' && tripStatus === 'ongoing' ? (
          <Text style={styles.liveEditHint}>
            Vous pouvez modifier cette selection a tout moment pendant le trajet.
          </Text>
        ) : null}
      </View>

      {role === 'passenger' && passengerBlockingReason ? (
        <View style={styles.warningCard}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
          <Text style={styles.warningText}>{passengerBlockingReason}</Text>
        </View>
      ) : null}

      <View style={[styles.actionsRow, compact && styles.actionsRowCompact]}>
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
                {selectorVisible ? 'Masquer la selection' : 'Choisir qui notifier'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {!compact ? (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/security')}
            activeOpacity={0.85}
          >
            <Ionicons name="settings-outline" size={16} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>Gerer mes contacts d urgence</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {selectorVisible ? (
        <View style={[styles.inlineSelectorCard, compact && styles.inlineSelectorCardCompact]}>
          <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, compact && styles.modalTitleCompact]}>
                Choisir les contacts a notifier
              </Text>
              <TouchableOpacity onPress={() => setSelectorVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.gray[700]} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, compact && styles.modalSubtitleCompact]}>
              {role === 'driver'
                ? 'Ces contacts seront utilises automatiquement au demarrage et a la fin de ce trajet.'
                : 'Ces contacts seront utilises automatiquement a la recuperation et a la depose de ce passager.'}
            </Text>

            {isLoadingContacts ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.loadingText}>Chargement des contacts...</Text>
              </View>
            ) : activeContacts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={34} color={Colors.gray[400]} />
                <Text style={styles.emptyTitle}>Aucun contact actif</Text>
                <Text style={styles.emptyText}>
                  Ajoutez d abord des contacts d urgence dans Profil {'>'} Parametres {'>'} Securite.
                </Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => {
                    setSelectorVisible(false);
                    router.push('/security');
                  }}
                >
                  <Text style={styles.emptyButtonText}>Ouvrir Securite</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.toolsRow}>
                  <TouchableOpacity style={styles.toolButton} onPress={selectAll}>
                    <Text style={styles.toolButtonText}>Tout selectionner</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.toolButton} onPress={clearAll}>
                    <Text style={styles.toolButtonText}>Tout vider</Text>
                  </TouchableOpacity>
                  <Text style={styles.selectedCount}>{selectedContactIds.length} choisis</Text>
                </View>

                <ScrollView style={[styles.list, compact && styles.listCompact]} showsVerticalScrollIndicator={false}>
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
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSecondaryButton]}
                onPress={() => setSelectorVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalSecondaryButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalPrimaryButton,
                  (isSaving ||
                    activeContacts.length === 0 ||
                    selectedContactIds.length === 0 ||
                    (role === 'passenger' && !isPassengerReadyForSelection)) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleSaveSelection}
                disabled={
                  isSaving ||
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
    padding: Spacing.sm,
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
  flowCard: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '0F',
    padding: Spacing.sm,
  },
  flowTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  flowText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[700],
    lineHeight: 17,
    marginBottom: 2,
  },
  selectionCard: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[50],
    padding: Spacing.sm,
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
    marginTop: Spacing.xs,
    padding: Spacing.sm,
    maxHeight: 390,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
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
    maxHeight: 165,
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
