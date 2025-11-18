import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import {
  useCancelBookingMutation,
  useCreateBookingMutation,
  useGetMyBookingsQuery,
} from '@/store/api/bookingApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectTripById, selectUser } from '@/store/selectors';
import { updateTrip } from '@/store/slices/tripsSlice';
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
  const dispatch = useAppDispatch();
  const { checkIdentity } = useIdentityCheck();
  const trip = useAppSelector(state => selectTripById(id as string)(state));
  const user = useAppSelector(selectUser);
  const {
    data: myBookings,
    isLoading: myBookingsLoading,
    isFetching: myBookingsFetching,
    refetch: refetchMyBookings,
  } = useGetMyBookingsQuery();
  const [createBooking, { isLoading: isBooking }] = useCreateBookingMutation();
  const [cancelBookingMutation, { isLoading: isCancellingBooking }] = useCancelBookingMutation();
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [bookingSeats, setBookingSeats] = useState('1');
  const [bookingModalError, setBookingModalError] = useState('');
  const [expanded, setExpanded] = useState(false);
  
  const pulseAnim = useSharedValue(1);

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

  const isOwner = trip ? user?.id === trip.driverId : false;
  const availableSeats = trip ? Math.max(trip.availableSeats, 0) : 0;
  const seatLimit = Math.max(availableSeats, 1);

  if (!trip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Trajet non trouvé</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleCancelTrip = () => {
    Alert.alert(
      'Annuler le trajet',
      'Êtes-vous sûr de vouloir annuler ce trajet ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: () => {
            dispatch(updateTrip({ id: trip.id, updates: { status: 'cancelled' } }));
            Alert.alert('Trajet annulé', 'Le trajet a été annulé avec succès.', [
              { text: 'OK', onPress: () => router.back() }
            ]);
          },
        },
      ]
    );
  };

  const progress = trip.progress || 0;
  const activeBookingStatus = activeBooking ? BOOKING_STATUS_CONFIG[activeBooking.status] : null;
  const openBookingModal = () => {
    // if (!checkIdentity('book')) {
    //   return;
    // }
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
      Alert.alert(
        'Demande envoyée',
        'Votre réservation est en attente de confirmation du conducteur.',
      );
      refetchMyBookings();
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
      refetchMyBookings();
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
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.9}
        >
          <View style={[styles.map, expanded && styles.mapExpanded]}>
            {/* Carte simulée */}
            <View style={styles.mapContent}>
              {/* Grille de fond */}
              <View style={styles.mapGrid}>
                {[...Array(10)].map((_, i) => (
                  <View
                    key={`v-${i}`}
                    style={[styles.gridLine, { left: `${i * 10}%`, width: 1, height: '100%' }]}
                  />
                ))}
                {[...Array(10)].map((_, i) => (
                  <View
                    key={`h-${i}`}
                    style={[styles.gridLine, { top: `${i * 10}%`, height: 1, width: '100%' }]}
                  />
                ))}
              </View>

              {/* Marqueur départ */}
              <View style={styles.markerStart}>
                <View style={styles.markerStartCircle}>
                  <Ionicons name="location" size={20} color={Colors.white} />
                </View>
              </View>

              {/* Marqueur arrivée */}
              <View style={styles.markerEnd}>
                <View style={styles.markerEndCircle}>
                  <Ionicons name="navigate" size={20} color={Colors.white} />
                </View>
              </View>

              {/* Position actuelle (si en cours) */}
              {trip.status === 'ongoing' && (
                <Animated.View
                  style={[
                    pulseStyle,
                    styles.markerCurrent,
                    { left: `${30 + progress * 0.4}%`, top: `${40 + progress * 0.2}%` }
                  ]}
                >
                  <View style={styles.markerCurrentCircle}>
                    <Ionicons name="car" size={20} color={Colors.white} />
                  </View>
                </Animated.View>
              )}
            </View>

            {/* Bouton agrandir */}
            <View style={styles.expandButton}>
              <TouchableOpacity style={styles.expandButtonInner}>
                <Ionicons name={expanded ? 'contract' : 'expand'} size={20} color={Colors.gray[600]} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>

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
                onPress={() => router.push(`/chat/${trip.driverId}`)}
              >
                <Ionicons name="chatbubble" size={20} color={Colors.primary} />
                <Text style={styles.driverActionText}>Message</Text>
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
                <Text style={styles.detailValue}>{trip.availableSeats}/{trip.totalSeats}</Text>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="cash" size={20} color={Colors.gray[600]} />
                  <Text style={styles.detailLabel}>Prix</Text>
                </View>
                <Text style={[styles.detailValue, { color: Colors.success }]}>{trip.price} FC</Text>
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
        {trip.status === 'upcoming' && !isOwner && (
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

        {trip.status === 'upcoming' && isOwner && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelTrip}>
              <Text style={styles.cancelButtonText}>Annuler le trajet</Text>
            </TouchableOpacity>
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
    position: 'relative',
  },
  map: {
    height: 192,
    backgroundColor: Colors.gray[200],
  },
  mapExpanded: {
    height: 384,
  },
  mapContent: {
    position: 'absolute',
    inset: 0,
    backgroundColor: '#E3F2FD',
  },
  mapGrid: {
    position: 'absolute',
    inset: 0,
    opacity: 0.2,
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: Colors.gray[400],
  },
  markerStart: {
    position: 'absolute',
    left: '20%',
    top: '30%',
  },
  markerStartCircle: {
    width: 32,
    height: 32,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerEnd: {
    position: 'absolute',
    left: '70%',
    top: '60%',
  },
  markerEndCircle: {
    width: 32,
    height: 32,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerCurrent: {
    position: 'absolute',
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
    bottom: Spacing.lg,
    right: Spacing.lg,
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
  statusContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  statusCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
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
});
