import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useConfirmTripSecurityParticipantMutation,
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
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type ContactActionMode = 'start' | 'notify';

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

  const { data: emergencyContacts = [] } = useGetEmergencyContactsQuery();
  const {
    data: tripParticipants = [],
    isFetching: isFetchingParticipants,
    refetch: refetchParticipants,
  } = useGetTripSecurityTripParticipantsQuery(tripId, {
    skip: !tripId || !user?.id,
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

  const activeContacts = useMemo(
    () => emergencyContacts.filter((contact) => contact.isActive),
    [emergencyContacts],
  );

  const isTrackingStarted = Boolean(participant);
  const canConfirm = Boolean(participant && participant.status !== 'completed');
  const canEscalate = Boolean(participant && !participant.isEscalated && participant.status !== 'completed');
  const isUnconfirmed = Boolean(participant && UNCONFIRMED_STATUSES.includes(participant.status));

  const disableActions =
    tripStatus === 'cancelled' ||
    (tripStatus === 'completed' && !participant) ||
    isFetchingParticipants;

  const openContactModal = (mode: ContactActionMode) => {
    const defaults = activeContacts.map((contact) => contact.id);
    setContactActionMode(mode);
    setSelectedContactIds(defaults);
    setContactModalVisible(true);
  };

  const toggleContactSelection = (contactId: string) => {
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((item) => item !== contactId)
        : [...current, contactId],
    );
  };

  const handleStartOrNotify = async () => {
    if (selectedContactIds.length === 0) {
      showDialog({
        variant: 'warning',
        title: 'Selection requise',
        message: 'Selectionnez au moins un proche de confiance.',
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
        <Text style={styles.description}>
          Activez le suivi securite des maintenant pour partager les informations du trajet avec vos proches.
        </Text>
      )}

      <View style={styles.actionsGrid}>
        <TouchableOpacity
          style={[styles.actionButton, disableActions && styles.actionButtonDisabled]}
          onPress={() => openContactModal(isTrackingStarted ? 'notify' : 'start')}
          disabled={disableActions}
        >
          {isStartingTracking || isNotifyingContacts ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons
              name={isTrackingStarted ? 'send-outline' : 'checkmark-circle-outline'}
              size={18}
              color={Colors.primary}
            />
          )}
          <Text style={styles.actionButtonText}>
            {isTrackingStarted
              ? 'Notifier proches'
              : role === 'driver'
              ? 'Trajet demarre'
              : 'Je suis embarque'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, (!canConfirm || disableActions) && styles.actionButtonDisabled]}
          onPress={handleConfirm}
          disabled={!canConfirm || disableActions || isConfirmingArrival}
        >
          {isConfirmingArrival ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="flag-outline" size={18} color={Colors.primary} />
          )}
          <Text style={styles.actionButtonText}>
            {role === 'driver' ? 'Je suis arrive' : 'Je suis depose'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={openHistory}>
          <Ionicons name="time-outline" size={18} color={Colors.primary} />
          <Text style={styles.actionButtonText}>Historique</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, (!canEscalate || disableActions) && styles.actionButtonDisabled]}
          onPress={handleEscalate}
          disabled={!canEscalate || disableActions || isEscalating}
        >
          {isEscalating ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="alert-circle-outline" size={18} color={Colors.primary} />
          )}
          <Text style={styles.actionButtonText}>Signaler</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.refreshRow} onPress={() => refetchParticipants()}>
        <Ionicons name="refresh-outline" size={14} color={Colors.gray[500]} />
        <Text style={styles.refreshText}>
          {isFetchingParticipants ? 'Actualisation...' : 'Actualiser le statut'}
        </Text>
      </TouchableOpacity>

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
                ? 'Choisir les proches a notifier'
                : 'Notifier des proches'}
            </Text>
            <Text style={styles.modalSubtitle}>
              Selectionnez un ou plusieurs contacts de confiance.
            </Text>

            {activeContacts.length === 0 ? (
              <View style={styles.emptyContactsBlock}>
                <Ionicons name="people-outline" size={24} color={Colors.gray[400]} />
                <Text style={styles.emptyContactsText}>
                  Aucun contact actif. Ajoutez des proches dans l ecran Securite.
                </Text>
                <TouchableOpacity
                  style={styles.manageContactsButton}
                  onPress={() => {
                    setContactModalVisible(false);
                    router.push('/security');
                  }}
                >
                  <Text style={styles.manageContactsButtonText}>Gerer mes contacts</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={styles.contactsList} showsVerticalScrollIndicator={false}>
                {activeContacts.map((contact) => {
                  const selected = selectedContactIds.includes(contact.id);
                  return (
                    <TouchableOpacity
                      key={contact.id}
                      style={[styles.contactRow, selected && styles.contactRowSelected]}
                      onPress={() => toggleContactSelection(contact.id)}
                    >
                      <View style={styles.contactInfo}>
                        <Text style={styles.contactName}>{contact.name}</Text>
                        <Text style={styles.contactPhone}>{contact.phone}</Text>
                      </View>
                      <Ionicons
                        name={selected ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={selected ? Colors.primary : Colors.gray[500]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setContactModalVisible(false)}
              >
                <Text style={styles.modalButtonSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalButtonPrimary,
                  activeContacts.length === 0 && styles.modalButtonDisabled,
                ]}
                onPress={handleStartOrNotify}
                disabled={activeContacts.length === 0 || isStartingTracking || isNotifyingContacts}
              >
                <Text style={styles.modalButtonPrimaryText}>
                  {contactActionMode === 'start' ? 'Demarrer' : 'Notifier'}
                </Text>
              </TouchableOpacity>
            </View>
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
    marginBottom: Spacing.sm,
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
    marginHorizontal: -4,
    marginTop: 2,
  },
  actionButton: {
    width: '50%',
    paddingHorizontal: 4,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
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
  contactsList: {
    maxHeight: 280,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  contactRowSelected: {
    backgroundColor: Colors.primary + '08',
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
  modalButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  modalButtonSecondary: {
    backgroundColor: Colors.gray[100],
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
