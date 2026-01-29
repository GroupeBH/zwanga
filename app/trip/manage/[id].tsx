import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import {
  useAcceptBookingMutation,
  useConfirmDropoffMutation,
  useConfirmPickupMutation,
  useGetTripBookingsQuery,
  useRejectBookingMutation,
} from '@/store/api/bookingApi';
import { useGetTripByIdQuery, usePauseTripMutation, useStartTripMutation, useUpdateTripMutation } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import type { Booking, BookingStatus } from '@/types';
import { formatTime } from '@/utils/dateHelpers';
import { openPhoneCall, openWhatsApp } from '@/utils/phoneHelpers';
import { calculateDistance } from '@/utils/routeHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';


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
  expired: {
    label: 'Expirée',
    color: Colors.gray[600],
    background: 'rgba(156, 163, 175, 0.2)',
  },
};

export default function ManageTripScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const tripId = typeof id === 'string' ? id : '';
  const user = useAppSelector(selectUser);
  const { isIdentityVerified } = useIdentityCheck();
  
  // Polling intelligent basé sur le statut du trajet
  const [pollingInterval, setPollingInterval] = useState<number>(0);
  
  const {
    data: trip,
    isLoading: tripLoading,
    isFetching: tripFetching,
    refetch: refetchTrip,
  } = useGetTripByIdQuery(tripId, { 
    skip: !tripId,
    pollingInterval,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  // Mettre à jour l'intervalle de polling en fonction du statut du trajet
  // Note: polling réduit car la navigation gère le temps réel via WebSocket
  useEffect(() => {
    if (!trip) {
      setPollingInterval(0);
      return;
    }
    
    // Polling léger - la navigation gère le temps réel pour les trajets en cours
    if (trip.status === 'ongoing') {
      setPollingInterval(60000); // 60 secondes - juste pour sync occasionnel
    } else if (trip.status === 'upcoming') {
      setPollingInterval(60000); // 60 secondes pour les trajets à venir
    } else {
      setPollingInterval(0); // Pas de polling pour les trajets terminés/annulés
    }
  }, [trip?.status]);

  const isOwner = useMemo(() => !!trip && !!user && trip.driverId === user.id, [trip, user]);
  const {
    data: bookings,
    isLoading: bookingsLoading,
    isFetching: bookingsFetching,
    refetch: refetchBookings,
  } = useGetTripBookingsQuery(tripId, { 
    skip: !tripId,
    // Polling réduit - utiliser le refresh manuel ou refetchOnFocus
    pollingInterval: trip?.status === 'upcoming' ? 60000 : 0,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const [acceptBooking, { isLoading: isAccepting }] = useAcceptBookingMutation();
  const [rejectBooking, { isLoading: isRejecting }] = useRejectBookingMutation();
  const [updateTrip, { isLoading: isCancellingTrip }] = useUpdateTripMutation();
  const [startTrip, { isLoading: isStartingTrip }] = useStartTripMutation();
  const [pauseTrip, { isLoading: isPausingTrip }] = usePauseTripMutation();
  const [confirmPickup, { isLoading: isConfirmingPickup }] = useConfirmPickupMutation();
  const [confirmDropoff, { isLoading: isConfirmingDropoff }] = useConfirmDropoffMutation();

  // console.log("this bookings", bookings);

  const { showDialog } = useDialog();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [targetBooking, setTargetBooking] = useState<Booking | null>(null);
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [selectedPassengerPhone, setSelectedPassengerPhone] = useState<string | null>(null);
  const [selectedPassengerName, setSelectedPassengerName] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchTrip(), refetchBookings()]);
    } catch (error) {
      console.warn('Error refreshing trip data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchTrip, refetchBookings]);

  // Calculate arrival coordinate for canCompleteTrip
  const arrivalCoordinate = useMemo(
    () => trip ? {
      latitude: trip.arrival.lat,
      longitude: trip.arrival.lng,
    } : null,
    [trip?.arrival.lat, trip?.arrival.lng],
  );

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

  const handleStartTrip = async () => {
    if (!trip) return;
    showDialog({
      variant: 'info',
      title: 'Démarrer le trajet',
      message: 'Voulez-vous démarrer ce trajet maintenant ? Les passagers seront notifiés.',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Démarrer',
          variant: 'primary',
          onPress: async () => {
            try {
              await startTrip(trip.id).unwrap();
              showFeedback('success', 'Le trajet a été démarré avec succès.');
              refreshAll();
            } catch (error: any) {
              const message =
                error?.data?.message ?? error?.error ?? 'Impossible de démarrer ce trajet.';
              showFeedback('error', message);
            }
          },
        },
      ],
    });
  };

  const handlePauseTrip = async () => {
    if (!trip) return;
    showDialog({
      variant: 'warning',
      title: 'Interrompre le trajet',
      message: 'Voulez-vous interrompre ce trajet ? Les passagers seront notifiés et le trajet repassera en attente.',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Interrompre',
          variant: 'secondary',
          onPress: async () => {
            try {
              await pauseTrip(trip.id).unwrap();
              showFeedback('success', 'Le trajet a été interrompu avec succès.');
              refreshAll();
            } catch (error: any) {
              const message =
                error?.data?.message ?? error?.error ?? 'Impossible d\'interrompre ce trajet.';
              showFeedback('error', message);
            }
          },
        },
      ],
    });
  };

  const handleOpenNavigation = () => {
    if (!trip) return;

    const { arrival } = trip;
    if (!arrival || !arrival.lat || !arrival.lng) {
      showDialog({
        title: 'Erreur',
        message: 'Les coordonnées de destination sont indisponibles.',
        variant: 'danger',
      });
      return;
    }

    // Ouvrir l'écran de navigation intégré
    router.push(`/trip/navigate/${trip.id}`);
  };

  const handleConfirmPickup = async (bookingId: string) => {
    try {
      await confirmPickup(bookingId).unwrap();
      showFeedback('success', 'Récupération du passager confirmée.');
      refreshAll();
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? 'Impossible de confirmer la récupération.';
      showFeedback('error', message);
    }
  };

  const handleConfirmDropoff = async (bookingId: string) => {
    try {
      await confirmDropoff(bookingId).unwrap();
      showFeedback('success', 'Dépose du passager confirmée.');
      refreshAll();
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? 'Impossible de confirmer la dépose.';
      showFeedback('error', message);
    }
  };

  const handleCancelTrip = () => {
    if (!trip) return;
    showDialog({
      variant: 'warning',
      title: 'Annuler le trajet',
      message: 'Les passagers seront notifiés immédiatement. Voulez-vous continuer ?',
      actions: [
        { label: 'Retour', variant: 'ghost' },
        {
          label: 'Oui, annuler',
          variant: 'primary',
          onPress: async () => {
            try {
              await updateTrip({ id: trip.id, updates: { status: 'cancelled' } }).unwrap();
              showFeedback('success', 'Le trajet a été annulé.');
              router.back();
            } catch (error: any) {
              const message =
                error?.data?.message ?? error?.error ?? "Impossible d'annuler ce trajet.";
              showFeedback('error', message);
            }
          },
        },
      ],
    });
  };

  const handleCompleteTrip = () => {
    if (!trip) return;
    showDialog({
      variant: 'info',
      title: 'Terminer le trajet',
      message: 'Voulez-vous terminer ce trajet ? Le trajet sera marqué comme complété.',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Terminer',
          variant: 'primary',
          onPress: async () => {
            try {
              await updateTrip({ id: trip.id, updates: { status: 'completed' } }).unwrap();
              showFeedback('success', 'Le trajet a été terminé avec succès.');
              refreshAll();
            } catch (error: any) {
              const message =
                error?.data?.message ?? error?.error ?? 'Impossible de terminer ce trajet.';
              showFeedback('error', message);
            }
          },
        },
      ],
    });
  };

  // Vérifier si tous les passagers sont déposés
  const allPassengersDroppedOff = useMemo(() => {
    if (!bookings || bookings.length === 0) return true;
    const acceptedBookings = bookings.filter((booking) => booking.status === 'accepted');
    if (acceptedBookings.length === 0) return true;
    return acceptedBookings.every(
      (booking) => booking.droppedOff && booking.droppedOffConfirmedByPassenger,
    );
  }, [bookings]);

  // Vérifier si le conducteur est arrivé à destination (distance < 100m)
  const isAtDestination = useMemo(() => {
    if (!trip || !arrivalCoordinate || trip.status !== 'ongoing') return false;
    
    // Obtenir la position actuelle du conducteur
    const currentCoordinate = trip.currentLocation?.coordinates
      ? {
          latitude: trip.currentLocation.coordinates[1],
          longitude: trip.currentLocation.coordinates[0],
        }
      : null;

    if (!currentCoordinate) return false;

    // Calculer la distance en kilomètres
    const distanceKm = calculateDistance(currentCoordinate, arrivalCoordinate);
    // Convertir en mètres et vérifier si < 100m
    const distanceMeters = distanceKm * 1000;
    return distanceMeters < 100; // 100 mètres de tolérance
  }, [trip?.currentLocation, trip?.status, arrivalCoordinate]);

  // Le bouton "Terminer le trajet" doit apparaître si :
  // - Le trajet est en cours
  // - Tous les passagers sont déposés
  // - Le conducteur est arrivé à destination
  const canCompleteTrip = trip?.status === 'ongoing' && allPassengersDroppedOff && isAtDestination;

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
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: Spacing.lg, paddingHorizontal: Spacing.xl }]}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!isIdentityVerified) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="shield-outline" size={34} color={Colors.primary} />
          <Text style={[styles.emptyText, { marginTop: Spacing.sm }]}>
            Votre identité doit être vérifiée (KYC validé) pour gérer vos trajets.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: Spacing.lg }]}
            onPress={() => router.push('/profile')}
          >
            <Text style={styles.primaryButtonText}>Compléter mon KYC</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Gestion du trajet</Text>
          <View style={styles.headerBadge}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(trip.status).color }]} />
            <Text style={[styles.headerSubtitle, { color: statusColor(trip.status).color }]}>
              {labelStatus(trip.status)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={refreshAll}
          disabled={tripFetching || bookingsFetching}
          activeOpacity={0.7}
        >
          {tripFetching || bookingsFetching ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="refresh" size={20} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {feedback && (
        <Animated.View
          entering={FadeInDown}
          style={[
            styles.feedbackBanner,
            feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
          ]}
        >
          <Ionicons
            name={feedback.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={20}
            color={Colors.white}
          />
          <Text style={styles.feedbackText}>{feedback.message}</Text>
          <TouchableOpacity onPress={() => setFeedback(null)}>
            <Ionicons name="close" size={18} color={Colors.white} />
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={Colors.primary} />
        }
      >
        {/* Résumé du trajet */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.timeContainer}>
              <Ionicons name="time-outline" size={20} color={Colors.gray[600]} />
              <Text style={styles.timeText}>{formatTime(trip.departureTime)}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor(trip.status).color + '20' }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor(trip.status).color }]}>
                {labelStatus(trip.status).toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.itineraryContainer}>
            <View style={styles.itineraryTimeline}>
              <View style={[styles.timelineDot, { backgroundColor: Colors.primary }]} />
              <View style={styles.timelineLine} />
              <View style={[styles.timelineDot, { backgroundColor: Colors.secondary }]} />
            </View>
            <View style={styles.itineraryDetails}>
              <View style={styles.itineraryPoint}>
                <Text style={styles.itineraryLabel}>Départ</Text>
                <Text style={styles.itineraryValue} numberOfLines={2}>{trip.departure.address}</Text>
              </View>
              <View style={styles.itineraryPoint}>
                <Text style={styles.itineraryLabel}>Arrivée</Text>
                <Text style={styles.itineraryValue} numberOfLines={2}>{trip.arrival.address}</Text>
              </View>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <View style={styles.statIconContainer}>
                <Ionicons name="people" size={18} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.statLabel}>Places</Text>
                <Text style={styles.statValue}>{trip.availableSeats} / {trip.totalSeats}</Text>
              </View>
            </View>
            <View style={styles.statItem}>
              <View style={styles.statIconContainer}>
                <Ionicons name="cash" size={18} color={Colors.success} />
              </View>
              <View>
                <Text style={styles.statLabel}>Prix</Text>
                <Text style={styles.statValue}>{trip.price} FC</Text>
              </View>
            </View>
          </View>

        </View>

        {/* Liste des passagers */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Passagers</Text>
              <Text style={styles.sectionSubtitle}>
                {bookings?.length || 0} réservation(s) au total
              </Text>
            </View>
            {(trip.status === 'upcoming' || trip.status === 'ongoing') && (
              <TouchableOpacity 
                style={styles.actionIconButton}
                onPress={handleOpenNavigation}
              >
                <Ionicons name="navigate" size={20} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {bookings && bookings.length > 0 ? (
            bookings.map((booking) => (
              <View key={booking.id} style={styles.bookingCard}>
                <View style={styles.bookingHeader}>
                  <TouchableOpacity
                    style={styles.avatar}
                    onPress={() => router.push(`/passenger/${booking.passengerId}`)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: Colors.white, fontWeight: 'bold' }}>
                      {(booking.passengerName || 'P').charAt(0)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.bookingInfo}
                    onPress={() => router.push(`/passenger/${booking.passengerId}`)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.bookingName}>{booking.passengerName}</Text>
                    <Text style={styles.bookingMeta}>
                      {booking.numberOfSeats} place(s) • {(booking.numberOfSeats * (trip?.price ?? 0)).toLocaleString()} FC
                    </Text>
                    {booking.passengerDestination && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                        <Ionicons name="location-outline" size={12} color={Colors.gray[500]} />
                        <Text style={{ fontSize: 11, color: Colors.gray[500] }} numberOfLines={1}>
                          Vers: {booking.passengerDestination}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'column', alignItems: 'flex-end', gap: Spacing.xs }}>
                    <View style={[styles.statusBadge, { backgroundColor: BOOKING_STATUS_CONFIG[booking.status].background }]}>
                      <Text style={[styles.statusBadgeText, { color: BOOKING_STATUS_CONFIG[booking.status].color }]}>
                        {BOOKING_STATUS_CONFIG[booking.status].label}
                      </Text>
                    </View>
                    {/* Bouton de notation dans la carte du passager */}
                    {booking.status === 'accepted' && (
                      (booking.droppedOff && booking.droppedOffConfirmedByPassenger) || 
                      (trip.status === 'completed')
                    ) && (
                      <TouchableOpacity
                        style={[styles.rateButtonInCard, { backgroundColor: Colors.secondary }]}
                        onPress={() => router.push(`/rate/${trip.id}?passengerId=${booking.passengerId}`)}
                      >
                        <Ionicons name="star" size={14} color={Colors.white} />
                        <Text style={[styles.rateButtonInCardText, { color: Colors.white }]}>Noter</Text>
                      </TouchableOpacity>
                    )}
                    {/* Bouton pour voir le profil du passager */}
                    <TouchableOpacity
                      style={[styles.viewProfileButton]}
                      onPress={() => router.push(`/passenger/${booking.passengerId}`)}
                    >
                      <Ionicons name="person-outline" size={14} color={Colors.primary} />
                      <Text style={[styles.viewProfileButtonText, { color: Colors.primary }]}>Profil</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {booking.status === 'pending' && (
                  <View style={styles.bookingFooter}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.rejectButton]}
                      onPress={() => openRejectModal(booking)}
                      disabled={isAccepting || isRejecting}
                    >
                      <Text style={[styles.actionText, { color: Colors.danger }]}>Refuser</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.acceptButton]}
                      onPress={() => handleAcceptBooking(booking.id)}
                      disabled={isAccepting || isRejecting}
                    >
                      {processingBookingId === booking.id ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <Text style={styles.actionText}>Accepter</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {booking.status === 'accepted' && (
                  <View style={styles.bookingFooter}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: Colors.gray[100] }]}
                      onPress={() => {
                        setSelectedPassengerPhone(booking.passengerPhone || null);
                        setSelectedPassengerName(booking.passengerName || null);
                        setContactModalVisible(true);
                      }}
                    >
                      <Ionicons name="chatbubble-ellipses" size={18} color={Colors.primary} />
                      <Text style={[styles.actionText, { color: Colors.primary }]}>Contacter</Text>
                    </TouchableOpacity>
                    
                    {trip.status === 'ongoing' && !booking.pickedUp && (
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: Colors.info }]}
                        onPress={() => handleConfirmPickup(booking.id)}
                      >
                        <Text style={styles.actionText}>Récupérer</Text>
                      </TouchableOpacity>
                    )}

                    {trip.status === 'ongoing' && booking.pickedUp && !booking.droppedOff && (
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: Colors.success }]}
                        onPress={() => handleConfirmDropoff(booking.id)}
                      >
                        <Text style={styles.actionText}>Déposer</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))
          ) : (
            <View style={{ alignItems: 'center', padding: Spacing.xl }}>
              <Ionicons name="people-outline" size={48} color={Colors.gray[300]} />
              <Text style={[styles.emptyText, { marginTop: Spacing.sm }]}>
                Aucune réservation pour le moment.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky Footer pour les actions du trajet */}
      <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        {trip.status === 'upcoming' && (
          <>
            <View style={styles.upcomingActionsRow}>
              <TouchableOpacity
                style={[styles.primaryButton, styles.startTripButton, { flex: 1 }]}
                onPress={handleStartTrip}
                disabled={isStartingTrip}
                activeOpacity={0.8}
              >
                {isStartingTrip ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="play" size={20} color={Colors.white} />
                    <Text style={styles.primaryButtonText}>Démarrer</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, styles.navigationButton, { flex: 1 }]}
                onPress={handleOpenNavigation}
                activeOpacity={0.8}
              >
                <Ionicons name="navigate" size={20} color={Colors.white} />
                <Text style={styles.primaryButtonText}>Navigation</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleCancelTrip}
              disabled={isCancellingTrip}
              activeOpacity={0.8}
            >
              {isCancellingTrip ? (
                <ActivityIndicator color={Colors.danger} />
              ) : (
                <Text style={[styles.secondaryButtonText, { color: Colors.danger }]}>Annuler</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {canCompleteTrip && (
          <TouchableOpacity
            style={[styles.primaryButton, styles.completeTripButton]}
            onPress={handleCompleteTrip}
            disabled={isCancellingTrip}
            activeOpacity={0.8}
          >
            {isCancellingTrip ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={20} color={Colors.white} />
                <Text style={styles.primaryButtonText}>Terminer le trajet</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {trip.status === 'ongoing' && !canCompleteTrip && (
          <View style={styles.ongoingActionsRow}>
            <TouchableOpacity
              style={[styles.primaryButton, styles.navigationButton]}
              onPress={handleOpenNavigation}
              activeOpacity={0.8}
            >
              <Ionicons name="navigate" size={20} color={Colors.white} />
              <Text style={styles.primaryButtonText}>Navigation</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handlePauseTrip}
              disabled={isPausingTrip}
              activeOpacity={0.8}
            >
              {isPausingTrip ? (
                <ActivityIndicator color={Colors.warning} />
              ) : (
                <>
                  <Ionicons name="pause" size={20} color={Colors.warning} />
                  <Text style={[styles.secondaryButtonText, { color: Colors.warning }]}>Interrompre</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {trip.status === 'completed' && (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: Colors.secondary }]}
            onPress={() => router.push(`/rate/${trip.id}`)}
            activeOpacity={0.8}
          >
            <Ionicons name="star" size={20} color={Colors.white} />
            <Text style={styles.primaryButtonText}>Évaluer les passagers</Text>
          </TouchableOpacity>
        )}
      </View>


      <Modal animationType="slide" transparent visible={rejectModalVisible}>
        <View style={styles.bookingModalOverlay}>
          <View style={[styles.bookingModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
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


      {/* Contact Modal pour les passagers */}
      <Modal
        visible={contactModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setContactModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.contactModalOverlay}
          activeOpacity={1}
          onPress={() => setContactModalVisible(false)}
        >
          <Animated.View entering={FadeInDown} style={[styles.contactModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]} onStartShouldSetResponder={() => true}>
            <View style={styles.contactModalHeader}>
              <View style={styles.contactModalIconWrapper}>
                <View style={styles.contactModalIconBadge}>
                  <Ionicons name="call" size={32} color={Colors.primary} />
                </View>
              </View>
              <Text style={styles.contactModalTitle}>
                Contacter {selectedPassengerName || 'le passager'}
              </Text>
              <Text style={styles.contactModalSubtitle}>
                Choisissez comment contacter le passager
              </Text>
            </View>

            <View style={styles.contactModalActions}>
              <TouchableOpacity
                style={[styles.contactModalButton, styles.contactModalButtonCall]}
                onPress={async () => {
                  setContactModalVisible(false);
                  if (selectedPassengerPhone) {
                    await openPhoneCall(selectedPassengerPhone, (errorMsg) => {
                      showDialog({
                        variant: 'danger',
                        title: 'Erreur',
                        message: errorMsg,
                      });
                    });
                  }
                }}
              >
                <View style={styles.contactModalButtonIcon}>
                  <Ionicons name="call" size={24} color={Colors.success} />
                </View>
                <View style={styles.contactModalButtonContent}>
                  <Text style={styles.contactModalButtonTitle}>Appeler</Text>
                  <Text style={styles.contactModalButtonSubtitle}>Ouvrir l'application d'appel</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.contactModalButton, styles.contactModalButtonWhatsApp]}
                onPress={async () => {
                  setContactModalVisible(false);
                  if (selectedPassengerPhone) {
                    await openWhatsApp(selectedPassengerPhone, (errorMsg) => {
                      showDialog({
                        variant: 'danger',
                        title: 'Erreur',
                        message: errorMsg,
                      });
                    });
                  }
                }}
              >
                <View style={styles.contactModalButtonIcon}>
                  <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
                </View>
                <View style={styles.contactModalButtonContent}>
                  <Text style={styles.contactModalButtonTitle}>WhatsApp</Text>
                  <Text style={styles.contactModalButtonSubtitle}>Envoyer un message WhatsApp</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.contactModalCancelButton}
              onPress={() => setContactModalVisible(false)}
            >
              <Text style={styles.contactModalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
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
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  headerSubtitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    margin: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  feedbackSuccess: {
    backgroundColor: Colors.success,
  },
  feedbackError: {
    backgroundColor: Colors.danger,
  },
  feedbackText: {
    flex: 1,
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 100, // Space for sticky footer
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  rateButtonInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  rateButtonInCardText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  viewProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  viewProfileButtonText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  itineraryContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.xl,
  },
  itineraryTimeline: {
    width: 20,
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.white,
    ...CommonStyles.shadowSm,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.gray[200],
    marginVertical: 4,
  },
  itineraryDetails: {
    flex: 1,
    gap: Spacing.md,
  },
  itineraryPoint: {
    flex: 1,
  },
  itineraryLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  itineraryValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  statValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  sectionSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginTop: 2,
  },
  actionIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  bookingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  bookingName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingMeta: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[50],
  },
  metaLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  metaValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  acceptButton: {
    backgroundColor: Colors.success,
  },
  rejectButton: {
    backgroundColor: Colors.danger + '10',
  },
  actionText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    // paddingBottom is set dynamically via useSafeAreaInsets
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
    flexDirection: 'row',
    gap: Spacing.md,
    ...CommonStyles.shadowLg,
  },
  primaryButton: {
    flex: 1,
    height: 54,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    ...CommonStyles.shadowMd,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  secondaryButton: {
    flex: 0.5,
    height: 54,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
  },
  startTripButton: {
    backgroundColor: Colors.success,
  },
  completeTripButton: {
    backgroundColor: Colors.success,
  },
  ongoingActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  upcomingActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    marginBottom: Spacing.sm,
  },
  navigationButton: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  bookingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bookingModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    // paddingBottom est défini dynamiquement avec insets.bottom
  },
  bookingModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  bookingModalDescription: {
    fontSize: FontSizes.base,
    color: Colors.gray[500],
    marginBottom: Spacing.lg,
  },
  bookingSeatInput: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    minHeight: 100,
    textAlignVertical: 'top',
  },
  bookingModalError: {
    color: Colors.danger,
    fontSize: FontSizes.sm,
    marginTop: Spacing.xs,
  },
  bookingModalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  bookingModalButton: {
    flex: 1,
    height: 54,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingModalButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  bookingModalButtonSecondary: {
    backgroundColor: Colors.gray[100],
  },
  bookingModalButtonPrimaryText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  bookingModalButtonSecondaryText: {
    color: Colors.gray[700],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  contactModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  contactModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    // paddingBottom est défini dynamiquement avec insets.bottom
  },
  contactModalHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  contactModalIconWrapper: {
    marginBottom: Spacing.md,
  },
  contactModalIconBadge: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  contactModalSubtitle: {
    fontSize: FontSizes.base,
    color: Colors.gray[500],
    textAlign: 'center',
  },
  contactModalActions: {
    gap: Spacing.md,
  },
  contactModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  contactModalButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  contactModalButtonContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  contactModalButtonTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  contactModalButtonSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
  contactModalButtonCall: {
    borderColor: Colors.success + '20',
  },
  contactModalButtonWhatsApp: {
    borderColor: '#25D36620',
  },
  contactModalCancelButton: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  contactModalCancelText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
  },
});
