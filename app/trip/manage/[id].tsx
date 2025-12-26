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
import { useGetTripByIdQuery, useStartTripMutation, useUpdateTripMutation } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import type { Booking, BookingStatus } from '@/types';
import { formatTime } from '@/utils/dateHelpers';
import { openPhoneCall, openWhatsApp } from '@/utils/phoneHelpers';
import { getRouteInfo, type RouteInfo } from '@/utils/routeHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
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
  expired: {
    label: 'Expirée',
    color: Colors.gray[600],
    background: 'rgba(156, 163, 175, 0.2)',
  },
};

export default function ManageTripScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const tripId = typeof id === 'string' ? id : '';
  const user = useAppSelector(selectUser);
  const { isIdentityVerified } = useIdentityCheck();
  const {
    data: trip,
    isLoading: tripLoading,
    isFetching: tripFetching,
    refetch: refetchTrip,
  } = useGetTripByIdQuery(tripId, { skip: !tripId });
  console.log("check owner", trip?.driverId, user?.id);
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
  const [startTrip, { isLoading: isStartingTrip }] = useStartTripMutation();
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
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }> | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState<Date | null>(null);
  const [calculatedArrivalTime, setCalculatedArrivalTime] = useState<Date | null>(null);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [selectedPassengerPhone, setSelectedPassengerPhone] = useState<string | null>(null);
  const [selectedPassengerName, setSelectedPassengerName] = useState<string | null>(null);

  const refreshAll = () => {
    refetchTrip();
    refetchBookings();
  };

  // Calculate coordinates for map
  const departureCoordinate = useMemo(
    () => trip ? {
      latitude: trip.departure.lat,
      longitude: trip.departure.lng,
    } : null,
    [trip?.departure.lat, trip?.departure.lng],
  );

  const arrivalCoordinate = useMemo(
    () => trip ? {
      latitude: trip.arrival.lat,
      longitude: trip.arrival.lng,
    } : null,
    [trip?.arrival.lat, trip?.arrival.lng],
  );

  // Load route coordinates and info when trip changes
  useEffect(() => {
    if (!trip || !departureCoordinate || !arrivalCoordinate) {
      return;
    }
    setIsLoadingRoute(true);
    getRouteInfo(departureCoordinate, arrivalCoordinate)
      .then((info) => {
        setRouteCoordinates(info.coordinates);
        setRouteInfo(info);
        
        // Calculate arrival time based on departure time + route duration
        if (info.duration > 0 && trip.departureTime) {
          const departureDate = new Date(trip.departureTime);
          const arrivalDate = new Date(departureDate.getTime() + info.duration * 1000);
          setCalculatedArrivalTime(arrivalDate);
        } else {
          setCalculatedArrivalTime(null);
        }
        
        setIsLoadingRoute(false);
      })
      .catch(() => {
        // Fallback to straight line if route API fails
        setRouteCoordinates([departureCoordinate, arrivalCoordinate]);
        setCalculatedArrivalTime(null);
        setIsLoadingRoute(false);
      });
  }, [departureCoordinate, arrivalCoordinate, trip?.id, trip?.departureTime]);

  // Calculate estimated arrival time based on current position or trip progress
  useEffect(() => {
    if (!trip || !routeInfo || trip.status !== 'ongoing') {
      setEstimatedArrivalTime(null);
      return;
    }

    // Get current position from trip (if available)
    const currentCoordinate = trip.currentLocation?.coordinates
      ? {
          latitude: trip.currentLocation.coordinates[1],
          longitude: trip.currentLocation.coordinates[0],
        }
      : null;

    if (!currentCoordinate) {
      // Fallback: use progress to estimate remaining time
      const progress = trip.progress || 0;
      if (routeInfo.duration > 0 && typeof progress === 'number') {
        const remainingProgress = (100 - Math.min(Math.max(progress, 0), 100)) / 100;
        const remainingDurationSeconds = routeInfo.duration * remainingProgress;
        const estimatedArrival = new Date(Date.now() + remainingDurationSeconds * 1000);
        setEstimatedArrivalTime(estimatedArrival);
      } else {
        setEstimatedArrivalTime(null);
      }
      return;
    }

    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    const calculateETA = () => {
      // Calculate remaining route from current position to destination
      if (!currentCoordinate || !arrivalCoordinate) {
        return;
      }
      getRouteInfo(currentCoordinate, arrivalCoordinate)
        .then((remainingRouteInfo) => {
          if (!isMounted) return;
          const remainingDurationSeconds = remainingRouteInfo.duration;
          const estimatedArrival = new Date(Date.now() + remainingDurationSeconds * 1000);
          setEstimatedArrivalTime(estimatedArrival);
        })
        .catch(() => {
          if (!isMounted) return;
          // Fallback: use progress to estimate remaining time
          const progress = trip.progress || 0;
          if (routeInfo.duration > 0 && typeof progress === 'number') {
            const remainingProgress = (100 - Math.min(Math.max(progress, 0), 100)) / 100;
            const remainingDurationSeconds = routeInfo.duration * remainingProgress;
            const estimatedArrival = new Date(Date.now() + remainingDurationSeconds * 1000);
            setEstimatedArrivalTime(estimatedArrival);
          } else {
            setEstimatedArrivalTime(null);
          }
        });
    };

    // Debounce: wait 5 seconds after position change before calculating
    timeoutId = setTimeout(calculateETA, 5000);

    // Also calculate immediately if this is the first time
    calculateETA();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [trip?.status, trip?.currentLocation, trip?.progress, routeInfo, arrivalCoordinate]);

  const mapRegion = useMemo(() => {
    if (!departureCoordinate || !arrivalCoordinate) {
      return {
        latitude: -4.441931,
        longitude: 15.266293,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
    }
    const latitudeCenter = (departureCoordinate.latitude + arrivalCoordinate.latitude) / 2;
    const longitudeCenter = (departureCoordinate.longitude + arrivalCoordinate.longitude) / 2;
    const latitudeDelta =
      Math.max(Math.abs(departureCoordinate.latitude - arrivalCoordinate.latitude), 0.05) * 1.6;
    const longitudeDelta =
      Math.max(Math.abs(departureCoordinate.longitude - arrivalCoordinate.longitude), 0.05) * 1.6;

    return {
      latitude: latitudeCenter,
      longitude: longitudeCenter,
      latitudeDelta,
      longitudeDelta,
    };
  }, [arrivalCoordinate, departureCoordinate]);

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
        {/* Carte interactive */}
        {departureCoordinate && arrivalCoordinate && (
          <TouchableOpacity
            style={styles.mapContainer}
            onPress={() => setMapModalVisible(true)}
            activeOpacity={0.95}
          >
            <View style={styles.mapPreview}>
              <MapView
                provider={PROVIDER_GOOGLE}
                style={styles.mapView}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                initialRegion={mapRegion}
              >
                {/* Route polyline */}
                {routeCoordinates && routeCoordinates.length > 0 ? (
                  <Polyline
                    coordinates={routeCoordinates}
                    strokeColor={Colors.primary}
                    strokeWidth={4}
                  />
                ) : (
                  <Polyline
                    coordinates={[departureCoordinate, arrivalCoordinate]}
                    strokeColor={Colors.primary}
                    strokeWidth={4}
                    lineDashPattern={[1, 1]}
                  />
                )}

                <Marker
                  coordinate={departureCoordinate}
                >
                  <View style={styles.markerStartCircle}>
                    <Ionicons name="location" size={18} color={Colors.white} />
                  </View>
                </Marker>

                <Marker
                  coordinate={arrivalCoordinate}
                >
                  <View style={styles.markerEndCircle}>
                    <Ionicons name="navigate" size={18} color={Colors.white} />
                  </View>
                </Marker>

                {/* Destinations des passagers */}
                {bookings
                  ?.filter(
                    (booking) =>
                      booking.status === 'accepted' &&
                      booking.passengerDestinationCoordinates &&
                      booking.passengerDestinationCoordinates.latitude &&
                      booking.passengerDestinationCoordinates.longitude,
                  )
                  .map((booking) => {
                    const destCoords = booking.passengerDestinationCoordinates!;
                    return (
                      <Marker
                        key={`passenger-dest-${booking.id}`}
                        coordinate={{
                          latitude: destCoords.latitude,
                          longitude: destCoords.longitude,
                        }}
                      >
                        <View style={styles.markerPassengerDestCircle}>
                          <Ionicons name="person" size={14} color={Colors.white} />
                        </View>
                      </Marker>
                    );
                  })}
              </MapView>

              <View style={styles.mapOverlay}>
                <Text style={styles.mapOverlayText}>Touchez pour agrandir</Text>
              </View>

              <View style={styles.expandButton}>
                <View style={styles.expandButtonInner}>
                  <Ionicons name="expand" size={20} color={Colors.gray[700]} />
                </View>
              </View>
            </View>
          </TouchableOpacity>
        )}

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
          {trip.status === 'ongoing' && estimatedArrivalTime && (
            <View style={styles.summaryMeta}>
              <Text style={styles.summaryMetaText}>
                Arrivée estimée: {formatTime(estimatedArrivalTime.toISOString())}
              </Text>
            </View>
          )}
          {calculatedArrivalTime && (
            <View style={styles.summaryMeta}>
              <Text style={styles.summaryMetaText}>
                Arrivée prévue: {formatTime(calculatedArrivalTime.toISOString())}
              </Text>
            </View>
          )}
          <View style={styles.summaryMeta}>
            <Text style={styles.summaryMetaText}>
              {trip.availableSeats} places • {trip.price} FC / place
            </Text>
          </View>
          
          {/* Bouton pour démarrer le trajet */}
          {trip.status === 'upcoming' && (
            <TouchableOpacity
              style={[styles.primaryButton, styles.startTripButton, { marginTop: Spacing.lg }]}
              onPress={handleStartTrip}
              disabled={isStartingTrip}
            >
              {isStartingTrip ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="play-circle" size={20} color={Colors.white} />
                  <Text style={styles.primaryButtonText}>Démarrer le trajet</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Bouton pour annuler le trajet (seulement si pas encore démarré) */}
          {trip.status === 'upcoming' && (
            <TouchableOpacity
              style={[styles.secondaryButton, { marginTop: Spacing.md }]}
              onPress={handleCancelTrip}
              disabled={isCancellingTrip}
            >
              {isCancellingTrip ? (
                <ActivityIndicator color={Colors.danger} />
              ) : (
                <Text style={styles.secondaryButtonText}>Annuler le trajet</Text>
              )}
            </TouchableOpacity>
          )}
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
              // Protection contre les statuts manquants ou inattendus
              const bookingStatus = booking.status as BookingStatus;
              const statusConfig = (bookingStatus && BOOKING_STATUS_CONFIG[bookingStatus]) || {
                label: bookingStatus || 'Inconnu',
                color: Colors.gray[600],
                background: 'rgba(156, 163, 175, 0.2)',
              };
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

                  {/* Destination personnalisée si disponible */}
                  {booking.passengerDestination && booking.passengerDestination !== trip.arrival.name && (
                    <View style={styles.passengerDestinationInfo}>
                      <Ionicons name="location" size={14} color={Colors.secondary} />
                      <Text style={styles.passengerDestinationText}>
                        Destination: {booking.passengerDestination}
                      </Text>
                    </View>
                  )}

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

                  {/* Bouton d'appel pour les réservations acceptées */}
                  {booking.status === 'accepted' && booking.passengerPhone && (
                    <View style={styles.bookingActionsRow}>
                      <TouchableOpacity
                        style={[styles.bookingActionButton, styles.bookingActionCall]}
                        onPress={() => {
                          setSelectedPassengerPhone(booking.passengerPhone!);
                          setSelectedPassengerName(booking.passengerName || 'le passager');
                          setContactModalVisible(true);
                        }}
                      >
                        <Ionicons name="call" size={18} color={Colors.success} />
                        <Text style={[styles.bookingActionText, styles.bookingActionCallText]}>
                          Appeler
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Actions pour les réservations acceptées pendant le trajet */}
                  {trip.status === 'ongoing' && booking.status === 'accepted' && (
                    <View style={styles.tripActionsContainer}>
                      {!booking.pickedUp ? (
                        <TouchableOpacity
                          style={[styles.tripActionButton, styles.pickupButton]}
                          onPress={() => handleConfirmPickup(booking.id)}
                          disabled={isConfirmingPickup}
                        >
                          {isConfirmingPickup ? (
                            <ActivityIndicator color={Colors.white} />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                              <Text style={styles.tripActionText}>Confirmer la récupération</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      ) : !booking.droppedOff ? (
                        <TouchableOpacity
                          style={[styles.tripActionButton, styles.dropoffButton]}
                          onPress={() => handleConfirmDropoff(booking.id)}
                          disabled={isConfirmingDropoff}
                        >
                          {isConfirmingDropoff ? (
                            <ActivityIndicator color={Colors.white} />
                          ) : (
                            <>
                              <Ionicons name="location" size={18} color={Colors.white} />
                              <Text style={styles.tripActionText}>Confirmer la dépose</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.completedStatus}>
                          <Ionicons name="checkmark-done-circle" size={18} color={Colors.success} />
                          <Text style={styles.completedStatusText}>Trajet complété pour ce passager</Text>
                        </View>
                      )}
                    </View>
                  )}
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

        {trip.status === 'completed' && (
          <TouchableOpacity
            style={styles.reviewCta}
            onPress={() => router.push(`/rate/${trip.id}`)}
          >
            <Ionicons name="star" size={20} color={Colors.white} />
            <View style={{ marginLeft: Spacing.sm }}>
              <Text style={styles.reviewCtaTitle}>Évaluer mes passagers</Text>
              <Text style={styles.reviewCtaSubtitle}>
                Partagez votre ressenti pour améliorer la communauté.
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </Modal>

      {/* Map Modal */}
      {departureCoordinate && arrivalCoordinate && (
        <Modal visible={mapModalVisible} animationType="fade" transparent onRequestClose={() => setMapModalVisible(false)}>
          <View style={styles.mapModalOverlay}>
            <View style={styles.mapModalContent}>
              <MapView
                provider={PROVIDER_GOOGLE}
                style={styles.fullscreenMap}
                initialRegion={mapRegion}
              >
                {/* Route polyline */}
                {routeCoordinates && routeCoordinates.length > 0 ? (
                  <Polyline
                    coordinates={routeCoordinates}
                    strokeColor={Colors.primary}
                    strokeWidth={5}
                  />
                ) : (
                  <Polyline
                    coordinates={[departureCoordinate, arrivalCoordinate]}
                    strokeColor={Colors.primary}
                    strokeWidth={5}
                  />
                )}

                <Marker
                  coordinate={departureCoordinate}
                >
                  <View style={styles.markerStartCircle}>
                    <Ionicons name="location" size={20} color={Colors.white} />
                  </View>
                  <Callout>
                    <View>
                      <Text style={{ fontWeight: 'bold' }}>Départ</Text>
                      <Text>{trip.departure.address}</Text>
                    </View>
                  </Callout>
                </Marker>

                <Marker
                  coordinate={arrivalCoordinate}
                >
                  <View style={styles.markerEndCircle}>
                    <Ionicons name="navigate" size={20} color={Colors.white} />
                  </View>
                  <Callout>
                    <View>
                      <Text style={{ fontWeight: 'bold' }}>Arrivée</Text>
                      <Text>{trip.arrival.address}</Text>
                    </View>
                  </Callout>
                </Marker>

                {/* Destinations des passagers */}
                {bookings
                  ?.filter(
                    (booking) =>
                      booking.status === 'accepted' &&
                      booking.passengerDestinationCoordinates &&
                      booking.passengerDestinationCoordinates.latitude &&
                      booking.passengerDestinationCoordinates.longitude,
                  )
                  .map((booking) => {
                    const destCoords = booking.passengerDestinationCoordinates!;
                    return (
                      <Marker
                        key={`passenger-dest-fullscreen-${booking.id}`}
                        coordinate={{
                          latitude: destCoords.latitude,
                          longitude: destCoords.longitude,
                        }}
                      >
                        <View style={styles.markerPassengerDestCircle}>
                          <Ionicons name="person" size={16} color={Colors.white} />
                        </View>
                        <Callout>
                          <View>
                            <Text style={{ fontWeight: 'bold' }}>{booking.passengerDestination || booking.passengerName || 'Destination passager'}</Text>
                            <Text>{booking.passengerName || 'Passager'}</Text>
                          </View>
                        </Callout>
                      </Marker>
                    );
                  })}
              </MapView>

              <TouchableOpacity style={styles.closeMapButton} onPress={() => setMapModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

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
          <Animated.View entering={FadeInDown} style={styles.contactModalCard} onStartShouldSetResponder={() => true}>
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
  reviewCta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...CommonStyles.shadowSm,
    width: '100%',
  },
  reviewCtaTitle: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  reviewCtaSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: FontSizes.sm,
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
  startTripButton: {
    backgroundColor: Colors.success,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.danger,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  secondaryButtonText: {
    color: Colors.danger,
    fontWeight: FontWeights.bold,
  },
  passengerDestinationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.secondary + '15',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  passengerDestinationText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    flex: 1,
  },
  tripActionsContainer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  tripActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
    width: '100%',
  },
  pickupButton: {
    backgroundColor: Colors.success,
  },
  dropoffButton: {
    backgroundColor: Colors.primary,
  },
  tripActionText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
  },
  completedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  completedStatusText: {
    color: Colors.success,
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.sm,
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
  mapContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  mapPreview: {
    height: 220,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.gray[200],
    ...CommonStyles.shadowSm,
  },
  mapView: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  mapOverlayText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  expandButton: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
  },
  expandButtonInner: {
    width: 40,
    height: 40,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowLg,
  },
  markerStartCircle: {
    width: 32,
    height: 32,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerEndCircle: {
    width: 32,
    height: 32,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerPassengerDestCircle: {
    width: 28,
    height: 28,
    backgroundColor: Colors.secondary,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowMd,
  },
  mapModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: Spacing.md,
    justifyContent: 'center',
  },
  mapModalContent: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  fullscreenMap: {
    width: '100%',
    height: '100%',
  },
  closeMapButton: {
    position: 'absolute',
    top: Spacing.xl,
    right: Spacing.xl,
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  bookingActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
    flex: 1,
  },
  bookingActionCall: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(46, 204, 113, 0.3)',
  },
  bookingActionText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  bookingActionCallText: {
    color: Colors.success,
  },
  contactModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  contactModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
  },
  contactModalHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  contactModalIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(46, 204, 113, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  contactModalIconBadge: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  contactModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  contactModalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    textAlign: 'center',
  },
  contactModalActions: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  contactModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
  },
  contactModalButtonCall: {
    borderColor: 'rgba(46, 204, 113, 0.3)',
    backgroundColor: 'rgba(46, 204, 113, 0.05)',
  },
  contactModalButtonWhatsApp: {
    borderColor: 'rgba(37, 211, 102, 0.3)',
    backgroundColor: 'rgba(37, 211, 102, 0.05)',
  },
  contactModalButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  contactModalButtonContent: {
    flex: 1,
  },
  contactModalButtonTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 2,
  },
  contactModalButtonSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  contactModalCancelButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
  },
  contactModalCancelText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
});

