import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useConfirmTripSecurityParticipantMutation,
  useCreateEmergencyContactMutation,
  useEscalateTripSecurityParticipantMutation,
  useGetEmergencyContactsQuery,
  useGetTripSecurityParticipantHistoryQuery,
  useGetTripSecurityTripParticipantsQuery,
  useNotifyTripSecurityTrustedContactsMutation,
  useStartTripSecurityTrackingMutation,
} from '@/store/api/safetyApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import type {
  TripSafetyStatus,
  TripStatus,
} from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type ContactActionMode = 'start' | 'notify' | 'manage';

type TripSecurityPanelProps = {
  tripId: string;
  role: 'driver' | 'passenger';
  tripStatus: TripStatus;
  bookingId?: string;
};

const STATUS_LABELS: Record<TripSafetyStatus, string> = {
  pending: 'En attente',
  boarded: 'Embarque',
  in_transit: 'En cours',
  dropped_off: 'Depose',
  arrived: 'Arrive',
  completed: 'Termine',
  arrival_unconfirmed: 'Arrivee non confirmee',
  dropoff_unconfirmed: 'Depot non confirme',
  alerted_contacts: 'Signale aux proches',
};

const UNCONFIRMED_STATUSES: TripSafetyStatus[] = [
  'arrival_unconfirmed',
  'dropoff_unconfirmed',
  'alerted_contacts',
];

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

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A';
  }
  return parsed.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const eventLabel = (type: string): string => {
  const labels: Record<string, string> = {
    tracking_created: 'Suivi cree',
    boarded: 'Embarquement',
    in_transit: 'Trajet en cours',
    trusted_contacts_notified: 'Proches notifies',
    status_changed: 'Changement de statut',
    confirmation_received: 'Confirmation recue',
    estimated_end_reached: 'Fin estimee atteinte',
    auto_trip_end_detected: 'Fin detectee automatiquement',
    reminder_sent: 'Relance envoyee',
    escalation_triggered: 'Escalade declenchee',
    late_confirmation: 'Confirmation tardive',
    monitoring_cancelled: 'Suivi annule',
  };
  return labels[type] ?? type;
};

const notificationLabel = (type: string): string => {
  const labels: Record<string, string> = {
    boarding_shared: 'Partage embarquement',
    reminder: 'Relance',
    escalation: 'Escalade',
    confirmation: 'Confirmation',
    incident_signal: 'Incident potentiel',
  };
  return labels[type] ?? type;
};

