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
import { calculateDistance, getRouteInfo, type RouteInfo } from '@/utils/routeHelpers';
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
      >
        {/* Visualisation Carte */}
        <TouchableOpacity
          style={styles.mapCard}
          onPress={() => setMapModalVisible(true)}
          activeOpacity={0.9}
        >
          <View style={styles.mapPreview}>
            <MapView
              provider={PROVIDER_GOOGLE}
              style={styles.mapView}
              initialRegion={mapRegion}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
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
                  coordinates={[departureCoordinate!, arrivalCoordinate!]}
                  strokeColor={Colors.primary}
                  strokeWidth={4}
                  lineDashPattern={[5, 5]}
                />
              )}

              <Marker coordinate={departureCoordinate!}>
                <View style={[styles.markerStartCircle, { width: 24, height: 24, borderRadius: 12 }]}>
                  <Ionicons name="location" size={14} color={Colors.white} />
                </View>
              </Marker>

              <Marker coordinate={arrivalCoordinate!}>
                <View style={[styles.markerEndCircle, { width: 24, height: 24, borderRadius: 12 }]}>
                  <Ionicons name="navigate" size={14} color={Colors.white} />
                </View>
              </Marker>

              {/* Position actuelle du conducteur si en cours */}
              {trip.status === 'ongoing' && trip.currentLocation?.coordinates && (
                <Marker
                  coordinate={{
                    latitude: trip.currentLocation.coordinates[1],
                    longitude: trip.currentLocation.coordinates[0],
                  }}
                >
                  <View style={[styles.markerStartCircle, { backgroundColor: Colors.info, width: 20, height: 20, borderRadius: 10 }]}>
                    <Ionicons name="car-sport" size={12} color={Colors.white} />
                  </View>
                </Marker>
              )}
            </MapView>

            <View style={styles.mapBadge}>
              <Ionicons name="expand" size={12} color={Colors.white} />
              <Text style={styles.mapBadgeText}>Agrandir</Text>
            </View>
          </View>
        </TouchableOpacity>

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
                <Text style={styles.statValue}>{trip.price} FCFA</Text>
              </View>
            </View>
          </View>

          {trip.status === 'ongoing' && estimatedArrivalTime && (
            <View style={styles.etaContainer}>
              <Ionicons name="navigate" size={18} color={Colors.secondary} />
              <Text style={styles.etaText}>
                Arrivée estimée : <Text style={styles.etaHighlight}>{formatTime(estimatedArrivalTime.toISOString())}</Text>
              </Text>
            </View>
          )}
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
            <TouchableOpacity 
              style={styles.actionIconButton}
              onPress={() => setMapModalVisible(true)}
            >
              <Ionicons name="map" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {bookings && bookings.length > 0 ? (
            bookings.map((booking) => (
              <View key={booking.id} style={styles.bookingCard}>
                <View style={styles.bookingHeader}>
                  <View style={styles.avatar}>
                    <Text style={{ color: Colors.white, fontWeight: 'bold' }}>
                      {(booking.passengerName || 'P').charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.bookingInfo}>
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
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: BOOKING_STATUS_CONFIG[booking.status].background }]}>
                    <Text style={[styles.statusBadgeText, { color: BOOKING_STATUS_CONFIG[booking.status].color }]}>
                      {BOOKING_STATUS_CONFIG[booking.status].label}
                    </Text>
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

                    {/* Bouton d'évaluation pour les passagers déposés (même si le trajet est encore en cours) */}
                    {booking.droppedOff && booking.droppedOffConfirmedByPassenger && (
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: Colors.secondary, flex: 1 }]}
                        onPress={() => router.push(`/rate/${trip.id}?passengerId=${booking.passengerId}`)}
                      >
                        <Ionicons name="star" size={18} color={Colors.white} />
                        <Text style={[styles.actionText, { color: Colors.white }]}>Évaluer ce passager</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Bouton d'évaluation pour les trajets complétés (si le passager n'a pas encore été évalué) */}
                {trip.status === 'completed' && booking.status === 'accepted' && (!booking.droppedOff || !booking.droppedOffConfirmedByPassenger) && (
                  <View style={styles.bookingFooter}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: Colors.secondary, flex: 1 }]}
                      onPress={() => router.push(`/rate/${trip.id}?passengerId=${booking.passengerId}`)}
                    >
                      <Ionicons name="star" size={18} color={Colors.white} />
                      <Text style={[styles.actionText, { color: Colors.white }]}>Évaluer ce passager</Text>
                    </TouchableOpacity>
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
      <View style={styles.stickyFooter}>
        {trip.status === 'upcoming' && (
          <>
            <TouchableOpacity
              style={[styles.primaryButton, styles.startTripButton]}
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

                {/* Localisations des passagers non récupérés (trajet lancé) */}
                {trip.status === 'ongoing' &&
                  bookings
                    ?.filter(
                      (booking) =>
                        booking.status === 'accepted' &&
                        !booking.pickedUp &&
                        (booking as any).passengerCurrentLocation &&
                        (booking as any).passengerCurrentLocation.latitude &&
                        (booking as any).passengerCurrentLocation.longitude,
                    )
                    .map((booking) => {
                      const currentLoc = (booking as any).passengerCurrentLocation;
                      return (
                        <Marker
                          key={`passenger-location-fullscreen-${booking.id}`}
                          coordinate={{
                            latitude: currentLoc.latitude,
                            longitude: currentLoc.longitude,
                          }}
                        >
                          <Callout>
                            <View style={styles.passengerLocationCallout}>
                              <Text style={styles.passengerLocationCalloutName}>
                                {booking.passengerName || 'Passager'}
                              </Text>
                              <Text style={styles.passengerLocationCalloutText}>
                                En attente de récupération
                              </Text>
                            </View>
                          </Callout>
                          <View style={styles.markerPassengerLocationCircle}>
                            <Ionicons name="person-circle" size={20} color={Colors.secondary} />
                          </View>
                        </Marker>
                      );
                    })}

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
  mapCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  mapPreview: {
    height: 180,
    width: '100%',
  },
  mapView: {
    flex: 1,
  },
  mapBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  mapBadgeText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
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
  etaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.secondary + '10',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  etaText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  etaHighlight: {
    fontWeight: FontWeights.bold,
    color: Colors.secondary,
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
    marginBottom: 40,
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
    paddingBottom: 40, // Safe area
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
    paddingBottom: 40,
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
  mapModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  mapModalContent: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  fullscreenMap: {
    flex: 1,
  },
  closeMapButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerStartCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
    ...CommonStyles.shadowMd,
  },
  markerEndCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
    ...CommonStyles.shadowMd,
  },
  markerPassengerLocationCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.secondary,
    ...CommonStyles.shadowSm,
  },
  markerPassengerDestCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    ...CommonStyles.shadowSm,
  },
  passengerLocationCallout: {
    padding: Spacing.sm,
    width: 150,
  },
  passengerLocationCalloutName: {
    fontWeight: 'bold',
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
  },
  passengerLocationCalloutText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    marginTop: 2,
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
    paddingBottom: 40,
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
