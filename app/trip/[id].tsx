import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useCancelBookingMutation,
  useCreateBookingMutation,
  useGetMyBookingsQuery,
} from '@/store/api/bookingApi';
import { useCreateConversationMutation } from '@/store/api/messageApi';
import { useAppSelector } from '@/store/hooks';
import { selectTripById, selectUser } from '@/store/selectors';
import type { BookingStatus } from '@/types';
import { formatTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
import MapView, { Marker, Polyline } from 'react-native-maps';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const BOOKING_STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; color: string; background: string }
> = {
  pending: {
    label: 'En attente',
    color: Colors.secondary,
    background: 'rgba(247, 184, 1, 0.2)',
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

export default function TripDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const tripId = typeof id === 'string' ? (id as string) : '';
  const trip = useAppSelector((state) => selectTripById(tripId)(state));
  const user = useAppSelector(selectUser);
  const {
    data: myBookings,
    isLoading: myBookingsLoading,
    isFetching: myBookingsFetching,
    refetch: refetchMyBookings,
  } = useGetMyBookingsQuery();
  const [createBooking, { isLoading: isBooking }] = useCreateBookingMutation();
  const [cancelBookingMutation, { isLoading: isCancellingBooking }] = useCancelBookingMutation();
  const [createConversation, { isLoading: isCreatingConversation }] = useCreateConversationMutation();
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [bookingSeats, setBookingSeats] = useState('1');
  const [bookingModalError, setBookingModalError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState<{ visible: boolean; seats: number }>({
    visible: false,
    seats: 0,
  });
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const refreshBookingLists = () => {
    refetchMyBookings();
  };
  
  const pulseAnim = useSharedValue(1);

  console.log('trip', trip);

  useEffect(() => {
    if (trip?.status === 'ongoing') {
      pulseAnim.value = withRepeat(
        withTiming(1.2, { duration: 1000 }),
        -1,
        true
      );
    }
  }, [trip?.status]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const activeBooking = useMemo(() => {
    if (!trip || !myBookings) {
      return null;
    }
    return (
      myBookings.find(
        (booking) =>
          booking.tripId === trip.id &&
          (booking.status === 'pending' || booking.status === 'accepted'),
      ) ?? null
    );
  }, [myBookings, trip]);

  const availableSeats = trip ? Math.max(trip.availableSeats, 0) : 0;
  const seatLimit = Math.max(availableSeats, 1);

  if (!trip) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateIcon}>
            <Ionicons name="car-sport" size={32} color={Colors.primary} />
          </View>
          <Text style={styles.emptyStateTitle}>Trajet introuvable</Text>
          <Text style={styles.emptyStateText}>
            Ce trajet n’existe plus ou a été supprimé par son propriétaire.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={16} color={Colors.white} />
            <Text style={styles.primaryButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const progress = trip.progress || 0;
  const activeBookingStatus = activeBooking ? BOOKING_STATUS_CONFIG[activeBooking.status] : null;
  const openBookingModal = () => {
    setBookingSeats('1');
    setBookingModalError('');
    setBookingModalVisible(true);
  };

  const closeBookingModal = () => {
    if (isBooking) {
      return;
    }
    setBookingModalVisible(false);
  };

  const openBookingSuccessModal = (seats: number) => {
    setBookingSuccess({ visible: true, seats });
  };

  const closeBookingSuccessModal = () => {
    if (isBooking) {
      return;
    }
    setBookingSuccess({ visible: false, seats: 0 });
  };

  const handleViewBookings = () => {
    closeBookingSuccessModal();
    router.push('/bookings');
  };

  const handleContactDriver = async () => {
    if (!trip || !user || trip.driverId === user.id) {
      return;
    }

    try {
      const payload: {
        participantIds: string[];
        bookingId?: string;
      } = {
        participantIds: [trip.driverId],
      };

      if (activeBooking?.id) {
        payload.bookingId = activeBooking.id;
      }

      const conversation = await createConversation(payload).unwrap();
      router.push({
        pathname: `/chat/${conversation.id}`,
        params: {
          title: trip.driverName,
        },
      });
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        "Impossible d'ouvrir la conversation pour le moment.";
      Alert.alert('Erreur', Array.isArray(message) ? message.join('\n') : message);
    }
  };

  const adjustBookingSeats = (delta: number) => {
    setBookingSeats((prev) => {
      const current = parseInt(prev, 10);
      const fallback = Number.isNaN(current) ? 1 : current;
      const next = Math.min(Math.max(fallback + delta, 1), seatLimit);
      return String(next);
    });
  };

  const handleConfirmBooking = async () => {
    if (isBooking || !trip) {
      return;
    }
    const seatsValue = parseInt(bookingSeats, 10);
    if (Number.isNaN(seatsValue) || seatsValue <= 0) {
      setBookingModalError('Veuillez indiquer un nombre de places valide.');
      return;
    }
    if (seatsValue > seatLimit) {
      setBookingModalError(
        `Il reste seulement ${seatLimit} place${seatLimit > 1 ? 's' : ''} pour ce trajet.`,
      );
      return;
    }
    try {
      await createBooking({ tripId: trip.id, numberOfSeats: seatsValue }).unwrap();
      setBookingModalVisible(false);
      setBookingModalError('');
      openBookingSuccessModal(seatsValue);
      refreshBookingLists();
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible de créer la réservation pour le moment.';
      setBookingModalError(Array.isArray(message) ? message.join('\n') : message);
    }
  };

  const handleCancelBooking = async () => {
    if (!activeBooking) {
      return;
    }
    try {
      await cancelBookingMutation(activeBooking.id).unwrap();
      Alert.alert('Réservation annulée', 'Votre réservation a été annulée.');
       refreshBookingLists();
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible d’annuler la réservation pour le moment.';
      Alert.alert('Erreur', Array.isArray(message) ? message.join('\n') : message);
    }
  };

  const confirmCancelBooking = () => {
    if (!activeBooking) {
      return;
    }
    Alert.alert(
      'Annuler la réservation',
      'Souhaitez-vous vraiment annuler cette réservation ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: () => handleCancelBooking(),
        },
      ],
    );
  };

  const estimatedTotal = useMemo(() => {
    const seatsValue = parseInt(bookingSeats, 10);
    if (Number.isNaN(seatsValue) || seatsValue <= 0) {
      return 0;
    }
    return seatsValue * trip.price;
  }, [bookingSeats, trip.price]);

  const statusConfig = {
    upcoming: { color: Colors.secondary, bgColor: 'rgba(247, 184, 1, 0.1)', label: 'À venir' },
    ongoing: { color: Colors.info, bgColor: 'rgba(52, 152, 219, 0.1)', label: 'En cours' },
    completed: { color: Colors.success, bgColor: 'rgba(46, 204, 113, 0.1)', label: 'Terminé' },
    cancelled: { color: Colors.gray[600], bgColor: Colors.gray[200], label: 'Annulé' },
  };

  const config = statusConfig[trip.status];
  const departureCoordinate = useMemo(
    () => ({
      latitude: trip.departure.lat,
      longitude: trip.departure.lng,
    }),
    [trip.departure.lat, trip.departure.lng],
  );

  const arrivalCoordinate = useMemo(
    () => ({
      latitude: trip.arrival.lat,
      longitude: trip.arrival.lng,
    }),
    [trip.arrival.lat, trip.arrival.lng],
  );

  const mapRegion = useMemo(() => {
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

  const currentCoordinate = useMemo(() => {
    if (trip.status !== 'ongoing' || typeof progress !== 'number') {
      return null;
    }
    const ratio = Math.min(Math.max(progress, 0), 100) / 100;
    return {
      latitude: departureCoordinate.latitude + (arrivalCoordinate.latitude - departureCoordinate.latitude) * ratio,
      longitude:
        departureCoordinate.longitude + (arrivalCoordinate.longitude - departureCoordinate.longitude) * ratio,
    };
  }, [arrivalCoordinate, departureCoordinate, progress, trip.status]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails du trajet</Text>
          <TouchableOpacity>
            <Ionicons name="ellipsis-vertical" size={24} color={Colors.gray[600]} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Carte interactive */}
        <TouchableOpacity
          style={styles.mapContainer}
          onPress={() => setMapModalVisible(true)}
          activeOpacity={0.95}
        >
          <View style={styles.mapPreview}>
            <MapView
              style={styles.mapView}
              initialRegion={mapRegion}
              pointerEvents="none"
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <Polyline
                coordinates={[departureCoordinate, arrivalCoordinate]}
                strokeColor={Colors.primary}
                strokeWidth={4}
                lineCap="round"
                lineDashPattern={[1]}
              />

              <Marker coordinate={departureCoordinate} title="Départ" description={trip.departure.name}>
                <View style={styles.markerStartCircle}>
                  <Ionicons name="location" size={18} color={Colors.white} />
                </View>
              </Marker>

              <Marker coordinate={arrivalCoordinate} title="Arrivée" description={trip.arrival.name}>
                <View style={styles.markerEndCircle}>
                  <Ionicons name="navigate" size={18} color={Colors.white} />
                </View>
              </Marker>

              {currentCoordinate && (
                <Marker coordinate={currentCoordinate} title="Position actuelle">
                  <Animated.View style={pulseStyle}>
                    <View style={styles.markerCurrentCircle}>
                      <Ionicons name="car-sport" size={18} color={Colors.white} />
                    </View>
                  </Animated.View>
                </Marker>
              )}
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

        <Modal visible={mapModalVisible} animationType="fade" transparent onRequestClose={() => setMapModalVisible(false)}>
          <View style={styles.mapModalOverlay}>
            <View style={styles.mapModalContent}>
              <MapView style={styles.fullscreenMap} initialRegion={mapRegion}>
                <Polyline
                  coordinates={[departureCoordinate, arrivalCoordinate]}
                  strokeColor={Colors.primary}
                  strokeWidth={5}
                  lineCap="round"
                />

                <Marker coordinate={departureCoordinate} title="Départ" description={trip.departure.address}>
                  <View style={styles.markerStartCircle}>
                    <Ionicons name="location" size={20} color={Colors.white} />
                  </View>
                </Marker>

                <Marker coordinate={arrivalCoordinate} title="Arrivée" description={trip.arrival.address}>
                  <View style={styles.markerEndCircle}>
                    <Ionicons name="navigate" size={20} color={Colors.white} />
                  </View>
                </Marker>

                {currentCoordinate && (
                  <Marker coordinate={currentCoordinate} title="Position actuelle">
                    <Animated.View style={pulseStyle}>
                      <View style={styles.markerCurrentCircle}>
                        <Ionicons name="car-sport" size={20} color={Colors.white} />
                      </View>
                    </Animated.View>
                  </Marker>
                )}
              </MapView>

              <TouchableOpacity style={styles.closeMapButton} onPress={() => setMapModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Statut du trajet */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusCard, { backgroundColor: config.bgColor }]}>
            <View style={styles.statusHeader}>
              <View style={styles.statusHeaderLeft}>
                <View style={[styles.statusDot, { backgroundColor: config.color }]} />
                <Text style={styles.statusLabel}>{config.label}</Text>
              </View>
              {trip.status === 'ongoing' && (
                <Text style={styles.progressText}>{progress}% complété</Text>
              )}
            </View>

            {trip.status === 'ongoing' && (
              <>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <Text style={styles.etaText}>
                  Arrivée estimée: {formatTime(trip.arrivalTime)}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Itinéraire */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>ITINÉRAIRE</Text>
            
            <View style={styles.routeContainer}>
              <View style={styles.routeIconContainer}>
                <View style={styles.routeIconStart}>
                  <Ionicons name="location" size={16} color={Colors.success} />
                </View>
                <View style={styles.routeDivider} />
              </View>
              <View style={styles.routeContent}>
                <Text style={styles.routeName}>{trip.departure.name}</Text>
                <Text style={styles.routeAddress}>{trip.departure.address}</Text>
                <Text style={styles.routeTime}>
                  Départ: {formatTime(trip.departureTime)}
                </Text>
              </View>
            </View>

            <View style={styles.routeContainer}>
              <View style={styles.routeIconContainer}>
                <View style={styles.routeIconEnd}>
                  <Ionicons name="navigate" size={16} color={Colors.primary} />
                </View>
              </View>
              <View style={styles.routeContent}>
                <Text style={styles.routeName}>{trip.arrival.name}</Text>
                <Text style={styles.routeAddress}>{trip.arrival.address}</Text>
                <Text style={styles.routeTime}>
                  Arrivée: {formatTime(trip.arrivalTime)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Informations du conducteur */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>CONDUCTEUR</Text>
            
            <View style={styles.driverInfo}>
              <View style={styles.driverAvatar} />
              <View style={styles.driverDetails}>
                <Text style={styles.driverName}>{trip.driverName}</Text>
                <View style={styles.driverMeta}>
                  <Ionicons name="star" size={16} color={Colors.secondary} />
                  <Text style={styles.driverRating}>{trip.driverRating}</Text>
                  <View style={styles.driverDot} />
                  <Text style={styles.driverVehicle}>{trip.vehicleInfo}</Text>
                </View>
              </View>
            </View>

            <View style={styles.driverActions}>
              <TouchableOpacity
                style={styles.driverActionButton}
                onPress={handleContactDriver}
                disabled={isCreatingConversation}
              >
                {isCreatingConversation ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <>
                    <Ionicons name="chatbubble" size={20} color={Colors.primary} />
                    <Text style={styles.driverActionText}>Message</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.driverActionButton, styles.driverActionButtonGreen]}>
                <Ionicons name="call" size={20} color={Colors.success} />
                <Text style={[styles.driverActionText, { color: Colors.success }]}>Appeler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Détails */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>DÉTAILS</Text>
            
            <View style={styles.detailsList}>
              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="people" size={20} color={Colors.gray[600]} />
                  <Text style={styles.detailLabel}>Places disponibles</Text>
                </View>
                <Text style={styles.detailValue}>
                  {trip.availableSeats}/{trip.totalSeats}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="cash" size={20} color={Colors.gray[600]} />
                  <Text style={styles.detailLabel}>Prix</Text>
                </View>
                <Text style={[styles.detailValue, { color: Colors.success }]}>
                  {trip.price} FC
                </Text>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="car" size={20} color={Colors.gray[600]} />
                  <Text style={styles.detailLabel}>Véhicule</Text>
                </View>
                <Text style={styles.detailValue}>{trip.vehicleInfo}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Actions */}
        {trip.status === 'upcoming' && (
          <View style={styles.actionsContainer}>
            {activeBooking && activeBookingStatus ? (
              <View style={styles.bookingCard}>
                <View style={styles.bookingCardHeader}>
                  <View>
                    <Text style={styles.bookingCardTitle}>Ma réservation</Text>
                    <Text style={styles.bookingCardSubtitle}>
                      {activeBooking.numberOfSeats} place{activeBooking.numberOfSeats > 1 ? 's' : ''}{' '}
                      • {trip.price} FC / place
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.bookingStatusBadge,
                      { backgroundColor: activeBookingStatus.background },
                    ]}
                  >
                    <Text style={[styles.bookingStatusText, { color: activeBookingStatus.color }]}>
                      {activeBookingStatus.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.bookingCardInfo}>
                  <View style={styles.bookingInfoItem}>
                    <Text style={styles.bookingInfoLabel}>Montant estimé</Text>
                    <Text style={styles.bookingInfoValue}>
                      {activeBooking.numberOfSeats * trip.price} FC
                    </Text>
                  </View>
                  <View style={styles.bookingInfoItem}>
                    <Text style={styles.bookingInfoLabel}>Statut</Text>
                    <Text style={styles.bookingInfoValue}>{activeBookingStatus.label}</Text>
                  </View>
                </View>

                <View style={styles.bookingActionsRow}>
            <TouchableOpacity
                    style={[styles.bookingActionButton, styles.bookingActionDanger]}
                    onPress={confirmCancelBooking}
                    disabled={isCancellingBooking}
                  >
                    {isCancellingBooking ? (
                      <ActivityIndicator size="small" color={Colors.danger} />
                    ) : (
                      <>
                        <Ionicons name="close-circle" size={18} color={Colors.danger} />
                        <Text style={[styles.bookingActionText, styles.bookingActionDangerText]}>
                          Annuler la réservation
                        </Text>
                      </>
                    )}
            </TouchableOpacity>
                </View>

                {myBookingsFetching && (
                  <View style={styles.bookingRefreshingRow}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.bookingRefreshingText}>Actualisation…</Text>
                  </View>
                )}
              </View>
            ) : (
              <>
                <View style={styles.bookingHintCard}>
                  <View style={styles.bookingHintIcon}>
                    <Ionicons name="information-circle" size={20} color={Colors.primary} />
                  </View>
                <View style={styles.bookingHintContent}>
                  <Text style={styles.bookingHintTitle}>
                    {availableSeats > 0
                      ? `Il reste ${availableSeats} place${availableSeats > 1 ? 's' : ''} disponibles`
                      : 'Ce trajet est complet'}
                  </Text>
                  <Text style={styles.bookingHintSubtitle}>
                    Prix par place : {trip.price} FC
                  </Text>
                </View>
                </View>
            <TouchableOpacity
                  style={[
                    styles.actionButton,
                    (availableSeats <= 0 || myBookingsLoading) && styles.actionButtonDisabled,
                  ]}
                  onPress={openBookingModal}
                  disabled={availableSeats <= 0 || myBookingsLoading}
            >
                  {myBookingsLoading ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.actionButtonText}>Réserver ce trajet</Text>
                  )}
            </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {trip.status === 'completed' && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/rate/${trip.id}`)}
            >
              <Text style={styles.actionButtonText}>Évaluer le trajet</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal animationType="fade" transparent visible={bookingModalVisible}>
        <View style={styles.bookingModalOverlay}>
          <View style={styles.bookingModalCard}>
            <Text style={styles.bookingModalTitle}>Réserver ce trajet</Text>
            <Text style={styles.bookingModalDescription}>
              Choisissez le nombre de places à réserver.
            </Text>

            <View style={styles.bookingSeatRow}>
              <TouchableOpacity
                style={styles.bookingSeatButton}
                onPress={() => adjustBookingSeats(-1)}
                disabled={isBooking}
              >
                <Ionicons name="remove" size={18} color={Colors.primary} />
              </TouchableOpacity>
              <TextInput
                style={styles.bookingSeatInput}
                keyboardType="numeric"
                placeholder="1"
                placeholderTextColor={Colors.gray[400]}
                value={bookingSeats}
                onChangeText={(value) => setBookingSeats(value.replace(/[^0-9]/g, ''))}
                editable={!isBooking}
              />
              <TouchableOpacity
                style={styles.bookingSeatButton}
                onPress={() => adjustBookingSeats(1)}
                disabled={isBooking}
              >
                <Ionicons name="add" size={18} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.bookingModalHint}>
              Maximum {seatLimit} place{seatLimit > 1 ? 's' : ''} disponibles
            </Text>
            <Text style={styles.bookingModalPrice}>
              Total estimé :{' '}
              <Text style={styles.bookingModalPriceValue}>{estimatedTotal} FC</Text>
            </Text>

            {bookingModalError ? (
              <Text style={styles.bookingModalError}>{bookingModalError}</Text>
            ) : null}

            <View style={styles.bookingModalActions}>
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonSecondary]}
                onPress={closeBookingModal}
                disabled={isBooking}
              >
                <Text style={styles.bookingModalButtonSecondaryText}>Fermer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonPrimary]}
                onPress={handleConfirmBooking}
                disabled={isBooking}
              >
                {isBooking ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.bookingModalButtonPrimaryText}>Confirmer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={bookingSuccess.visible}>
        <View style={styles.feedbackModalOverlay}>
          <View style={styles.feedbackModalCard}>
            <View style={styles.feedbackModalIcon}>
              <Ionicons name="checkmark-circle" size={32} color={Colors.white} />
            </View>
            <Text style={styles.feedbackModalTitle}>Demande envoyée</Text>
            <Text style={styles.feedbackModalText}>
              Votre réservation de {bookingSuccess.seats} place
              {bookingSuccess.seats > 1 ? 's' : ''} est en attente de confirmation du conducteur.
            </Text>
            <View style={styles.feedbackModalActions}>
              <TouchableOpacity
                style={[
                  styles.feedbackModalButton,
                  styles.feedbackModalSecondary,
                  styles.feedbackModalButtonSpacing,
                ]}
                onPress={closeBookingSuccessModal}
              >
                <Text style={styles.feedbackModalSecondaryText}>Fermer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.feedbackModalButton, styles.feedbackModalPrimary]}
                onPress={handleViewBookings}
              >
                <Text style={styles.feedbackModalPrimaryText}>Mes réservations</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyStateIcon: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyStateTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
  },
  emptyStateText: {
    color: Colors.gray[600],
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loaderText: {
    marginTop: Spacing.sm,
    color: Colors.gray[600],
  },
  emptyText: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xxl,
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
  markerCurrentCircle: {
    width: 40,
    height: 40,
    backgroundColor: Colors.info,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowLg,
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
  statusContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  statusCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  statusHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  statusLabel: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
  progressText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.info,
  },
  etaText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  section: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  sectionTitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
    marginBottom: Spacing.md,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  routeIconContainer: {
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  routeIconStart: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(46, 204, 113, 0.2)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeIconEnd: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeDivider: {
    width: 2,
    height: 48,
    backgroundColor: Colors.gray[300],
  },
  routeContent: {
    flex: 1,
  },
  routeName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.xs,
    fontSize: FontSizes.base,
  },
  routeAddress: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  routeTime: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginTop: Spacing.xs,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  driverAvatar: {
    width: 64,
    height: 64,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.lg,
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.lg,
    marginBottom: Spacing.xs,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
    marginLeft: Spacing.xs,
    fontSize: FontSizes.base,
  },
  driverDot: {
    width: 4,
    height: 4,
    backgroundColor: Colors.gray[400],
    borderRadius: BorderRadius.full,
    marginHorizontal: Spacing.sm,
  },
  driverVehicle: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  driverActions: {
    flexDirection: 'row',
  },
  driverActionButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  driverActionButtonGreen: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    marginRight: 0,
  },
  driverActionText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.base,
  },
  detailsList: {
    marginTop: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailLabel: {
    color: Colors.gray[700],
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
  },
  detailValue: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
  actionsContainer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  actionButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: Colors.danger,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  bookingCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  bookingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  bookingCardTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingCardSubtitle: {
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
  bookingStatusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  bookingStatusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
  },
  bookingCardInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  bookingInfoItem: {
    flex: 1,
  },
  bookingInfoLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  bookingInfoValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingActionsRow: {
    flexDirection: 'row',
  },
  bookingActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  bookingActionText: {
    marginLeft: Spacing.sm,
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  bookingActionDanger: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  bookingActionDangerText: {
    color: Colors.danger,
  },
  bookingRefreshingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  bookingRefreshingText: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginLeft: Spacing.sm,
  },
  bookingHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  bookingHintIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  bookingHintContent: {
    flex: 1,
  },
  bookingHintTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingHintSubtitle: {
    marginTop: Spacing.xs,
    color: Colors.gray[600],
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
    marginBottom: Spacing.xs,
  },
  bookingModalDescription: {
    color: Colors.gray[600],
    marginBottom: Spacing.lg,
  },
  bookingSeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  bookingSeatButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingSeatInput: {
    flex: 1,
    marginHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    textAlign: 'center',
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingModalHint: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginBottom: Spacing.xs,
  },
  bookingModalPrice: {
    fontSize: FontSizes.base,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  bookingModalPriceValue: {
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  bookingModalError: {
    color: Colors.danger,
    marginBottom: Spacing.sm,
  },
  bookingModalActions: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
  bookingModalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  bookingModalButtonSecondary: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  bookingModalButtonSecondaryText: {
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  bookingModalButtonPrimary: {
    backgroundColor: Colors.primary,
    marginRight: 0,
  },
  bookingModalButtonPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  driverManageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  driverManageSubtitle: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginTop: Spacing.xs,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverBookingLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  driverBookingLoaderText: {
    marginLeft: Spacing.sm,
    color: Colors.gray[500],
  },
  driverBookingEmpty: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  driverBookingEmptyTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginTop: Spacing.sm,
  },
  driverBookingEmptyText: {
    textAlign: 'center',
    color: Colors.gray[500],
    marginTop: Spacing.xs,
  },
  driverBookingCard: {
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  driverBookingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  driverBookingAvatar: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  driverBookingInfo: {
    flex: 1,
  },
  driverBookingName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  driverBookingMeta: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  reasonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.07)',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  reasonText: {
    flex: 1,
    color: Colors.danger,
    fontSize: FontSizes.sm,
    marginLeft: Spacing.xs,
  },
  driverBookingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  driverDecisionRow: {
    flexDirection: 'row',
  },
  driverDecisionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  driverDecisionButtonSpacing: {
    marginRight: Spacing.sm,
  },
  driverDecisionAccept: {
    backgroundColor: Colors.primary,
  },
  driverDecisionReject: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  driverDecisionText: {
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  driverDecisionGhost: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverDecisionGhostText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    marginLeft: Spacing.xs,
  },
  feedbackModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  feedbackModalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    ...CommonStyles.shadowLg,
  },
  feedbackModalIcon: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  feedbackModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  feedbackModalText: {
    textAlign: 'center',
    color: Colors.gray[600],
    marginBottom: Spacing.lg,
  },
  feedbackModalActions: {
    flexDirection: 'row',
    width: '100%',
  },
  feedbackModalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  feedbackModalButtonSpacing: {
    marginRight: Spacing.sm,
  },
  feedbackModalSecondary: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  feedbackModalPrimary: {
    backgroundColor: Colors.primary,
  },
  feedbackModalSecondaryText: {
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  feedbackModalPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
});
