import { TripContactSelector } from '../../features/security/TripContactSelector';
import { useTripSecurityActions } from '../../hooks/security/useTripSecurityActions';
import { styles } from '../../features/screen-styles/components/trip/TripSecurityPanel/index';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import { useGetBookingByIdQuery, useSetBookingEmergencyContactsMutation } from '@/store/api/bookingApi';
import { useCreateEmergencyContactMutation, useGetEmergencyContactsQuery } from '@/store/api/safetyApi';
import { useGetTripByIdQuery, useSetDriverEmergencyContactsMutation } from '@/store/api/tripApi';
import type { TripStatus } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

type TripSecurityPanelProps = {
  tripId: string;
  role: 'driver' | 'passenger';
  tripStatus: TripStatus;
  bookingId?: string;
  openSelectorByDefault?: boolean;
  compact?: boolean;
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

  const { handleCreateContact, handleSaveSelection } = useTripSecurityActions({
    newContactName,
    newContactPhone,
    newContactRelationship,
    showDialog,
    createEmergencyContact,
    refetchContacts,
    setSelectedContactIds,
    setContactFormVisible,
    resetContactForm,
    selectedContactIds,
    role,
    setDriverEmergencyContacts,
    tripId,
    refetchTrip,
    setSavedDriverSelectionOverride,
    bookingId,
    booking,
    setBookingEmergencyContacts,
    refetchBooking,
    setSelectorVisible,
  });

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
        <TripContactSelector
          compact={compact}
          role={role}
          setSelectorVisible={setSelectorVisible}
          closeContactForm={closeContactForm}
          isCreatingContact={isCreatingContact}
          activeContacts={activeContacts}
          contactFormVisible={contactFormVisible}
          setContactFormVisible={setContactFormVisible}
          selectedContactIds={selectedContactIds}
          newContactName={newContactName}
          setNewContactName={setNewContactName}
          newContactPhone={newContactPhone}
          setNewContactPhone={setNewContactPhone}
          newContactRelationship={newContactRelationship}
          setNewContactRelationship={setNewContactRelationship}
          handleCreateContact={handleCreateContact}
          isLoadingContacts={isLoadingContacts}
          selectAll={selectAll}
          clearAll={clearAll}
          toggleContact={toggleContact}
          isSaving={isSaving}
          isPassengerReadyForSelection={isPassengerReadyForSelection}
          handleSaveSelection={handleSaveSelection}
        />
      ) : null}

    </View>
  );
}



export default TripSecurityPanel;