function TripSecurityPanel({
  tripId,
  role,
  tripStatus,
  bookingId,
}: TripSecurityPanelProps) {
  const router = useRouter();
  const { showDialog } = useDialog();
  const user = useAppSelector(selectUser);

  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [contactActionMode, setContactActionMode] = useState<ContactActionMode>('start');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [showAddContactForm, setShowAddContactForm] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactRelationship, setNewContactRelationship] = useState('');

  const {
    data: emergencyContacts = [],
    refetch: refetchEmergencyContacts,
  } = useGetEmergencyContactsQuery(undefined, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const {
    data: tripParticipants = [],
    isFetching: isFetchingParticipants,
    refetch: refetchParticipants,
  } = useGetTripSecurityTripParticipantsQuery(tripId, {
    skip: !tripId || !user?.id,
    pollingInterval: tripStatus === 'ongoing' ? 15000 : 0,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const participant = useMemo(() => {
    if (!user?.id) return null;
    const ownParticipants = tripParticipants.filter((item) => item.userId === user.id);
    if (role === 'driver') {
      return ownParticipants.find((item) => item.role === 'driver') ?? null;
    }
    if (bookingId) {
      return ownParticipants.find((item) => item.bookingId === bookingId) ?? null;
    }
    return ownParticipants.find((item) => item.role === 'passenger') ?? null;
  }, [tripParticipants, user?.id, role, bookingId]);

  const {
    data: participantHistory,
    isFetching: isFetchingHistory,
    refetch: refetchHistory,
  } = useGetTripSecurityParticipantHistoryQuery(participant?.id ?? '', {
    skip: !participant?.id || !historyModalVisible,
  });

  const [startTracking, { isLoading: isStartingTracking }] = useStartTripSecurityTrackingMutation();
  const [notifyTrustedContacts, { isLoading: isNotifyingContacts }] =
    useNotifyTripSecurityTrustedContactsMutation();
  const [confirmParticipant, { isLoading: isConfirmingArrival }] =
    useConfirmTripSecurityParticipantMutation();
  const [escalateParticipant, { isLoading: isEscalating }] =
    useEscalateTripSecurityParticipantMutation();
  const [createEmergencyContact, { isLoading: isAddingContact }] =
    useCreateEmergencyContactMutation();

  const activeContacts = useMemo(
    () => emergencyContacts.filter((contact) => contact.isActive),
    [emergencyContacts],
  );
  const activeContactIds = useMemo(
    () => activeContacts.map((contact) => contact.id),
    [activeContacts],
  );
  const allActiveSelected =
    activeContactIds.length > 0 &&
    activeContactIds.every((contactId) => selectedContactIds.includes(contactId));
  const selectedCount = selectedContactIds.length;

  const isTrackingStarted = Boolean(participant);
  const canStartFromContext = role === 'driver' || Boolean(bookingId || participant);
  const canConfirm = Boolean(participant && participant.status !== 'completed');
  const canEscalate = Boolean(participant && !participant.isEscalated && participant.status !== 'completed');
  const isUnconfirmed = Boolean(participant && UNCONFIRMED_STATUSES.includes(participant.status));

  const disableActions =
    tripStatus === 'cancelled' ||
    (tripStatus === 'completed' && !participant);

  const resetAddContactForm = () => {
    setShowAddContactForm(false);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactRelationship('');
  };

  const openContactModal = async (mode: ContactActionMode) => {
    await refetchEmergencyContacts();
    await refetchParticipants();

    let defaults: string[] = [];
    if (mode === 'notify' && participant?.trustedContacts?.length) {
      const trustedContactIds = participant.trustedContacts.map(
        (contact) => contact.emergencyContactId,
      );
      defaults = activeContactIds.filter((contactId) => trustedContactIds.includes(contactId));
    } else if (mode === 'start') {
      defaults = activeContactIds;
    }
    setContactActionMode(mode);
    setSelectedContactIds(defaults);
    resetAddContactForm();
    setContactModalVisible(true);
  };

  const toggleContactSelection = (contactId: string) => {
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((item) => item !== contactId)
        : [...current, contactId],
    );
  };

  const selectAllContacts = () => {
    setSelectedContactIds(activeContactIds);
  };

  const clearSelectedContacts = () => {
    setSelectedContactIds([]);
  };

  useEffect(() => {
    if (contactModalVisible && activeContacts.length === 0) {
      setShowAddContactForm(true);
    }
  }, [contactModalVisible, activeContacts.length]);

  const handleStartOrNotify = async () => {
    if (contactActionMode === 'manage') {
      setContactModalVisible(false);
      return;
    }

    if (contactActionMode === 'start' && !canStartFromContext) {
      showDialog({
        variant: 'info',
        title: 'Suivi pas encore disponible',
        message:
          role === 'passenger'
            ? 'Votre reservation n est pas encore acceptee. Ajoutez vos proches maintenant, puis activez le suivi des que la reservation passe en acceptee.'
            : 'Ajoutez vos proches maintenant. Le suivi sera activable au demarrage du trajet.',
      });
      return;
    }

    if (selectedContactIds.length === 0) {
      showDialog({
        variant: 'warning',
        title: 'Selection requise',
        message: 'Choisissez au moins un proche a prevenir.',
      });
      return;
    }

    try {
      if (contactActionMode === 'start') {
        await startTracking({
          tripId,
          bookingId,
          action: role === 'driver' ? 'trip_started' : 'im_boarded',
          trustedContactIds: selectedContactIds,
          notifyTrustedContacts: true,
        }).unwrap();
      } else if (participant) {
        await notifyTrustedContacts({
          participantId: participant.id,
          payload: {
            trustedContactIds: selectedContactIds,
          },
        }).unwrap();
      }

      setContactModalVisible(false);
      await refetchParticipants();

      showDialog({
        variant: 'success',
        title: contactActionMode === 'start' ? 'Suivi active' : 'Proches notifies',
        message:
          contactActionMode === 'start'
            ? 'Le suivi securite est demarre et les proches ont ete notifies.'
            : 'Les proches selectionnes ont ete notifies.',
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Operation impossible',
        message: parseErrorMessage(error, 'Une erreur est survenue.'),
      });
    }
  };

  const handleAddEmergencyContact = async () => {
    const name = newContactName.trim();
    const phone = newContactPhone.trim();
    const relationship = newContactRelationship.trim();

    if (!name || !phone) {
      showDialog({
        variant: 'warning',
        title: 'Informations manquantes',
        message: 'Renseignez au minimum le nom complet et le numero de telephone du proche.',
      });
      return;
    }

    try {
      const created = await createEmergencyContact({
        name,
        phone,
        relationship: relationship || undefined,
      }).unwrap();

      await refetchEmergencyContacts();
      setSelectedContactIds((current) =>
        current.includes(created.id) ? current : [...current, created.id],
      );
      resetAddContactForm();

      showDialog({
        variant: 'success',
        title: 'Proche ajoute',
        message: `${created.name} est maintenant disponible pour le partage du trajet.`,
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Ajout impossible',
        message: parseErrorMessage(error, 'Impossible d ajouter ce proche pour le moment.'),
      });
    }
  };

  const handleConfirm = () => {
    if (!participant) {
      showDialog({
        variant: 'warning',
        title: 'Suivi non demarre',
        message: 'Demarrez d abord le suivi securite de votre trajet.',
      });
      return;
    }

    showDialog({
      variant: 'info',
      title: role === 'driver' ? 'Confirmer votre arrivee' : 'Confirmer votre depot',
      message:
        role === 'driver'
          ? 'Confirmez-vous etre arrive et avoir termine votre trajet ?'
          : 'Confirmez-vous avoir ete depose et etre arrive a destination ?',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Confirmer',
          variant: 'primary',
          onPress: async () => {
            try {
              await confirmParticipant({
                participantId: participant.id,
                payload: {
                  outcome: role === 'driver' ? 'arrived' : 'dropped_off',
                },
              }).unwrap();
              await refetchParticipants();
              showDialog({
                variant: 'success',
                title: 'Confirmation enregistree',
                message: 'Votre arrivee/depot a bien ete confirme.',
              });
            } catch (error) {
              showDialog({
                variant: 'danger',
                title: 'Confirmation impossible',
                message: parseErrorMessage(error, 'Impossible de confirmer pour le moment.'),
              });
            }
          },
        },
      ],
    });
  };

  const handleEscalate = () => {
    if (!participant) return;

    showDialog({
      variant: 'warning',
      title: 'Escalade manuelle',
      message:
        'Voulez-vous signaler un incident potentiel maintenant et notifier vos proches immediatement ?',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Signaler',
          variant: 'primary',
          onPress: async () => {
            try {
              await escalateParticipant({
                participantId: participant.id,
                payload: {
                  reason: 'incident_potentiel',
                },
              }).unwrap();
              await refetchParticipants();
              showDialog({
                variant: 'success',
                title: 'Escalade envoyee',
                message: 'Les proches de confiance ont ete alertes.',
              });
            } catch (error) {
              showDialog({
                variant: 'danger',
                title: 'Escalade impossible',
                message: parseErrorMessage(error, 'Impossible d envoyer l alerte pour le moment.'),
              });
            }
          },
        },
      ],
    });
  };

  const openHistory = async () => {
    if (!participant) {
      showDialog({
        variant: 'warning',
        title: 'Historique indisponible',
        message: 'Le suivi securite doit etre demarre avant de consulter un historique.',
      });
      return;
    }

    setHistoryModalVisible(true);
    await refetchHistory();
  };

  const statusText = participant ? STATUS_LABELS[participant.status] : 'Non demarre';
  const isPassenger = role === 'passenger';
  const passengerNeedsAcceptedBooking =
    isPassenger && !isTrackingStarted && !canStartFromContext;
  const primaryActionLabel = isTrackingStarted
    ? 'Prevenir mes proches'
    : !canStartFromContext
      ? 'Ajouter mes proches'
      : role === 'driver'
        ? 'Demarrer le suivi'
        : 'Je monte: demarrer le suivi';
  const modalPrimaryActionLabel =
    contactActionMode === 'start'
      ? role === 'passenger'
        ? 'Activer le suivi et prevenir'
        : 'Demarrer le suivi et prevenir'
      : 'Envoyer la notification';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerInfo}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.title}>Securite trajet</Text>
            <Text style={styles.subtitle}>
              {role === 'driver'
                ? 'Suivi individuel conducteur'
                : 'Suivi individuel passager'}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: isUnconfirmed
                ? Colors.warning + '20'
                : participant?.status === 'completed'
                ? Colors.success + '20'
                : Colors.gray[100],
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color: isUnconfirmed
                  ? Colors.warning
                  : participant?.status === 'completed'
                  ? Colors.success
                  : Colors.gray[700],
              },
            ]}
          >
            {statusText}
          </Text>
        </View>
      </View>

      {participant ? (
        <View style={styles.metaBlock}>
          <Text style={styles.metaText}>
            Derniere mise a jour: {formatDateTime(participant.updatedAt)}
          </Text>
          <Text style={styles.metaText}>Code suivi: {participant.trackingCode}</Text>
          <Text style={styles.metaText}>
            Relance: +{participant.reminderDelayMinutes} min | Escalade: +{participant.escalationDelayMinutes} min
          </Text>
        </View>
      ) : (
        <View style={styles.guidanceBlock}>
          {isPassenger ? (
            <>
              <Text style={styles.description}>1. Ajoutez les proches qui doivent vous suivre.</Text>
              <Text style={styles.description}>
                2. Quand le conducteur accepte votre reservation, activez le suivi.
              </Text>
              <Text style={styles.description}>
                3. Des que vous montez dans le vehicule, appuyez sur Je monte: demarrer le suivi.
              </Text>
              {passengerNeedsAcceptedBooking ? (
                <Text style={styles.guidanceHint}>
                  Votre reservation n est pas encore acceptee. Vous pouvez deja ajouter vos proches maintenant.
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.description}>1. Choisissez vos proches de confiance.</Text>
              <Text style={styles.description}>
                2. Activez le suivi quand le trajet commence pour leur envoyer votre position.
              </Text>
            </>
          )}
        </View>
      )}

      {isPassenger ? (
        <View style={[styles.noticeCard, styles.noticeCardWarning]}>
          <View style={styles.noticeHeader}>
            <Ionicons name="alert-circle-outline" size={18} color={Colors.warning} />
            <Text style={styles.noticeTitle}>Rappel important pour passager</Text>
          </View>
          <Text style={styles.noticeText}>
            Avant de monter, verifiez que le vehicule devant vous correspond bien au trajet. En cas de doute, ne montez pas et utilisez Signaler.
          </Text>
        </View>
      ) : null}

      <View style={styles.actionsGrid}>
        <TouchableOpacity
          style={[styles.actionButton, disableActions && styles.actionButtonDisabled]}
          onPress={() =>
            openContactModal(
              isTrackingStarted ? 'notify' : canStartFromContext ? 'start' : 'manage',
            )
          }
          disabled={disableActions}
          activeOpacity={0.85}
        >
          <View style={styles.actionIconWrap}>
            {isStartingTracking || isNotifyingContacts ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons
                name={isTrackingStarted ? 'send-outline' : 'checkmark-circle-outline'}
                size={18}
                color={Colors.primary}
              />
            )}
          </View>
          <Text style={styles.actionButtonText}>{primaryActionLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, (!canConfirm || disableActions) && styles.actionButtonDisabled]}
          onPress={handleConfirm}
          disabled={!canConfirm || disableActions || isConfirmingArrival}
          activeOpacity={0.85}
        >
          <View style={styles.actionIconWrap}>
            {isConfirmingArrival ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="flag-outline" size={18} color={Colors.primary} />
            )}
          </View>
          <Text style={styles.actionButtonText}>
            {role === 'driver' ? 'Je suis arrive' : 'Je suis depose'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={openHistory} activeOpacity={0.85}>
          <View style={styles.actionIconWrap}>
            <Ionicons name="time-outline" size={18} color={Colors.primary} />
          </View>
          <Text style={styles.actionButtonText}>Historique</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, (!canEscalate || disableActions) && styles.actionButtonDisabled]}
          onPress={handleEscalate}
          disabled={!canEscalate || disableActions || isEscalating}
          activeOpacity={0.85}
        >
          <View style={styles.actionIconWrap}>
            {isEscalating ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="alert-circle-outline" size={18} color={Colors.primary} />
            )}
          </View>
          <Text style={styles.actionButtonText}>Signaler</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.autoSyncText}>
        {isFetchingParticipants ? 'Synchronisation en cours...' : 'Synchronisation automatique activee.'}
      </Text>

      <Modal
        visible={contactModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContactModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {contactActionMode === 'start'
                ? 'Choisir qui recoit votre suivi'
                : contactActionMode === 'manage'
                ? 'Ajouter vos proches de confiance'
                : 'Envoyer une mise a jour aux proches'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {contactActionMode === 'manage'
                ? 'Ajoutez des proches maintenant. Vous pourrez activer le suivi des que votre reservation sera acceptee.'
                : contactActionMode === 'start'
                ? 'Selectionnez les proches a prevenir puis validez le bouton en bas.'
                : 'Choisissez les proches qui doivent recevoir une mise a jour de votre trajet.'}
            </Text>

            <View style={styles.modalGuideCard}>
              <Text style={styles.modalGuideTitle}>Etapes simples</Text>
              <Text style={styles.modalGuideStep}>1. Selectionnez un ou plusieurs proches</Text>
              <Text style={styles.modalGuideStep}>2. Ajoutez un proche si il manque dans la liste</Text>
              <Text style={styles.modalGuideStep}>
                3. Appuyez sur {modalPrimaryActionLabel} pour confirmer
              </Text>
            </View>

            {activeContacts.length === 0 ? (
              <View style={styles.emptyContactsBlock}>
                <Ionicons name="people-outline" size={24} color={Colors.gray[400]} />
                <Text style={styles.emptyContactsText}>
                  Aucun proche enregistre pour le moment.
                </Text>
                <TouchableOpacity
                  style={styles.emptyContactsPrimaryButton}
                  onPress={() => setShowAddContactForm(true)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.emptyContactsPrimaryText}>Ajouter mon premier proche</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.contactsToolsRow}>
                  <TouchableOpacity
                    style={styles.contactsToolButton}
                    onPress={allActiveSelected ? clearSelectedContacts : selectAllContacts}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.contactsToolButtonText}>
                      {allActiveSelected ? 'Tout deselectionner' : 'Tout selectionner'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.contactsToolButton}
                    onPress={clearSelectedContacts}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.contactsToolButtonText}>Vider</Text>
                  </TouchableOpacity>
                  <Text style={styles.selectedCountText}>
                    {selectedCount}/{activeContacts.length} proche(s) selectionne(s)
                  </Text>
                </View>

                <ScrollView style={styles.contactsList} showsVerticalScrollIndicator={false}>
                  {activeContacts.map((contact) => {
                    const selected = selectedContactIds.includes(contact.id);
                    return (
                      <TouchableOpacity
                        key={contact.id}
                        style={[styles.contactRow, selected && styles.contactRowSelected]}
                        onPress={() => toggleContactSelection(contact.id)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.contactInfo}>
                          <Text style={styles.contactName}>{contact.name}</Text>
                          <Text style={styles.contactPhone}>{contact.phone}</Text>
                        </View>
                        <View style={styles.contactSelectionWrap}>
                          {selected ? (
                            <Text style={styles.contactSelectedChip}>Selectionne</Text>
                          ) : null}
                          <Ionicons
                            name={selected ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={selected ? Colors.primary : Colors.gray[500]}
                          />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <TouchableOpacity
              style={styles.addContactToggleButton}
              onPress={() => setShowAddContactForm((current) => !current)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={showAddContactForm ? 'remove-circle-outline' : 'person-add-outline'}
                size={18}
                color={Colors.primary}
              />
              <Text style={styles.addContactToggleText}>
                {showAddContactForm ? 'Fermer le formulaire' : 'Ajouter un proche maintenant'}
              </Text>
            </TouchableOpacity>

            {showAddContactForm && (
              <View style={styles.addContactForm}>
                <TextInput
                  style={styles.addContactInput}
                  placeholder="Nom complet du proche"
                  placeholderTextColor={Colors.gray[400]}
                  value={newContactName}
                  onChangeText={setNewContactName}
                  editable={!isAddingContact}
                />
                <TextInput
                  style={styles.addContactInput}
                  placeholder="Numero de telephone (appel ou WhatsApp)"
                  placeholderTextColor={Colors.gray[400]}
                  value={newContactPhone}
                  onChangeText={setNewContactPhone}
                  keyboardType="phone-pad"
                  editable={!isAddingContact}
                />
                <TextInput
                  style={styles.addContactInput}
                  placeholder="Lien avec vous (optionnel): soeur, ami, parent"
                  placeholderTextColor={Colors.gray[400]}
                  value={newContactRelationship}
                  onChangeText={setNewContactRelationship}
                  editable={!isAddingContact}
                />
                <TouchableOpacity
                  style={[
                    styles.addContactSubmitButton,
                    isAddingContact && styles.modalButtonDisabled,
                  ]}
                  onPress={handleAddEmergencyContact}
                  disabled={isAddingContact}
                >
                  {isAddingContact ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Text style={styles.addContactSubmitText}>Ajouter ce proche et le selectionner</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addContactManageButton}
                  onPress={() => {
                    setContactModalVisible(false);
                    router.push('/security');
                  }}
                >
                  <Text style={styles.addContactManageText}>Gerer tous mes proches</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setContactModalVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalButtonSecondaryText}>
                  {contactActionMode === 'manage' ? 'Fermer' : 'Annuler'}
                </Text>
              </TouchableOpacity>
              {contactActionMode !== 'manage' && (
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    (activeContacts.length === 0 ||
                      selectedCount === 0 ||
                      (contactActionMode === 'start' && !canStartFromContext)) &&
                      styles.modalButtonDisabled,
                  ]}
                  onPress={handleStartOrNotify}
                  disabled={
                    activeContacts.length === 0 ||
                    selectedCount === 0 ||
                    (contactActionMode === 'start' && !canStartFromContext) ||
                    isStartingTracking ||
                    isNotifyingContacts
                  }
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalButtonPrimaryText}>
                    {modalPrimaryActionLabel}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {contactActionMode === 'start' && !canStartFromContext ? (
              <View style={styles.modalWarningRow}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
                <Text style={styles.modalWarningText}>
                  Votre reservation doit etre acceptee avant activation du suivi. Vous pouvez deja choisir et ajouter vos proches.
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={historyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.historyModalCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Historique securite</Text>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.gray[700]} />
              </TouchableOpacity>
            </View>

            {isFetchingHistory ? (
              <View style={styles.historyLoading}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : (
              <ScrollView style={styles.historyContent} showsVerticalScrollIndicator={false}>
                {participantHistory?.events?.length ? (
                  <>
                    <Text style={styles.historySectionTitle}>Evenements</Text>
                    {participantHistory.events.map((event) => (
                      <View key={event.id} style={styles.historyItem}>
                        <Text style={styles.historyItemTitle}>{eventLabel(event.type)}</Text>
                        <Text style={styles.historyItemDate}>{formatDateTime(event.occurredAt)}</Text>
                      </View>
                    ))}
                  </>
                ) : null}

                {participantHistory?.notifications?.length ? (
                  <>
                    <Text style={styles.historySectionTitle}>Notifications</Text>
                    {participantHistory.notifications.map((notification) => (
                      <View key={notification.id} style={styles.historyItem}>
                        <Text style={styles.historyItemTitle}>
                          {notificationLabel(notification.notificationType)} ({notification.channel})
                        </Text>
                        <Text style={styles.historyItemDate}>
                          {formatDateTime(notification.createdAt)} - {notification.status}
                        </Text>
                      </View>
                    ))}
                  </>
                ) : null}

                {!participantHistory?.events?.length && !participantHistory?.notifications?.length ? (
                  <Text style={styles.noHistoryText}>Aucun historique disponible pour le moment.</Text>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  subtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    marginLeft: Spacing.sm,
  },
  statusText: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
  },
  description: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 18,
    marginBottom: Spacing.xs,
  },
  guidanceBlock: {
    marginBottom: Spacing.sm,
  },
  guidanceHint: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  noticeCardWarning: {
    borderColor: Colors.warning + '45',
    backgroundColor: Colors.warning + '12',
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  noticeTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  noticeText: {
    fontSize: FontSizes.xs,
    lineHeight: 17,
    color: Colors.gray[700],
  },
  metaBlock: {
    marginBottom: Spacing.sm,
    gap: 4,
  },
  metaText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  actionButton: {
    width: '48%',
    minHeight: 56,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.gray[50],
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  actionButtonText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
    lineHeight: 18,
  },
  autoSyncText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textAlign: 'center',
    marginTop: 2,
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  refreshText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: Spacing.md,
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: '82%',
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginBottom: Spacing.md,
  },
  modalGuideCard: {
    borderWidth: 1,
    borderColor: Colors.primary + '25',
    backgroundColor: Colors.primary + '08',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  modalGuideTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: 4,
  },
  modalGuideStep: {
    fontSize: FontSizes.xs,
    color: Colors.gray[700],
    lineHeight: 17,
  },
  contactsToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  contactsToolButton: {
    minHeight: 34,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  contactsToolButtonText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  selectedCountText: {
    marginLeft: 'auto',
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.semibold,
  },
  addContactToggleButton: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '45',
    backgroundColor: Colors.primary + '12',
    paddingHorizontal: Spacing.md,
  },
  addContactToggleText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  addContactForm: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  addContactInput: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    color: Colors.gray[900],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.sm,
  },
  addContactSubmitButton: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addContactSubmitText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  addContactManageButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  addContactManageText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  contactsList: {
    maxHeight: 280,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    backgroundColor: Colors.white,
  },
  contactRowSelected: {
    backgroundColor: Colors.primary + '12',
    borderColor: Colors.primary,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.semibold,
  },
  contactPhone: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginTop: 2,
  },
  contactSelectionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: Spacing.sm,
  },
  contactSelectedChip: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: FontWeights.bold,
    borderWidth: 1,
    borderColor: Colors.primary + '45',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: Colors.primary + '10',
    overflow: 'hidden',
  },
  emptyContactsBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  emptyContactsText: {
    textAlign: 'center',
    color: Colors.gray[500],
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  emptyContactsPrimaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  emptyContactsPrimaryText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  manageContactsButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  manageContactsButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  modalWarningRow: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.warning + '35',
    backgroundColor: Colors.warning + '12',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  modalWarningText: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: Colors.gray[700],
    lineHeight: 17,
  },
  modalButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    minHeight: 46,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  modalButtonSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
  },
  modalButtonDisabled: {
    opacity: 0.55,
  },
  modalButtonPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  modalButtonSecondaryText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.bold,
  },
  historyModalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: '85%',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  historyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  historyLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  historyContent: {
    maxHeight: 420,
  },
  historySectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  historyItem: {
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  historyItemTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  historyItemDate: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  noHistoryText: {
    textAlign: 'center',
    color: Colors.gray[500],
    marginTop: Spacing.md,
  },
});

export default TripSecurityPanel;
