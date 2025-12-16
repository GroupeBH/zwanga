import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useGetTripRequestByIdQuery,
  useCreateDriverOfferMutation,
  useAcceptDriverOfferMutation,
  useRejectDriverOfferMutation,
  useCancelTripRequestMutation,
} from '@/store/api/tripRequestApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useGetVehiclesQuery } from '@/store/api/vehicleApi';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useMemo, useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatTime, formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import type { DriverOffer, Vehicle } from '@/types';

export default function TripRequestDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { showDialog } = useDialog();
  
  // Extraire l'ID correctement (peut être un tableau avec Expo Router)
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  
  const { data: currentUser } = useGetCurrentUserQuery();
  const { data: tripRequest, isLoading, error, refetch, isError } = useGetTripRequestByIdQuery(id || '', {
    skip: !id,
  });

  // Debug: Log pour voir ce qui se passe
  React.useEffect(() => {
    if (id) {
      console.log('[TripRequestDetails] Loading trip request with ID:', id);
    }
    if (error) {
      console.error('[TripRequestDetails] Error loading trip request:', error);
      console.error('[TripRequestDetails] Error details:', JSON.stringify(error, null, 2));
    }
    if (tripRequest) {
      console.log('[TripRequestDetails] Trip request loaded:', tripRequest.id);
    }
  }, [id, error, tripRequest]);

  // Debug: Log pour voir ce qui se passe
  React.useEffect(() => {
    if (id) {
      console.log('[TripRequestDetails] Loading trip request with ID:', id);
    }
    if (error) {
      console.error('[TripRequestDetails] Error loading trip request:', error);
    }
    if (tripRequest) {
      console.log('[TripRequestDetails] Trip request loaded:', tripRequest.id);
    }
  }, [id, error, tripRequest]);
  const { data: vehicles = [] } = useGetVehiclesQuery(undefined, {
    skip: !currentUser?.isDriver,
  });
  
  const [createOffer, { isLoading: isCreatingOffer }] = useCreateDriverOfferMutation();
  const [acceptOffer, { isLoading: isAcceptingOffer }] = useAcceptDriverOfferMutation();
  const [rejectOffer, { isLoading: isRejectingOffer }] = useRejectDriverOfferMutation();
  const [cancelRequest, { isLoading: isCancelling }] = useCancelTripRequestMutation();

  // États pour le formulaire d'offre
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [proposedDepartureDate, setProposedDepartureDate] = useState(() => {
    // Initialiser avec la date min de la demande ou maintenant
    const minDate = tripRequest?.departureDateMin 
      ? new Date(tripRequest.departureDateMin)
      : new Date();
    // Si la date min est dans le passé, utiliser maintenant
    return minDate > new Date() ? minDate : new Date();
  });
  const [pricePerSeat, setPricePerSeat] = useState('');
  const [availableSeats, setAvailableSeats] = useState('');
  const [message, setMessage] = useState('');
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);

  // Mettre à jour la date proposée quand la demande change
  useEffect(() => {
    if (tripRequest?.departureDateMin) {
      const minDate = new Date(tripRequest.departureDateMin);
      const currentDate = new Date();
      // Utiliser la date min si elle est dans le futur, sinon utiliser maintenant
      const newDate = minDate > currentDate ? minDate : currentDate;
      setProposedDepartureDate(newDate);
    }
  }, [tripRequest?.departureDateMin]);

  const isOwner = useMemo(
    () => tripRequest && currentUser && tripRequest.passengerId === currentUser.id,
    [tripRequest, currentUser]
  );

  const hasExistingOffer = useMemo(() => {
    if (!tripRequest?.driverOffers || !currentUser) return false;
    return tripRequest.driverOffers.some(
      (offer) => offer.driverId === currentUser.id && offer.status === 'pending'
    );
  }, [tripRequest, currentUser]);

  const canMakeOffer = useMemo(() => {
    return (
      currentUser?.isDriver &&
      !isOwner &&
      tripRequest?.status === 'pending' &&
      !hasExistingOffer
    );
  }, [currentUser, isOwner, tripRequest, hasExistingOffer]);

  const myOffer = useMemo(() => {
    if (!tripRequest?.driverOffers || !currentUser) return null;
    return tripRequest.driverOffers.find((offer) => offer.driverId === currentUser.id);
  }, [tripRequest, currentUser]);

  // Fonctions pour appliquer uniquement la date ou l'heure
  const applyDatePart = (date: Date, currentDate: Date) => {
    const next = new Date(currentDate);
    next.setFullYear(date.getFullYear());
    next.setMonth(date.getMonth());
    next.setDate(date.getDate());
    return next;
  };

  const applyTimePart = (date: Date, currentDate: Date) => {
    const next = new Date(currentDate);
    next.setHours(date.getHours());
    next.setMinutes(date.getMinutes());
    next.setSeconds(0);
    next.setMilliseconds(0);
    return next;
  };

  const openDateOrTimePicker = (mode: 'date' | 'time') => {
    if (!tripRequest) return;
    
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: proposedDepartureDate,
        is24Hour: true,
        minimumDate: mode === 'date' ? new Date(tripRequest.departureDateMin) : undefined,
        maximumDate: mode === 'date' ? new Date(tripRequest.departureDateMax) : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          setProposedDepartureDate(
            mode === 'date' 
              ? applyDatePart(selectedDate, proposedDepartureDate) 
              : applyTimePart(selectedDate, proposedDepartureDate)
          );
        },
      });
    } else {
      setIosPickerMode(mode);
    }
  };

  const handleIosPickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !iosPickerMode || !tripRequest) return;
    const newDate = iosPickerMode === 'date' 
      ? applyDatePart(selectedDate, proposedDepartureDate) 
      : applyTimePart(selectedDate, proposedDepartureDate);
    
    // Valider que la date est dans la plage autorisée
    const minDate = new Date(tripRequest.departureDateMin);
    const maxDate = new Date(tripRequest.departureDateMax);
    if (newDate >= minDate && newDate <= maxDate) {
      setProposedDepartureDate(newDate);
    }
  };

  const handleCreateOffer = async () => {
    if (!tripRequest || !id) return;

    // Valider la date proposée
    const proposedDate = new Date(proposedDepartureDate);
    const minDate = new Date(tripRequest.departureDateMin);
    const maxDate = new Date(tripRequest.departureDateMax);

    if (proposedDate < minDate || proposedDate > maxDate) {
      showDialog({
        title: 'Date invalide',
        message: `La date proposée doit être entre le ${formatDateWithRelativeLabel(tripRequest.departureDateMin, true)} et le ${formatDateWithRelativeLabel(tripRequest.departureDateMax, true)}`,
        variant: 'danger',
      });
      return;
    }

    if (!pricePerSeat || parseFloat(pricePerSeat) <= 0) {
      showDialog({
        title: 'Erreur',
        message: 'Veuillez entrer un prix valide',
        variant: 'danger',
      });
      return;
    }

    if (!availableSeats || parseInt(availableSeats) < tripRequest.numberOfSeats) {
      showDialog({
        title: 'Erreur',
        message: `Vous devez proposer au moins ${tripRequest.numberOfSeats} place(s)`,
        variant: 'danger',
      });
      return;
    }

    if (tripRequest.maxPricePerSeat && parseFloat(pricePerSeat) > tripRequest.maxPricePerSeat) {
      showDialog({
        title: 'Erreur',
        message: `Le prix ne doit pas dépasser ${tripRequest.maxPricePerSeat} FC par place`,
        variant: 'danger',
      });
      return;
    }

    try {
      // Construire le payload en excluant les valeurs undefined
      const payload: {
        proposedDepartureDate: string;
        pricePerSeat: number;
        availableSeats: number;
        vehicleId?: string;
        message?: string;
      } = {
        proposedDepartureDate: proposedDepartureDate.toISOString(),
        pricePerSeat: parseFloat(pricePerSeat),
        availableSeats: parseInt(availableSeats),
      };

      // Ajouter vehicleId seulement s'il est défini et non vide
      if (selectedVehicleId && selectedVehicleId.trim() !== '') {
        payload.vehicleId = selectedVehicleId;
      }

      // Ajouter message seulement s'il est défini et non vide
      if (message && message.trim() !== '') {
        payload.message = message.trim();
      }

      await createOffer({
        tripRequestId: id,
        payload,
      }).unwrap();

      // Fermer le modal et réinitialiser le formulaire
      setShowOfferForm(false);
      setPricePerSeat('');
      setAvailableSeats('');
      setMessage('');
      setSelectedVehicleId('');

      showDialog({
        title: 'Offre créée',
        message: 'Votre offre a été envoyée avec succès. Le passager sera notifié et pourra l\'accepter.',
        variant: 'success',
        actions: [{ label: 'OK', onPress: () => refetch() }],
      });
    } catch (error: any) {
      showDialog({
        title: 'Erreur',
        message: error?.data?.message || 'Impossible de créer l\'offre',
        variant: 'danger',
      });
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    if (!tripRequest || !id) return;

    try {
      await acceptOffer({
        tripRequestId: id,
        payload: { offerId },
      }).unwrap();

      showDialog({
        title: 'Offre acceptée',
        message: 'Vous avez sélectionné ce driver pour votre trajet',
        variant: 'success',
        actions: [{ label: 'OK', onPress: () => refetch() }],
      });
    } catch (error: any) {
      showDialog({
        title: 'Erreur',
        message: error?.data?.message || 'Impossible d\'accepter l\'offre',
        variant: 'danger',
      });
    }
  };

  const handleRejectOffer = async (offerId: string) => {
    if (!tripRequest || !id) return;

    showDialog({
      title: 'Rejeter l\'offre',
      message: 'Êtes-vous sûr de vouloir rejeter cette offre ?',
      variant: 'warning',
      actions: [
        {
          label: 'Annuler',
          variant: 'secondary',
          onPress: () => {},
        },
        {
          label: 'Rejeter',
          variant: 'danger',
          onPress: async () => {
            try {
              await rejectOffer({
                tripRequestId: id,
                offerId,
              }).unwrap();

              showDialog({
                title: 'Offre rejetée',
                message: 'L\'offre a été rejetée avec succès',
                variant: 'success',
                actions: [{ label: 'OK', onPress: () => refetch() }],
              });
            } catch (error: any) {
              showDialog({
                title: 'Erreur',
                message: error?.data?.message || 'Impossible de rejeter l\'offre',
                variant: 'danger',
              });
            }
          },
        },
      ],
    });
  };

  const handleCancelRequest = async () => {
    if (!id) return;

    showDialog({
      title: 'Annuler la demande',
      message: 'Êtes-vous sûr de vouloir annuler cette demande ?',
      variant: 'danger',
      actions: [
        { label: 'Non', variant: 'secondary' },
        {
          label: 'Oui, annuler',
          variant: 'danger',
          onPress: async () => {
            try {
              await cancelRequest(id).unwrap();
              showDialog({
                title: 'Demande annulée',
                message: 'Votre demande a été annulée avec succès',
                variant: 'success',
                actions: [{ label: 'OK', onPress: () => router.back() }],
              });
            } catch (error: any) {
              showDialog({
                title: 'Erreur',
                message: error?.data?.message || 'Impossible d\'annuler la demande',
                variant: 'danger',
              });
            }
          },
        },
      ],
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de la demande</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || error) {
    const errorMessage = (error as any)?.data?.message || (error as any)?.error || 'Erreur lors du chargement de la demande';
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de la demande</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.danger} />
          <Text style={styles.emptyTitle}>Erreur</Text>
          <Text style={styles.emptyText}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => refetch()}
          >
            <Ionicons name="refresh" size={20} color={Colors.white} />
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!isLoading && !tripRequest) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de la demande</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyTitle}>Demande introuvable</Text>
          <Text style={styles.emptyText}>
            La demande de trajet que vous recherchez n'existe pas ou n'est plus disponible.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfigMap = {
    pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15' },
    offers_received: { label: 'Offres reçues', color: Colors.info, bg: Colors.info + '15' },
    driver_selected: { label: 'Driver sélectionné', color: Colors.success, bg: Colors.success + '15' },
    cancelled: { label: 'Annulée', color: Colors.danger, bg: Colors.danger + '15' },
    expired: { label: 'Expirée', color: Colors.gray[500], bg: Colors.gray[200] },
  };
  const statusConfig = statusConfigMap[tripRequest.status] || statusConfigMap.pending;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détails de la demande</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* En-tête avec statut */}
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
          {isOwner && tripRequest.status === 'pending' && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelRequest}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color={Colors.danger} />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={18} color={Colors.danger} />
                  <Text style={styles.cancelButtonText}>Annuler</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Informations passager */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Passager</Text>
          <View style={styles.passengerCard}>
            {tripRequest.passengerAvatar ? (
              <Image
                source={{ uri: tripRequest.passengerAvatar }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatar}>
                <Ionicons name="person" size={24} color={Colors.gray[500]} />
              </View>
            )}
            <View style={styles.passengerInfo}>
              <Text style={styles.passengerName}>{tripRequest.passengerName}</Text>
              <Text style={styles.passengerDate}>
                Demandé le {formatDateWithRelativeLabel(tripRequest.createdAt, false)}
              </Text>
            </View>
          </View>
        </View>

        {/* Itinéraire */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Itinéraire</Text>
          <View style={styles.routeCard}>
            <View style={styles.routeRow}>
              <Ionicons name="location" size={20} color={Colors.success} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Départ</Text>
                <Text style={styles.routeText}>{tripRequest.departure.name}</Text>
              </View>
            </View>
            <View style={styles.routeDivider} />
            <View style={styles.routeRow}>
              <Ionicons name="navigate" size={20} color={Colors.primary} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Destination</Text>
                <Text style={styles.routeText}>{tripRequest.arrival.name}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Détails */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détails</Text>
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={20} color={Colors.gray[600]} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Date de départ souhaitée</Text>
                <Text style={styles.detailValue}>
                  {formatDateWithRelativeLabel(tripRequest.departureDateMin, true)}
                </Text>
                <Text style={styles.detailSubValue}>
                  Délai max: {formatDateWithRelativeLabel(tripRequest.departureDateMax, true)}
                </Text>
              </View>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={20} color={Colors.gray[600]} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Nombre de places</Text>
                <Text style={styles.detailValue}>{tripRequest.numberOfSeats}</Text>
              </View>
            </View>
            {tripRequest.maxPricePerSeat && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Ionicons name="cash-outline" size={20} color={Colors.gray[600]} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>Prix maximum par place</Text>
                    <Text style={styles.detailValue}>{tripRequest.maxPricePerSeat} FC</Text>
                  </View>
                </View>
              </>
            )}
            {tripRequest.description && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Ionicons name="document-text-outline" size={20} color={Colors.gray[600]} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>Description</Text>
                    <Text style={styles.detailValue}>{tripRequest.description}</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Offres reçues (pour le propriétaire) */}
        {isOwner && tripRequest.driverOffers && tripRequest.driverOffers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Offres reçues ({tripRequest.driverOffers.length})
            </Text>
            {tripRequest.driverOffers.map((offer, index) => (
              <Animated.View
                key={offer.id}
                entering={FadeInDown.delay(index * 50)}
                style={styles.offerCard}
              >
                <View style={styles.offerHeader}>
                  <View style={styles.driverInfo}>
                    {offer.driverAvatar ? (
                      <Image
                        source={{ uri: offer.driverAvatar }}
                        style={styles.offerAvatar}
                      />
                    ) : (
                      <View style={styles.offerAvatar}>
                        <Ionicons name="person" size={20} color={Colors.gray[500]} />
                      </View>
                    )}
                    <View>
                      <Text style={styles.driverName}>{offer.driverName}</Text>
                      {offer.driverRating > 0 && (
                        <View style={styles.ratingRow}>
                          <Ionicons name="star" size={14} color={Colors.secondary} />
                          <Text style={styles.ratingText}>{offer.driverRating.toFixed(1)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {offer.status === 'accepted' && (
                    <View style={[styles.statusBadge, { backgroundColor: Colors.success + '15' }]}>
                      <Text style={[styles.statusText, { color: Colors.success }]}>Acceptée</Text>
                    </View>
                  )}
                </View>

                {offer.vehicleInfo && (
                  <View style={styles.offerDetail}>
                    <Ionicons name="car-outline" size={16} color={Colors.gray[600]} />
                    <Text style={styles.offerDetailText}>{offer.vehicleInfo}</Text>
                  </View>
                )}

                <View style={styles.offerDetail}>
                  <Ionicons name="calendar-outline" size={16} color={Colors.gray[600]} />
                  <Text style={styles.offerDetailText}>
                    {formatDateWithRelativeLabel(offer.proposedDepartureDate, true)}
                  </Text>
                </View>

                <View style={styles.offerDetail}>
                  <Ionicons name="cash-outline" size={16} color={Colors.gray[600]} />
                  <Text style={styles.offerDetailText}>
                    {offer.pricePerSeat} FC/place ({offer.availableSeats} places disponibles)
                  </Text>
                </View>

                {offer.message && (
                  <View style={styles.messageContainer}>
                    <Text style={styles.messageText}>{offer.message}</Text>
                  </View>
                )}

                {tripRequest.status !== 'driver_selected' && offer.status === 'pending' && isOwner && (
                  <View style={styles.offerActions}>
                    <TouchableOpacity
                      style={[styles.offerActionButton, styles.rejectButton]}
                      onPress={() => handleRejectOffer(offer.id)}
                      disabled={isRejectingOffer}
                    >
                      {isRejectingOffer ? (
                        <ActivityIndicator size="small" color={Colors.danger} />
                      ) : (
                        <>
                          <Ionicons name="close-circle" size={18} color={Colors.danger} />
                          <Text style={styles.rejectButtonText}>Rejeter</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.offerActionButton, styles.acceptButton]}
                      onPress={() => handleAcceptOffer(offer.id)}
                      disabled={isAcceptingOffer}
                    >
                      {isAcceptingOffer ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                          <Text style={styles.acceptButtonText}>Accepter</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>
            ))}
          </View>
        )}

        {/* Statut de l'offre du driver (si le driver a déjà fait une offre) */}
        {!isOwner && myOffer && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Votre offre</Text>
            <View style={styles.offerCard}>
              <View style={styles.offerHeader}>
                <View>
                  <Text style={styles.driverName}>Statut de votre offre</Text>
                  <View style={styles.ratingRow}>
                    <Text style={styles.ratingText}>
                      {formatDateWithRelativeLabel(myOffer.proposedDepartureDate, true)}
                    </Text>
                  </View>
                </View>
                <View style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      myOffer.status === 'accepted'
                        ? Colors.success + '15'
                        : myOffer.status === 'rejected'
                        ? Colors.danger + '15'
                        : Colors.warning + '15',
                  },
                ]}>
                  <Text style={[
                    styles.statusText,
                    {
                      color:
                        myOffer.status === 'accepted'
                          ? Colors.success
                          : myOffer.status === 'rejected'
                          ? Colors.danger
                          : Colors.warning,
                    },
                  ]}>
                    {myOffer.status === 'accepted'
                      ? 'Acceptée'
                      : myOffer.status === 'rejected'
                      ? 'Rejetée'
                      : 'En attente'}
                  </Text>
                </View>
              </View>
              <View style={styles.offerDetail}>
                <Ionicons name="cash-outline" size={16} color={Colors.gray[600]} />
                <Text style={styles.offerDetailText}>
                  {myOffer.pricePerSeat} FC/place ({myOffer.availableSeats} places)
                </Text>
              </View>
              {myOffer.message && (
                <View style={styles.messageContainer}>
                  <Text style={styles.messageText}>{myOffer.message}</Text>
                </View>
              )}
              {tripRequest.status === 'driver_selected' && myOffer.status === 'accepted' && (
                <View style={styles.successMessage}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  <Text style={styles.successMessageText}>
                    Félicitations ! Votre offre a été acceptée. Le passager vous contactera bientôt.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Bouton pour faire une offre (pour les drivers) */}
        {canMakeOffer && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.makeOfferButton}
              onPress={() => setShowOfferForm(true)}
            >
              <Ionicons name="add-circle-outline" size={24} color={Colors.white} />
              <Text style={styles.makeOfferButtonText}>Faire une offre</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Modal pour créer une offre */}
        {tripRequest && (
          <Modal
            visible={showOfferForm}
            animationType="slide"
            transparent={true}
            onRequestClose={() => {
              setShowOfferForm(false);
              setPricePerSeat('');
              setAvailableSeats('');
              setMessage('');
              setSelectedVehicleId('');
            }}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => {
                setShowOfferForm(false);
                setPricePerSeat('');
                setAvailableSeats('');
                setMessage('');
                setSelectedVehicleId('');
              }}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
                style={styles.modalContent}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Créer une offre</Text>
                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => {
                      setShowOfferForm(false);
                      setPricePerSeat('');
                      setAvailableSeats('');
                      setMessage('');
                      setSelectedVehicleId('');
                    }}
                  >
                    <Ionicons name="close" size={24} color={Colors.gray[600]} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.modalScrollView}
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={true}
                >
                  <View style={styles.offerFormCard}>
                    {vehicles.length > 0 && (
                      <View style={styles.formGroup}>
                        <Text style={styles.formLabel}>Véhicule (optionnel)</Text>
                        <View style={styles.vehicleSelector}>
                          {vehicles.map((vehicle: Vehicle) => (
                            <TouchableOpacity
                              key={vehicle.id}
                              style={[
                                styles.vehicleOption,
                                selectedVehicleId === vehicle.id && styles.vehicleOptionSelected,
                              ]}
                              onPress={() =>
                                setSelectedVehicleId(
                                  selectedVehicleId === vehicle.id ? '' : vehicle.id
                                )
                              }
                            >
                              <Text style={styles.vehicleOptionText}>
                                {vehicle.brand} {vehicle.model} - {vehicle.licensePlate}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Date et heure de départ proposée *</Text>
                      {tripRequest && (
                        <Text style={styles.formHelperText}>
                          Choisissez une date et heure entre le {formatDateWithRelativeLabel(tripRequest.departureDateMin, true)} et le {formatDateWithRelativeLabel(tripRequest.departureDateMax, true)}
                        </Text>
                      )}
                      <View style={styles.datetimeButtons}>
                        <TouchableOpacity
                          style={styles.datetimeButton}
                          onPress={() => openDateOrTimePicker('date')}
                        >
                          <View style={[styles.datetimeButtonIcon, { backgroundColor: Colors.primary + '15' }]}>
                            <Ionicons name="calendar" size={20} color={Colors.primary} />
                          </View>
                          <View style={styles.datetimeButtonContent}>
                            <Text style={styles.datetimeButtonLabel}>Date</Text>
                            <Text style={styles.datetimeButtonValue}>
                              {proposedDepartureDate.toLocaleDateString('fr-FR', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                              })}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.datetimeButton}
                          onPress={() => openDateOrTimePicker('time')}
                        >
                          <View style={[styles.datetimeButtonIcon, { backgroundColor: Colors.success + '15' }]}>
                            <Ionicons name="time" size={20} color={Colors.success} />
                          </View>
                          <View style={styles.datetimeButtonContent}>
                            <Text style={styles.datetimeButtonLabel}>Heure</Text>
                            <Text style={styles.datetimeButtonValue}>
                              {proposedDepartureDate.toLocaleTimeString('fr-FR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                      {Platform.OS === 'ios' && iosPickerMode && (
                        <View style={styles.iosPickerContainer}>
                          {tripRequest && (
                            <DateTimePicker
                              value={proposedDepartureDate}
                              mode={iosPickerMode}
                              display="spinner"
                              onChange={handleIosPickerChange}
                              minimumDate={new Date(tripRequest.departureDateMin)}
                              maximumDate={new Date(tripRequest.departureDateMax)}
                            />
                          )}
                          <TouchableOpacity
                            style={styles.iosPickerCloseButton}
                            onPress={() => setIosPickerMode(null)}
                          >
                            <Text style={styles.iosPickerCloseText}>Confirmer</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Prix par place (FC) *</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        placeholder="Ex: 5000"
                        value={pricePerSeat}
                        onChangeText={setPricePerSeat}
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>
                        Nombre de places disponibles *{tripRequest ? ` (min: ${tripRequest.numberOfSeats})` : ''}
                      </Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        placeholder={tripRequest ? `Ex: ${tripRequest.numberOfSeats}` : 'Ex: 1'}
                        value={availableSeats}
                        onChangeText={setAvailableSeats}
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Message (optionnel)</Text>
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        multiline
                        numberOfLines={4}
                        placeholder="Message pour le passager..."
                        value={message}
                        onChangeText={setMessage}
                      />
                    </View>

                    <View style={styles.formActions}>
                      <TouchableOpacity
                        style={styles.cancelFormButton}
                        onPress={() => {
                          setShowOfferForm(false);
                          setSelectedVehicleId('');
                          setPricePerSeat('');
                          setAvailableSeats('');
                          setMessage('');
                        }}
                      >
                        <Text style={styles.cancelFormButtonText}>Annuler</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.submitButton}
                        onPress={handleCreateOffer}
                        disabled={isCreatingOffer}
                      >
                        {isCreatingOffer ? (
                          <ActivityIndicator size="small" color={Colors.white} />
                        ) : (
                          <Text style={styles.submitButtonText}>Envoyer l'offre</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.lg,
  },
  statusCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  statusText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  cancelButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.danger,
    fontWeight: FontWeights.medium,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.md,
  },
  passengerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    marginRight: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  passengerInfo: {
    flex: 1,
  },
  passengerName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  passengerDate: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  routeCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  routeLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  routeText: {
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
  },
  routeDivider: {
    height: 1,
    backgroundColor: Colors.gray[200],
    marginVertical: Spacing.md,
    marginLeft: 28,
  },
  detailsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detailInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  detailLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  detailValue: {
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
  },
  detailSubValue: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
  detailDivider: {
    height: 1,
    backgroundColor: Colors.gray[200],
    marginVertical: Spacing.md,
    marginLeft: 28,
  },
  offerCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  offerAvatar: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    marginRight: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  driverName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  ratingText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  offerDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  offerDetailText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  messageContainer: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
  },
  messageText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontStyle: 'italic',
  },
  offerActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  offerActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  acceptButton: {
    backgroundColor: Colors.success,
  },
  acceptButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  rejectButton: {
    backgroundColor: Colors.danger + '15',
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  rejectButtonText: {
    color: Colors.danger,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  successMessageText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.success,
    fontWeight: FontWeights.medium,
  },
  makeOfferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  makeOfferButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  offerFormCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  formTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  formLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  vehicleSelector: {
    gap: Spacing.sm,
  },
  vehicleOption: {
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[50],
  },
  vehicleOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  vehicleOptionText: {
    fontSize: FontSizes.base,
    color: Colors.gray[900],
  },
  datetimeButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  datetimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    backgroundColor: Colors.white,
  },
  datetimeButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datetimeButtonContent: {
    flex: 1,
  },
  datetimeButtonLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    fontWeight: FontWeights.medium,
  },
  datetimeButtonValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginTop: 2,
  },
  iosPickerContainer: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.white,
  },
  iosPickerCloseButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
  },
  iosPickerCloseText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  formHelperText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  input: {
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    backgroundColor: Colors.white,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  formActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  cancelFormButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  cancelFormButtonText: {
    fontSize: FontSizes.base,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  submitButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: FontSizes.base,
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '90%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  modalCloseButton: {
    padding: Spacing.xs,
  },
  modalScrollView: {
    flexGrow: 1,
  },
  modalScrollContent: {
    padding: Spacing.lg,
    flexGrow: 1,
  },
  modalConfirmButton: {
    padding: Spacing.md,
    backgroundColor: Colors.primary,
    margin: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  modalConfirmButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginTop: Spacing.lg,
  },
  emptyText: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    textAlign: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
});

