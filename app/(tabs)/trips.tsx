import { TutorialOverlay } from '@/components/TutorialOverlay';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import {
  useDeleteTripMutation,
  useGetMyTripsQuery,
  useUpdateTripMutation,
} from '@/store/api/tripApi';
import type { Booking, Trip } from '@/types';
import { formatDateWithRelativeLabel, formatTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type MainTab = 'published' | 'bookings';
type SubTab = 'upcoming' | 'completed';

export default function TripsScreen() {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<MainTab>('published');
  const [subTab, setSubTab] = useState<SubTab>('upcoming');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const {
    data: myTrips,
    isLoading: tripsLoading,
    isFetching: tripsFetching,
    isError: tripsError,
    refetch: refetchTrips,
  } = useGetMyTripsQuery(undefined, {
    // Polling adaptatif : plus fréquent si des trajets sont en cours
    pollingInterval: myTrips?.some(trip => trip.status === 'ongoing') ? 15000 : 60000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const {
    data: myBookings,
    isLoading: bookingsLoading,
    isFetching: bookingsFetching,
    isError: bookingsError,
    refetch: refetchBookings,
  } = useGetMyBookingsQuery(undefined, {
    // Polling pour les réservations : plus fréquent si des trajets réservés sont en cours
    pollingInterval: myBookings?.some(booking => 
      booking.status === 'accepted' && booking.trip?.status === 'ongoing'
    ) ? 15000 : 60000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const [updateTripMutation, { isLoading: isSavingTrip }] = useUpdateTripMutation();
  const [deleteTripMutation, { isLoading: isDeletingTrip }] = useDeleteTripMutation();
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [editSeats, setEditSeats] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDateTime, setEditDateTime] = useState<Date | null>(null);
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );
  const { shouldShow: shouldShowTripsGuide, complete: completeTripsGuide } =
    useTutorialGuide('trips_screen');
  const [tripsGuideVisible, setTripsGuideVisible] = useState(false);

  useEffect(() => {
    if (shouldShowTripsGuide) {
      setTripsGuideVisible(true);
    }
  }, [shouldShowTripsGuide]);

  const dismissTripsGuide = () => {
    setTripsGuideVisible(false);
    completeTripsGuide();
  };

  const trips = myTrips ?? [];

  const upcomingTrips = useMemo(
    () => {
      const now = new Date();
      const filtered = trips.filter((trip) => {
        // Si le trajet est déjà complété, il n'est pas à venir
        if (trip.status === 'completed') {
          return false;
        }

        // Si le trajet est 'upcoming' ou 'ongoing', vérifier si la date de départ est passée
        if (trip.status === 'upcoming' || trip.status === 'ongoing') {
          if (trip.departureTime) {
            const departureDate = new Date(trip.departureTime);
            // Si la date de départ est passée, le trajet est expiré
            if (departureDate < now) {
              return false;
            }
          }
          return true;
        }

        return false;
      });

      // Trier par date de départ (les plus récents en premier)
      return filtered.sort((a, b) => {
        const dateA = new Date(a.departureTime).getTime();
        const dateB = new Date(b.departureTime).getTime();
        return dateB - dateA; // dateB - dateA = du plus récent au plus ancien
      });
    },
    [trips],
  );

  const completedTrips = useMemo(
    () => {
      const now = new Date();
      const filtered = trips.filter((trip) => {
        // Les trajets avec status 'completed' sont dans l'historique
        if (trip.status === 'completed') {
          return true;
        }

        // Les trajets 'upcoming' ou 'ongoing' dont la date de départ est passée sont expirés
        if (trip.status === 'upcoming' || trip.status === 'ongoing') {
          if (trip.departureTime) {
            const departureDate = new Date(trip.departureTime);
            // Si la date de départ est passée, le trajet est expiré et va dans l'historique
            if (departureDate < now) {
              return true;
            }
          }
        }

        return false;
      });

      // Trier par date de départ (les plus récents en premier)
      return filtered.sort((a, b) => {
        const dateA = new Date(a.departureTime).getTime();
        const dateB = new Date(b.departureTime).getTime();
        return dateB - dateA; // dateB - dateA = du plus récent au plus ancien
      });
    },
    [trips],
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchTrips(), refetchBookings()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filtrer les réservations par statut (à venir / terminées)
  const upcomingBookings = useMemo(() => {
    const now = new Date();
    return (myBookings ?? []).filter((booking) => {
      if (booking.status === 'completed' || booking.status === 'rejected' || booking.status === 'cancelled') {
        return false;
      }
      if (booking.trip?.departureTime) {
        const departureDate = new Date(booking.trip.departureTime);
        return departureDate >= now;
      }
      return booking.status === 'pending' || booking.status === 'accepted';
    }).sort((a, b) => {
      const dateA = new Date(a.trip?.departureTime || a.createdAt).getTime();
      const dateB = new Date(b.trip?.departureTime || b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [myBookings]);

  const completedBookingsList = useMemo(() => {
    const now = new Date();
    return (myBookings ?? []).filter((booking) => {
      if (booking.status === 'completed' || booking.status === 'rejected' || booking.status === 'cancelled') {
        return true;
      }
      if (booking.trip?.departureTime) {
        const departureDate = new Date(booking.trip.departureTime);
        return departureDate < now;
      }
      return false;
    }).sort((a, b) => {
      const dateA = new Date(a.trip?.departureTime || a.createdAt).getTime();
      const dateB = new Date(b.trip?.departureTime || b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [myBookings]);

  const displayTrips = subTab === 'upcoming' ? upcomingTrips : completedTrips;
  const displayBookings = subTab === 'upcoming' ? upcomingBookings : completedBookingsList;
  const displayData = mainTab === 'published' ? displayTrips : displayBookings;
  const isEmpty = displayData.length === 0;
  const showLoader = (mainTab === 'published' ? tripsLoading : bookingsLoading) && (mainTab === 'published' ? trips.length === 0 : (myBookings?.length ?? 0) === 0);
  const isError = mainTab === 'published' ? tripsError : bookingsError;
  const isFetching = mainTab === 'published' ? tripsFetching : bookingsFetching;

  const getDefaultFutureDate = () => {
    const base = new Date();
    base.setMinutes(0, 0, 0);
    base.setHours(base.getHours() + 1);
    return base;
  };

  const getEditBaseDate = () => {
    if (editDateTime) {
      return new Date(editDateTime);
    }
    return getDefaultFutureDate();
  };

  const applyEditDatePart = (pickedDate: Date) => {
    const base = getEditBaseDate();
    const next = new Date(base);
    next.setFullYear(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());
    return next;
  };

  const applyEditTimePart = (pickedDate: Date) => {
    const base = getEditBaseDate();
    const next = new Date(base);
    next.setHours(pickedDate.getHours(), pickedDate.getMinutes(), 0, 0);
    return next;
  };

  const openDateOrTimePicker = (mode: 'date' | 'time') => {
    const value = getEditBaseDate();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value,
        is24Hour: true,
        minimumDate: mode === 'date' ? new Date() : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) {
            return;
          }
          setEditDateTime(mode === 'date' ? applyEditDatePart(selectedDate) : applyEditTimePart(selectedDate));
        },
      });
    } else {
      setIosPickerMode(mode);
    }
  };

  const handleIosPickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !iosPickerMode) {
      return;
    }
    setEditDateTime(
      iosPickerMode === 'date' ? applyEditDatePart(selectedDate) : applyEditTimePart(selectedDate),
    );
  };

  const closeIosPicker = () => setIosPickerMode(null);

  const openEditModal = (trip: Trip) => {
    setEditingTrip(trip);
    setEditSeats(String(trip.availableSeats));
    setEditPrice(String(trip.price));
    const parsedDate = trip.departureTime ? new Date(trip.departureTime) : null;
    setEditDateTime(parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : getDefaultFutureDate());
  };

  const closeEditModal = () => {
    setEditingTrip(null);
    setEditSeats('');
    setEditPrice('');
    setEditDateTime(null);
    setIosPickerMode(null);
  };

  const openDeleteModal = (trip: Trip) => setDeleteTarget(trip);
  const closeDeleteModal = () => setDeleteTarget(null);

  const formattedEditDate = useMemo(() => {
    if (!editDateTime) {
      return 'Choisir la date';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(editDateTime);
  }, [editDateTime]);

  const formattedEditTime = useMemo(() => {
    if (!editDateTime) {
      return 'Choisir l\'heure';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(editDateTime);
  }, [editDateTime]);

  const showFeedback = (type: 'success' | 'error', message: string | string[]) => {
    setFeedback({
      type,
      message: Array.isArray(message) ? message.join('\n') : message,
    });
  };

  const handleSaveTrip = async () => {
    if (!editingTrip || !editDateTime) {
      return;
    }
    const seatsValue = parseInt(editSeats, 10);
    const priceValue = parseFloat(editPrice);
    if (Number.isNaN(seatsValue) || Number.isNaN(priceValue) || seatsValue <= 0 || priceValue < 0) {
      showFeedback('error', 'Veuillez vérifier le nombre de places et le prix.');
      return;
    }
    try {
      await updateTripMutation({
        id: editingTrip.id,
        updates: {
          totalSeats: seatsValue,
          pricePerSeat: priceValue,
          departureDate: editDateTime.toISOString(),
        },
      }).unwrap();
      showFeedback('success', 'Le trajet a été mis à jour.');
      closeEditModal();
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? 'Impossible de mettre à jour ce trajet pour le moment.';
      showFeedback('error', message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await deleteTripMutation(deleteTarget.id).unwrap();
      showFeedback('success', 'Le trajet a été supprimé.');
      closeDeleteModal();
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? 'Impossible de supprimer ce trajet pour le moment.';
      showFeedback('error', message);
    }
  };

  const canManageTrip = (trip: Trip) => {
    // Ne peut pas gérer les trajets complétés
    if (trip.status === 'completed') {
      return false;
    }

    // Vérifier si la date de départ est passée
    if (trip.departureTime) {
      const departureDate = new Date(trip.departureTime);
      const now = new Date();
      if (departureDate < now) {
        return false; // Trajet expiré, ne peut plus être modifié
      }
    }

    return trip.status === 'upcoming' || trip.status === 'ongoing';
  };

  const getStatusConfig = (trip: Trip) => {
    // Vérifier si le trajet est expiré (date de départ passée)
    const isExpired = trip.departureTime && new Date(trip.departureTime) < new Date();

    // Si le trajet est expiré mais n'a pas le status 'completed', afficher "Expiré"
    if (isExpired && trip.status !== 'completed') {
      return { bgColor: Colors.gray[200], textColor: Colors.gray[600], label: 'Expiré' };
    }

    switch (trip.status) {
      case 'upcoming':
        return { bgColor: 'rgba(247, 184, 1, 0.1)', textColor: Colors.secondary, label: 'À venir' };
      case 'ongoing':
        return { bgColor: 'rgba(52, 152, 219, 0.1)', textColor: Colors.info, label: 'En cours' };
      case 'completed':
        return { bgColor: 'rgba(46, 204, 113, 0.1)', textColor: Colors.success, label: 'Terminé' };
      default:
        return { bgColor: Colors.gray[200], textColor: Colors.gray[600], label: trip.status };
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mes trajets</Text>

        {/* Main Tabs */}
        <View style={styles.mainTabsContainer}>
          <TouchableOpacity
            style={[styles.mainTab, mainTab === 'published' && styles.mainTabActive]}
            onPress={() => {
              setMainTab('published');
              setSubTab('upcoming');
            }}
          >
            <Text style={[styles.mainTabText, mainTab === 'published' && styles.mainTabTextActive]}>
              Publiés ({trips.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mainTab, mainTab === 'bookings' && styles.mainTabActive]}
            onPress={() => {
              setMainTab('bookings');
              setSubTab('upcoming');
            }}
          >
            <Text style={[styles.mainTabText, mainTab === 'bookings' && styles.mainTabTextActive]}>
              Réservations ({myBookings?.length ?? 0})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sub Tabs */}
        <View style={styles.subTabsContainer}>
          <TouchableOpacity
            style={[styles.subTab, subTab === 'upcoming' && styles.subTabActive]}
            onPress={() => setSubTab('upcoming')}
          >
            <Text style={[styles.subTabText, subTab === 'upcoming' && styles.subTabTextActive]}>
              À venir ({mainTab === 'published' ? upcomingTrips.length : upcomingBookings.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subTab, subTab === 'completed' && styles.subTabActive]}
            onPress={() => setSubTab('completed')}
          >
            <Text style={[styles.subTabText, subTab === 'completed' && styles.subTabTextActive]}>
              Terminés ({mainTab === 'published' ? completedTrips.length : completedBookingsList.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {isError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={16} color={Colors.white} />
          <Text style={styles.errorText}>
            Impossible de charger les {mainTab === 'published' ? 'trajets' : 'réservations'}. Réessayez.
          </Text>
          <TouchableOpacity onPress={mainTab === 'published' ? refetchTrips : refetchBookings}>
            <Text style={styles.errorAction}>Rafraîchir</Text>
          </TouchableOpacity>
        </View>
      )}

      {feedback && (
        <TouchableOpacity
          style={[
            styles.feedbackBanner,
            feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
          ]}
          onPress={() => setFeedback(null)}
        >
          <Ionicons
            name={feedback.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={18}
            color={Colors.white}
          />
          <Text style={styles.feedbackText}>{feedback.message}</Text>
          <Ionicons name="close" size={16} color={Colors.white} />
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing || isFetching}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {showLoader && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loaderText}>
              Chargement des {mainTab === 'published' ? 'trajets' : 'réservations'}...
            </Text>
          </View>
        )}
        {displayData.length === 0 && !showLoader ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name={mainTab === 'published' ? 'car-outline' : 'calendar-outline'}
                size={48}
                color={Colors.gray[500]}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {mainTab === 'published' ? 'Aucun trajet' : 'Aucune réservation'}
            </Text>
            <Text style={styles.emptyText}>
              {mainTab === 'published'
                ? subTab === 'upcoming'
                  ? 'Vous n\'avez pas de trajet à venir'
                  : 'Vous n\'avez pas encore terminé de trajet'
                : subTab === 'upcoming'
                  ? 'Vous n\'avez pas de réservation à venir'
                  : 'Vous n\'avez pas encore terminé de réservation'}
            </Text>
            {mainTab === 'published' && subTab === 'upcoming' && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/publish')}
              >
                <Text style={styles.emptyButtonText}>Publier un trajet</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          mainTab === 'published'
            ? displayTrips.map((trip, index) => {
            const TripCardWithArrival = () => {
              const calculatedArrivalTime = useTripArrivalTime(trip);
              const arrivalTimeDisplay = calculatedArrivalTime
                ? formatTime(calculatedArrivalTime.toISOString())
                : formatTime(trip.arrivalTime);

              const statusConfig = getStatusConfig(trip);

              return (
                <Animated.View
                  key={trip.id}
                  entering={FadeInDown.delay(index * 100)}
                  style={styles.tripCard}
                >
                  {/* Header */}
                  <View style={styles.tripHeader}>
                    <View style={styles.tripDriverInfo}>
                      {trip.driverAvatar ? (
                        <Image
                          source={{ uri: trip.driverAvatar }}
                          style={styles.avatar}
                        />
                      ) : (
                        <View style={styles.avatar} />
                      )}
                      <View style={styles.tripDriverDetails}>
                        <Text style={styles.driverName}>{trip.driverName}</Text>
                        <View style={styles.driverMeta}>
                          <Ionicons name="star" size={14} color={Colors.secondary} />
                          <Text style={styles.driverRating}>{trip.driverRating}</Text>
                          {trip.vehicle || trip.vehicleInfo ? (
                            <>
                              <View style={styles.dot} />
                              <Text style={styles.vehicleInfo}>
                                {trip.vehicle
                                  ? `${trip.vehicle.brand} ${trip.vehicle.model}${trip.vehicle.color ? ` • ${trip.vehicle.color}` : ''}`
                                  : trip.vehicleInfo}
                              </Text>
                            </>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                      <Text style={[styles.statusText, { color: statusConfig.textColor }]}>
                        {statusConfig.label}
                      </Text>
                    </View>
                  </View>

                  {/* Route */}
                  <View style={styles.routeContainer}>
                    <View style={styles.routeRow}>
                      <Ionicons name="location" size={16} color={Colors.success} />
                      <Text style={styles.routeText}>{trip.departure.name}</Text>
                      <View style={styles.timeContainer}>
                        <Text style={styles.routeDateLabel}>
                          {formatDateWithRelativeLabel(trip.departureTime, false)}
                        </Text>
                        <Text style={styles.routeTime}>
                          {formatTime(trip.departureTime)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.routeDivider} />
                    <View style={styles.routeRow}>
                      <Ionicons name="navigate" size={16} color={Colors.primary} />
                      <Text style={styles.routeText}>{trip.arrival.name}</Text>
                      <View style={styles.timeContainer}>
                        {calculatedArrivalTime && (
                          <Text style={styles.routeDateLabel}>
                            {formatDateWithRelativeLabel(calculatedArrivalTime.toISOString(), false)}
                          </Text>
                        )}
                        <Text style={styles.routeTime}>
                          {arrivalTimeDisplay}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Info */}
                  <View style={styles.tripFooter}>
                    <View style={styles.tripFooterLeft}>
                      <View style={styles.infoItem}>
                        <Ionicons name="people" size={16} color={Colors.gray[600]} />
                        <Text style={styles.infoText}>{trip.availableSeats} places</Text>
                      </View>
                      <View style={[styles.infoItem, { marginLeft: Spacing.lg }]}>
                        <Ionicons name="cash" size={16} color={Colors.gray[600]} />
                        {trip.price === 0 ? (
                          <Text style={[styles.infoText, { color: Colors.success, fontWeight: FontWeights.bold }]}>Gratuit</Text>
                        ) : (
                          <Text style={styles.infoText}>{trip.price} FC</Text>
                        )}
                      </View>
                    </View>
                    {/* Bouton Détails - Toujours accessible, même pour les trajets expirés/complétés */}
                    <TouchableOpacity
                      style={styles.detailsButton}
                      onPress={() => router.push(`/trip/manage/${trip.id}`)}
                    >
                      <Text style={styles.detailsButtonText}>Détails</Text>
                      <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>

                  {/* Actions de gestion - Désactivées pour les trajets expirés/complétés mais toujours visibles */}
                  <View style={styles.ownerActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.ownerActionButton,
                        !canManageTrip(trip) && styles.ownerActionDisabled,
                      ]}
                      onPress={() => openEditModal(trip)}
                      disabled={!canManageTrip(trip)}
                    >
                      <Ionicons name="create-outline" size={16} color={Colors.primary} />
                      <Text style={styles.ownerActionText}>Modifier</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.ownerActionButton,
                        styles.ownerActionDanger,
                        { marginRight: 0 },
                        !canManageTrip(trip) && styles.ownerActionDisabled,
                      ]}
                      onPress={() => openDeleteModal(trip)}
                      // disabled={!canManageTrip(trip)}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                      <Text style={[styles.ownerActionText, styles.ownerActionDangerText]}>
                        Supprimer
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              );
            };

            return <TripCardWithArrival key={trip.id} />;
          })
            : displayBookings.map((booking, index) => {
                const trip = booking.trip;
                if (!trip) return null;

                const BookingCardWithArrival = () => {
                  const calculatedArrivalTime = useTripArrivalTime(trip);
                  const arrivalTimeDisplay = calculatedArrivalTime
                    ? formatTime(calculatedArrivalTime.toISOString())
                    : formatTime(trip.arrivalTime);

                  const getBookingStatusConfig = () => {
                    switch (booking.status) {
                      case 'pending':
                        return { bgColor: 'rgba(247, 184, 1, 0.1)', textColor: Colors.secondary, label: 'En attente' };
                      case 'accepted':
                        return { bgColor: 'rgba(46, 204, 113, 0.1)', textColor: Colors.success, label: 'Confirmée' };
                      case 'rejected':
                        return { bgColor: 'rgba(239, 68, 68, 0.1)', textColor: Colors.danger, label: 'Refusée' };
                      case 'cancelled':
                        return { bgColor: 'rgba(156, 163, 175, 0.1)', textColor: Colors.gray[600], label: 'Annulée' };
                      case 'completed':
                        return { bgColor: 'rgba(46, 204, 113, 0.1)', textColor: Colors.success, label: 'Terminée' };
                      default:
                        return { bgColor: Colors.gray[200], textColor: Colors.gray[600], label: booking.status };
                    }
                  };

                  const statusConfig = getBookingStatusConfig();

                  return (
                    <Animated.View
                      key={booking.id}
                      entering={FadeInDown.delay(index * 100)}
                      style={styles.tripCard}
                    >
                      {/* Header */}
                      <View style={styles.tripHeader}>
                        <View style={styles.tripDriverInfo}>
                          {trip.driverAvatar ? (
                            <Image source={{ uri: trip.driverAvatar }} style={styles.avatar} />
                          ) : (
                            <View style={styles.avatar} />
                          )}
                          <View style={styles.tripDriverDetails}>
                            <Text style={styles.driverName}>{trip.driverName}</Text>
                            <View style={styles.driverMeta}>
                              <Ionicons name="star" size={14} color={Colors.secondary} />
                              <Text style={styles.driverRating}>{trip.driverRating}</Text>
                              {trip.vehicle || trip.vehicleInfo ? (
                                <>
                                  <View style={styles.dot} />
                                  <Text style={styles.vehicleInfo}>
                                    {trip.vehicle
                                      ? `${trip.vehicle.brand} ${trip.vehicle.model}${trip.vehicle.color ? ` • ${trip.vehicle.color}` : ''}`
                                      : trip.vehicleInfo}
                                  </Text>
                                </>
                              ) : null}
                            </View>
                          </View>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                          <Text style={[styles.statusText, { color: statusConfig.textColor }]}>
                            {statusConfig.label}
                          </Text>
                        </View>
                      </View>

                      {/* Route */}
                      <View style={styles.routeContainer}>
                        <View style={styles.routeRow}>
                          <Ionicons name="location" size={16} color={Colors.success} />
                          <Text style={styles.routeText}>{trip.departure.name}</Text>
                          <View style={styles.timeContainer}>
                            <Text style={styles.routeDateLabel}>
                              {formatDateWithRelativeLabel(trip.departureTime, false)}
                            </Text>
                            <Text style={styles.routeTime}>{formatTime(trip.departureTime)}</Text>
                          </View>
                        </View>
                        <View style={styles.routeDivider} />
                        <View style={styles.routeRow}>
                          <Ionicons name="navigate" size={16} color={Colors.primary} />
                          <Text style={styles.routeText}>
                            {booking.passengerDestination || trip.arrival.name}
                          </Text>
                          <View style={styles.timeContainer}>
                            {calculatedArrivalTime && (
                              <Text style={styles.routeDateLabel}>
                                {formatDateWithRelativeLabel(calculatedArrivalTime.toISOString(), false)}
                              </Text>
                            )}
                            <Text style={styles.routeTime}>{arrivalTimeDisplay}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Info */}
                      <View style={styles.tripFooter}>
                        <View style={styles.tripFooterLeft}>
                          <View style={styles.infoItem}>
                            <Ionicons name="people" size={16} color={Colors.gray[600]} />
                            <Text style={styles.infoText}>{booking.numberOfSeats} place{booking.numberOfSeats > 1 ? 's' : ''}</Text>
                          </View>
                          <View style={[styles.infoItem, { marginLeft: Spacing.lg }]}>
                            <Ionicons name="cash" size={16} color={Colors.gray[600]} />
                            {trip.price === 0 ? (
                              <Text style={[styles.infoText, { color: Colors.success, fontWeight: FontWeights.bold }]}>
                                Gratuit
                              </Text>
                            ) : (
                              <Text style={styles.infoText}>{trip.price * booking.numberOfSeats} FC</Text>
                            )}
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.detailsButton}
                          onPress={() => router.push(`/trip/${trip.id}`)}
                        >
                          <Text style={styles.detailsButtonText}>Détails</Text>
                          <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                        </TouchableOpacity>
                      </View>
                    </Animated.View>
                  );
                };

                return <BookingCardWithArrival key={booking.id} />;
              })
        )}
      </ScrollView>

      {/* FAB - Publier un trajet (seulement pour les trajets publiés) */}
      {mainTab === 'published' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/publish')}
        >
          <Ionicons name="add" size={32} color={Colors.white} />
        </TouchableOpacity>
      )}

      <Modal transparent animationType="slide" visible={Boolean(editingTrip)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modifier le trajet</Text>
              {editingTrip && (
                <Text style={styles.modalSubtitle}>
                  {editingTrip.departure.name} → {editingTrip.arrival.name}
                </Text>
              )}
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Places disponibles</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                placeholder="4"
                placeholderTextColor={Colors.gray[400]}
                value={editSeats}
                onChangeText={setEditSeats}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Prix (FC)</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                placeholder="5000"
                placeholderTextColor={Colors.gray[400]}
                value={editPrice}
                onChangeText={setEditPrice}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Date et heure de départ</Text>
              <View style={styles.modalDatetimeRow}>
                <TouchableOpacity
                  style={styles.modalDatetimeButton}
                  onPress={() => openDateOrTimePicker('date')}
                >
                  <Ionicons name="calendar" size={18} color={Colors.primary} />
                  <View style={{ marginLeft: Spacing.sm }}>
                    <Text style={styles.modalDatetimeLabel}>Date</Text>
                    <Text style={styles.modalDatetimeValue}>{formattedEditDate}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalDatetimeButton, { marginRight: 0 }]}
                  onPress={() => openDateOrTimePicker('time')}
                >
                  <Ionicons name="time" size={18} color={Colors.gray[700]} />
                  <View style={{ marginLeft: Spacing.sm }}>
                    <Text style={styles.modalDatetimeLabel}>Heure</Text>
                    <Text style={styles.modalDatetimeValue}>{formattedEditTime}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {Platform.OS === 'ios' && iosPickerMode && (
              <View style={styles.iosPickerContainer}>
                <DateTimePicker
                  value={getEditBaseDate()}
                  mode={iosPickerMode}
                  display="inline"
                  minuteInterval={5}
                  minimumDate={iosPickerMode === 'date' ? new Date() : undefined}
                  onChange={handleIosPickerChange}
                />
                <TouchableOpacity style={styles.iosPickerCloseButton} onPress={closeIosPicker}>
                  <Text style={styles.iosPickerCloseText}>Terminé</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={closeEditModal}
              >
                <Text style={styles.modalButtonSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, { marginRight: 0 }]}
                onPress={handleSaveTrip}
                disabled={isSavingTrip}
              >
                {isSavingTrip ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.modalButtonPrimaryText}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={Boolean(deleteTarget)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Ionicons name="trash" size={28} color={Colors.danger} />
            </View>
            <Text style={styles.confirmTitle}>Supprimer ce trajet ?</Text>
            <Text style={styles.confirmText}>
              Cette action est irréversible. Les passagers seront informés de l'annulation.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={closeDeleteModal}
              >
                <Text style={styles.modalButtonSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalButtonPrimary,
                  styles.modalButtonDanger,
                  { marginRight: 0 },
                ]}
                onPress={handleConfirmDelete}
                disabled={isDeletingTrip}
              >
                {isDeletingTrip ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.modalButtonPrimaryText}>Supprimer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <TutorialOverlay
        visible={tripsGuideVisible}
        title="Gérez vos trajets"
        message="Retrouvez vos trajets publiés, modifiez-les ou publiez un nouveau trajet depuis ce tableau de bord."
        onDismiss={dismissTripsGuide}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.lg,
  },
  mainTabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: 2,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    ...CommonStyles.shadowSm,
  },
  mainTab: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTabActive: {
    backgroundColor: Colors.primary,
  },
  mainTabText: {
    textAlign: 'center',
    fontWeight: FontWeights.bold,
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  mainTabTextActive: {
    color: Colors.white,
  },
  subTabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.sm,
    padding: 2,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  subTab: {
    flex: 1,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabActive: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
  },
  subTabText: {
    textAlign: 'center',
    fontWeight: FontWeights.medium,
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
  },
  subTabTextActive: {
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: 120, // Increased for edge-to-edge
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.danger,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    ...CommonStyles.shadowSm,
  },
  errorText: {
    color: Colors.white,
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.sm,
  },
  errorAction: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
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
    color: Colors.white,
    marginLeft: Spacing.sm,
    marginRight: Spacing.sm,
    fontSize: FontSizes.sm,
  },
  loaderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  loaderText: {
    marginTop: Spacing.sm,
    color: Colors.gray[600],
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl * 2,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.sm,
  },
  emptyText: {
    color: Colors.gray[600],
    textAlign: 'center',
    marginBottom: Spacing.xl,
    fontSize: FontSizes.base,
  },
  emptyButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  emptyButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  tripCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  tripDriverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.md,
  },
  tripDriverDetails: {
    flex: 1,
  },
  driverName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
    marginBottom: Spacing.xs,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginLeft: Spacing.xs,
  },
  dot: {
    width: 4,
    height: 4,
    backgroundColor: Colors.gray[400],
    borderRadius: BorderRadius.full,
    marginHorizontal: Spacing.sm,
  },
  vehicleInfo: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  routeContainer: {
    marginBottom: Spacing.md,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  routeText: {
    color: Colors.gray[700],
    marginLeft: Spacing.sm,
    flex: 1,
    fontSize: FontSizes.base,
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  routeDateLabel: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
    marginBottom: 2,
  },
  routeTime: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  routeDivider: {
    width: 2,
    height: 24,
    backgroundColor: Colors.gray[300],
    marginLeft: 8,
    marginBottom: Spacing.sm,
  },
  tripFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  tripFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginLeft: Spacing.xs,
  },
  ownerActionsRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
  ownerActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
    marginRight: Spacing.sm,
  },
  ownerActionDanger: {
    borderColor: 'rgba(231, 76, 60, 0.3)',
    backgroundColor: 'rgba(231, 76, 60, 0.08)',
  },
  ownerActionText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  ownerActionDangerText: {
    color: Colors.danger,
  },
  ownerActionDisabled: {
    opacity: 0.5,
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  detailsButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    marginRight: Spacing.xs,
    fontSize: FontSizes.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    ...CommonStyles.shadowLg,
  },
  modalHeader: {
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  modalSubtitle: {
    marginTop: Spacing.xs,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  modalField: {
    marginBottom: Spacing.lg,
  },
  modalLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[700],
    marginBottom: Spacing.xs,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
  },
  modalDatetimeRow: {
    flexDirection: 'row',
  },
  modalDatetimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginRight: Spacing.sm,
  },
  modalDatetimeLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
  },
  modalDatetimeValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  iosPickerContainer: {
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  iosPickerCloseButton: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  iosPickerCloseText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  modalActions: {
    flexDirection: 'row',
  },
  modalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  modalButtonSecondary: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  modalButtonSecondaryText: {
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  modalButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  modalButtonDanger: {
    backgroundColor: Colors.danger,
  },
  modalButtonPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  confirmCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    ...CommonStyles.shadowLg,
  },
  confirmIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  confirmTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  confirmText: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.xl,
    width: 64,
    height: 64,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowLg,
  },
});

