import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useAcceptBookingMutation,
  useGetTripBookingsQuery,
  useRejectBookingMutation,
} from '@/store/api/bookingApi';
import { useGetTripByIdQuery, useUpdateTripMutation } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import type { Booking, BookingStatus } from '@/types';
import { formatTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type FeedbackState = { type: 'success' | 'error'; message: string } | null;

const BOOKING_STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; color: string; background: string }
> = {
  pending: {
    label: 'En attente',
    color: Colors.secondary,
    background: 'rgba(247, 184, 1, 0.15)',
  },
  accepted: {
    label: 'Confirmée',
    color: Colors.success,
    background: 'rgba(46, 204, 113, 0.18)',
  },
  rejected: {
    label: 'Refusée',
    color: Colors.danger,
    background: 'rgba(239, 68, 68, 0.16)',
  },
  cancelled: {
    label: 'Annulée',
    color: Colors.gray[600],
    background: 'rgba(156, 163, 175, 0.2)',
  },
  completed: {
    label: 'Terminée',
    color: Colors.gray[600],
    background: 'rgba(107, 114, 128, 0.18)',
  },
};

export default function ManageTripScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const tripId = typeof id === 'string' ? id : '';
  const user = useAppSelector(selectUser);
  const {
    data: trip,
    isLoading: tripLoading,
    isFetching: tripFetching,
    refetch: refetchTrip,
  } = useGetTripByIdQuery(tripId, { skip: !tripId });
  const isOwner = useMemo(() => !!trip && !!user && trip.driverId === user.id, [trip, user]);
  const {
    data: bookings,
    isLoading: bookingsLoading,
    isFetching: bookingsFetching,
    refetch: refetchBookings,
  } = useGetTripBookingsQuery(tripId, { skip: !tripId });
  const [acceptBooking, { isLoading: isAccepting }] = useAcceptBookingMutation();
  const [rejectBooking, { isLoading: isRejecting }] = useRejectBookingMutation();
  const [updateTrip, { isLoading: isCancellingTrip }] = useUpdateTripMutation();

  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [targetBooking, setTargetBooking] = useState<Booking | null>(null);
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);

  const refreshAll = () => {
    refetchTrip();
    refetchBookings();
  };

  const showFeedback = (type: 'success' | 'error', message: string | string[]) => {
    setFeedback({
      type,
      message: Array.isArray(message) ? message.join('\n') : message,
    });
  };

  const openRejectModal = (booking: Booking) => {
    setTargetBooking(booking);
    setRejectReason('');
    setRejectError('');
    setRejectModalVisible(true);
  };

  const closeRejectModal = () => {
    if (isRejecting) return;
    setRejectModalVisible(false);
    setTargetBooking(null);
    setRejectReason('');
    setRejectError('');
  };

  const handleAcceptBooking = async (bookingId: string) => {
    setProcessingBookingId(bookingId);
    try {
      await acceptBooking(bookingId).unwrap();
      showFeedback('success', 'La réservation a été acceptée.');
      refreshAll();
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? 'Impossible d’accepter cette réservation.';
      showFeedback('error', message);
    } finally {
      setProcessingBookingId(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!targetBooking) return;
    if (!rejectReason.trim()) {
      setRejectError('Veuillez indiquer un motif de refus.');
      return;
    }
    setProcessingBookingId(targetBooking.id);
    try {
      await rejectBooking({ id: targetBooking.id, reason: rejectReason.trim() }).unwrap();
      showFeedback('success', 'La réservation a été refusée.');
      closeRejectModal();
      refreshAll();
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? 'Impossible de refuser cette réservation.';
      setRejectError(Array.isArray(message) ? message.join('\n') : message);
    } finally {
      setProcessingBookingId(null);
    }
  };

  const handleCancelTrip = () => {
    if (!trip) return;
    Alert.alert(
      'Annuler le trajet',
      'Les passagers seront notifiés. Continuer ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateTrip({ id: trip.id, updates: { status: 'cancelled' } }).unwrap();
              showFeedback('success', 'Le trajet a été annulé.');
              router.back();
            } catch (error: any) {
              const message =
                error?.data?.message ?? error?.error ?? 'Impossible d’annuler ce trajet.';
              showFeedback('error', message);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  // console.log("this user is owner", isOwner);
  // console.log("this user is", user);

  const pendingBookings = (bookings ?? []).filter((booking) => booking.status === 'pending');

  if (!tripId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>Trajet introuvable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (tripLoading || tripFetching) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.emptyText}>Chargement du trajet…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>Trajet introuvable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isOwner) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="lock-closed" size={32} color={Colors.primary} />
          <Text style={[styles.emptyText, { marginTop: Spacing.sm }]}>
            Vous n’avez pas l’autorisation d’accéder à ce trajet.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.primary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Gestion du trajet</Text>
          <Text style={styles.headerSubtitle}>{formatTime(trip.departureTime)}</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={refreshAll}
          disabled={tripFetching || bookingsFetching}
        >
          {tripFetching || bookingsFetching ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="refresh" size={20} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {feedback && (
        <View
          style={[
            styles.feedbackBanner,
            feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
          ]}
        >
          <Ionicons
            name={feedback.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={18}
            color={Colors.white}
          />
          <Text style={styles.feedbackText}>{feedback.message}</Text>
          <TouchableOpacity onPress={() => setFeedback(null)}>
            <Ionicons name="close" size={16} color={Colors.white} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryStatus}>
            <Text style={styles.summaryLabel}>Statut</Text>
            <Text style={[styles.summaryValue, statusColor(trip.status)]}>{labelStatus(trip.status)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Ionicons name="location" size={18} color={Colors.success} />
            <Text style={styles.summaryRouteText}>{trip.departure.name}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Ionicons name="navigate" size={18} color={Colors.primary} />
            <Text style={styles.summaryRouteText}>{trip.arrival.name}</Text>
          </View>
          <View style={styles.summaryMeta}>
            <Text style={styles.summaryMetaText}>
              {trip.availableSeats} places • {trip.price} FC / place
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: Spacing.lg }]}
            onPress={handleCancelTrip}
            disabled={isCancellingTrip}
          >
            {isCancellingTrip ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Annuler le trajet</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Réservations</Text>
              <Text style={styles.sectionSubtitle}>
                {pendingBookings.length} en attente • {(bookings ?? []).length} au total
              </Text>
            </View>
          </View>

          {bookingsLoading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loaderText}>Chargement des réservations…</Text>
            </View>
          ) : (bookings ?? []).length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-circle" size={42} color={Colors.gray[400]} />
              <Text style={styles.emptyTitle}>Aucune demande</Text>
              <Text style={styles.emptySubtitle}>Les passagers verront votre trajet très vite.</Text>
            </View>
          ) : (
            bookings?.map((booking, index) => {
              const statusConfig = BOOKING_STATUS_CONFIG[booking.status];
              const isProcessing =
                processingBookingId === booking.id && (isAccepting || isRejecting);
              return (
                <Animated.View
                  key={booking.id}
                  entering={FadeInDown.delay(index * 80)}
                  style={styles.bookingCard}
                >
                  <View style={styles.bookingHeader}>
                    <View style={styles.avatar}>
                      <Ionicons name="person" size={22} color={Colors.white} />
                    </View>
                    <View style={styles.bookingInfo}>
                      <Text style={styles.bookingName}>{booking.passengerName ?? 'Passager'}</Text>
                      <Text style={styles.bookingMeta}>
                        {booking.numberOfSeats} place{booking.numberOfSeats > 1 ? 's' : ''} •{' '}
                        {formatTime(booking.createdAt)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: statusConfig.background },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: statusConfig.color }]}>
                        {statusConfig.label}
                      </Text>
                    </View>
                  </View>

                  {booking.rejectionReason ? (
                    <View style={styles.reasonBanner}>
                      <Ionicons name="alert" size={16} color={Colors.danger} />
                      <Text style={styles.reasonText}>{booking.rejectionReason}</Text>
                    </View>
                  ) : null}

                  <View style={styles.bookingFooter}>
                    <View>
                      <Text style={styles.metaLabel}>Montant estimé</Text>
                      <Text style={[styles.metaValue, { color: Colors.success }]}>
                        {booking.trip ? booking.trip.price * booking.numberOfSeats : '--'} FC
                      </Text>
                    </View>
                    {booking.status === 'pending' ? (
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.acceptButton]}
                          onPress={() => handleAcceptBooking(booking.id)}
                          disabled={isProcessing}
                        >
                          {isProcessing && processingBookingId === booking.id ? (
                            <ActivityIndicator color={Colors.white} />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                              <Text style={styles.actionText}>Accepter</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.rejectButton]}
                          onPress={() => openRejectModal(booking)}
                          disabled={isProcessing}
                        >
                          <Ionicons name="close-circle" size={18} color={Colors.danger} />
                          <Text style={[styles.actionText, { color: Colors.danger }]}>Refuser</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                </Animated.View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal animationType="slide" transparent visible={rejectModalVisible}>
        <View style={styles.bookingModalOverlay}>
          <View style={styles.bookingModalCard}>
            <Text style={styles.bookingModalTitle}>Refuser la réservation</Text>
            <Text style={styles.bookingModalDescription}>
              Expliquez brièvement au passager la raison du refus.
            </Text>
            <TextInput
              style={styles.bookingSeatInput}
              placeholder="Ex: Nombre de places insuffisant"
              placeholderTextColor={Colors.gray[400]}
              value={rejectReason}
              onChangeText={(text) => {
                setRejectReason(text);
                if (rejectError) setRejectError('');
              }}
              multiline
              editable={!isRejecting}
            />
            {rejectError ? <Text style={styles.bookingModalError}>{rejectError}</Text> : null}
            <View style={styles.bookingModalActions}>
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonSecondary]}
                onPress={closeRejectModal}
                disabled={isRejecting}
              >
                <Text style={styles.bookingModalButtonSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonPrimary]}
                onPress={handleRejectSubmit}
                disabled={isRejecting}
              >
                {isRejecting ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.bookingModalButtonPrimaryText}>Confirmer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const labelStatus = (status: string) => {
  switch (status) {
    case 'upcoming':
      return 'À venir';
    case 'ongoing':
      return 'En cours';
    case 'completed':
      return 'Terminé';
    case 'cancelled':
      return 'Annulé';
    default:
      return status;
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case 'upcoming':
      return { color: Colors.secondary };
    case 'ongoing':
      return { color: Colors.info };
    case 'completed':
      return { color: Colors.success };
    case 'cancelled':
    default:
      return { color: Colors.gray[600] };
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    color: Colors.gray[600],
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerSubtitle: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    ...CommonStyles.shadowSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  feedbackSuccess: {
    backgroundColor: Colors.success,
  },
  feedbackError: {
    backgroundColor: Colors.danger,
  },
  feedbackText: {
    flex: 1,
    marginHorizontal: Spacing.sm,
    color: Colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  summaryStatus: {
    marginBottom: Spacing.md,
  },
  summaryLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  summaryValue: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  summaryRouteText: {
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    flex: 1,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.gray[200],
    marginVertical: Spacing.sm,
  },
  summaryMeta: {
    marginTop: Spacing.sm,
  },
  summaryMetaText: {
    color: Colors.gray[600],
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: FontSizes.lg,
  },
  sectionSubtitle: {
    color: Colors.gray[500],
  },
  loader: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  loaderText: {
    color: Colors.gray[500],
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  emptySubtitle: {
    color: Colors.gray[500],
    textAlign: 'center',
  },
  bookingCard: {
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  bookingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  bookingInfo: {
    flex: 1,
  },
  bookingName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingMeta: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
  },
  reasonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.08)',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  reasonText: {
    color: Colors.danger,
    flex: 1,
  },
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metaValue: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  acceptButton: {
    backgroundColor: Colors.primary,
  },
  rejectButton: {
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  actionText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  bookingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  bookingModalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    ...CommonStyles.shadowLg,
  },
  bookingModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingModalDescription: {
    color: Colors.gray[600],
    marginVertical: Spacing.sm,
  },
  bookingSeatInput: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    textAlignVertical: 'top',
  },
  bookingModalError: {
    color: Colors.danger,
    marginTop: Spacing.sm,
  },
  bookingModalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  bookingModalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  bookingModalButtonSecondary: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
  },
  bookingModalButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  bookingModalButtonSecondaryText: {
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  bookingModalButtonPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
});

