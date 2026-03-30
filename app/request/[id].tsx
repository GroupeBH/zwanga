import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import {
  useAcceptDriverOfferMutation,
  useAcceptTripRequestMutation,
  useCancelTripRequestMutation,
  useCreateDriverOfferMutation,
  useGetTripRequestByIdQuery,
  useRejectDriverOfferMutation,
  useStartTripFromRequestMutation,
  useUpdateTripRequestMutation,
} from '@/store/api/tripRequestApi';
import { useStartTripMutation } from '@/store/api/tripApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useGetVehiclesQuery } from '@/store/api/vehicleApi';
import type { Vehicle } from '@/types';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { createBecomeDriverAction, isDriverRequiredError } from '@/utils/errorHelpers';
import { getRouteCoordinates } from '@/utils/routeHelpers';
import { getTripRequestCreateHref } from '@/utils/requestNavigation';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TripRequestDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { showDialog } = useDialog();
  const insets = useSafeAreaInsets();
  
  // Extraire l'ID correctement (peut être un tableau avec Expo Router)
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const isCreateRouteAlias = id === 'index';
  
  const { data: currentUser } = useGetCurrentUserQuery();
  const { isIdentityVerified, checkIdentity } = useIdentityCheck();
  
  // État pour le polling interval dynamique
  const [pollingInterval, setPollingInterval] = useState(30000);
  
  const { data: tripRequest, isLoading, error, refetch, isError } = useGetTripRequestByIdQuery(id || '', {
    skip: !id || isCreateRouteAlias,
    pollingInterval,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (isCreateRouteAlias) {
      router.replace(getTripRequestCreateHref());
    }
  }, [isCreateRouteAlias, router]);

  // Mettre à jour le polling interval en fonction du statut de la demande
  React.useEffect(() => {
    if (tripRequest?.status === 'pending' || tripRequest?.status === 'offers_received') {
      setPollingInterval(30000); // 30 secondes pour les demandes actives
    } else if (tripRequest?.status === 'driver_selected') {
      setPollingInterval(60000); // 60 secondes si driver sélectionné
    } else {
      setPollingInterval(0); // Pas de polling si annulé ou expiré
    }
  }, [tripRequest?.status]);

  // Debug: Log pour voir ce qui se passe
  React.useEffect(() => {
    if (id && !isCreateRouteAlias) {
      console.log('[TripRequestDetails] Loading trip request with ID:', id);
    }
    if (error) {
      console.error('[TripRequestDetails] Error loading trip request:', error);
      console.error('[TripRequestDetails] Error details:', JSON.stringify(error, null, 2));
    }
    if (tripRequest) {
      console.log('[TripRequestDetails] Trip request loaded:', tripRequest.id);
    }
  }, [id, error, tripRequest, isCreateRouteAlias]);

  // Debug: Log pour voir ce qui se passe
  React.useEffect(() => {
    if (id && !isCreateRouteAlias) {
      console.log('[TripRequestDetails] Loading trip request with ID:', id);
    }
    if (error) {
      console.error('[TripRequestDetails] Error loading trip request:', error);
    }
    if (tripRequest) {
      console.log('[TripRequestDetails] Trip request loaded:', tripRequest.id);
    }
  }, [id, error, tripRequest, isCreateRouteAlias]);
  const { data: vehicles = [] } = useGetVehiclesQuery(undefined, {
    skip: !(currentUser?.role === 'driver' || currentUser?.role === 'both'),
  });
  
  // Filtrer pour n'afficher que les véhicules actifs
  const activeVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => vehicle.isActive === true);
  }, [vehicles]);
  
  const [createOffer, { isLoading: isCreatingOffer }] = useCreateDriverOfferMutation();
  const [acceptOffer, { isLoading: isAcceptingOffer }] = useAcceptDriverOfferMutation();
  const [acceptTripRequest, { isLoading: isAcceptingTripRequest }] = useAcceptTripRequestMutation();
  const [rejectOffer, { isLoading: isRejectingOffer }] = useRejectDriverOfferMutation();
  const [cancelRequest, { isLoading: isCancelling }] = useCancelTripRequestMutation();
  const [updateTripRequest, { isLoading: isUpdating }] = useUpdateTripRequestMutation();
  const [startTripFromRequest, { isLoading: isStartingTripFromRequest }] = useStartTripFromRequestMutation();
  const [startTrip, { isLoading: isStartingTrip }] = useStartTripMutation();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (error) {
      console.warn('Error refreshing trip request data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // États pour le formulaire de modification
  const [showEditForm, setShowEditForm] = useState(false);
  const [editDepartureLocation, setEditDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [editArrivalLocation, setEditArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [editDepartureDateMin, setEditDepartureDateMin] = useState<Date | null>(null);
  const [editDepartureDateMax, setEditDepartureDateMax] = useState<Date | null>(null);
  const [editNumberOfSeats, setEditNumberOfSeats] = useState('');
  const [editMaxPricePerSeat, setEditMaxPricePerSeat] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIosPickerModeMin, setEditIosPickerModeMin] = useState<'date' | 'time' | null>(null);
  const [editIosPickerModeMax, setEditIosPickerModeMax] = useState<'date' | 'time' | null>(null);
  const [editActivePicker, setEditActivePicker] = useState<'departure' | 'arrival' | null>(null);
  const [editLocationPickerType, setEditLocationPickerType] = useState<'departure' | 'arrival' | null>(null);

  // États pour le formulaire d'offre
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerStep, setOfferStep] = useState<'details' | 'preview'>('details');
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
  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[] | null>(null);
  const [, setIsLoadingRoute] = useState(false);
  const [mapModalVisible, setMapModalVisible] = useState(false);

  const directAcceptVehicle = useMemo(
    () => activeVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? activeVehicles[0],
    [activeVehicles, selectedVehicleId]
  );

  const directAcceptDepartureDate = useMemo(() => {
    if (!tripRequest) return null;

    const minDate = new Date(tripRequest.departureDateMin);
    const maxDate = new Date(tripRequest.departureDateMax);
    const now = new Date();
    const preferredDate = minDate > now ? minDate : now;

    return preferredDate <= maxDate ? preferredDate : maxDate;
  }, [tripRequest]);

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

  // Charger les coordonnées de la route réelle
  useEffect(() => {
    const loadRoute = async () => {
      if (!tripRequest?.departure?.lat || !tripRequest?.departure?.lng || 
          !tripRequest?.arrival?.lat || !tripRequest?.arrival?.lng) {
        return;
      }

      setIsLoadingRoute(true);
      try {
        const departureCoordinate = {
          latitude: tripRequest.departure.lat,
          longitude: tripRequest.departure.lng,
        };
        const arrivalCoordinate = {
          latitude: tripRequest.arrival.lat,
          longitude: tripRequest.arrival.lng,
        };

        const coordinates = await getRouteCoordinates(departureCoordinate, arrivalCoordinate);
        if (coordinates && coordinates.length > 0) {
          setRouteCoordinates(coordinates);
        } else {
          // Fallback sur ligne droite si l'API échoue
          setRouteCoordinates([
            departureCoordinate,
            arrivalCoordinate,
          ]);
        }
      } catch (error) {
        console.warn('Error loading route for trip request:', error);
        // Fallback sur ligne droite en cas d'erreur
        if (tripRequest?.departure?.lat && tripRequest?.departure?.lng && 
            tripRequest?.arrival?.lat && tripRequest?.arrival?.lng) {
          setRouteCoordinates([
            { latitude: tripRequest.departure.lat, longitude: tripRequest.departure.lng },
            { latitude: tripRequest.arrival.lat, longitude: tripRequest.arrival.lng },
          ]);
        }
      } finally {
        setIsLoadingRoute(false);
      }
    };

    loadRoute();
  }, [tripRequest?.departure?.lat, tripRequest?.departure?.lng, tripRequest?.arrival?.lat, tripRequest?.arrival?.lng]);

  const isOwner = useMemo(
    () => tripRequest && currentUser && tripRequest.passengerId === currentUser.id,
    [tripRequest, currentUser]
  );

  // Vérifier si la demande peut être modifiée
  const canEdit = useMemo(() => {
    if (!isOwner || !tripRequest) return false;
    // Ne peut pas modifier si une offre a été acceptée ou si un driver a été sélectionné
    if (tripRequest.status === 'driver_selected' || tripRequest.selectedDriverId) return false;
    // Ne peut modifier que si le statut est 'pending' ou 'offers_received'
    return tripRequest.status === 'pending' || tripRequest.status === 'offers_received';
  }, [isOwner, tripRequest]);

  const hasExistingOffer = useMemo(() => {
    if (!tripRequest?.offers || !currentUser) return false;
    return tripRequest.offers.some(
      (offer) => offer.driverId === currentUser.id && offer.status === 'pending'
    );
  }, [tripRequest, currentUser]);

  // Vérifier s'il y a une offre acceptée
  const hasAcceptedOffer = useMemo(() => {
    if (!tripRequest?.offers) return false;
    return tripRequest.offers.some((offer) => offer.status === 'accepted');
  }, [tripRequest?.offers]);

  const canMakeOffer = useMemo(() => {
    const userRole = currentUser?.role;
    if (!(userRole === 'driver' || userRole === 'both') || !isIdentityVerified || isOwner || hasExistingOffer) {
      return false;
    }

    // Permettre l'envoi d'offres tant qu'aucune offre n'a été acceptée
    // Vérifier d'abord le statut
    const isRequestOpen = tripRequest?.status === 'pending' || tripRequest?.status === 'offers_received';
    if (!isRequestOpen) {
      return false;
    }

    // Vérifier aussi s'il y a déjà une offre acceptée (même si le statut n'est pas encore 'driver_selected')
    // Cela correspond à la logique backend qui filtre les demandes avec des offres acceptées
    if (hasAcceptedOffer) {
      return false;
    }

    return true;
  }, [currentUser, isIdentityVerified, isOwner, tripRequest, hasExistingOffer, hasAcceptedOffer]);

  const myOffer = useMemo(() => {
    if (!tripRequest?.offers || !currentUser) return null;
    return tripRequest.offers.find((offer) => offer.driverId === currentUser.id);
  }, [tripRequest, currentUser]);

  const isCurrentDriverAssigned = useMemo(() => {
    if (!currentUser?.id) {
      return myOffer?.status === 'accepted';
    }

    if (tripRequest?.selectedDriverId) {
      return tripRequest.selectedDriverId === currentUser.id;
    }

    return myOffer?.status === 'accepted';
  }, [currentUser?.id, myOffer?.status, tripRequest?.selectedDriverId]);

  const canOpenAssignedTrip = useMemo(
    () => isCurrentDriverAssigned && !!tripRequest?.tripId,
    [isCurrentDriverAssigned, tripRequest?.tripId]
  );

  const canStartAssignedTrip = useMemo(
    () => isCurrentDriverAssigned && !tripRequest?.tripId,
    [isCurrentDriverAssigned, tripRequest?.tripId]
  );

  const canAcceptDirectly = useMemo(() => canMakeOffer && !myOffer, [canMakeOffer, myOffer]);

  const minimumSeatsRequired = tripRequest?.numberOfSeats ?? 1;

  const isOfferDraftValid = useMemo(() => {
    if (!tripRequest) return false;

    const parsedPrice = Number.parseFloat(pricePerSeat);
    const parsedSeats = Number.parseInt(availableSeats, 10);

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return false;
    }

    if (!Number.isFinite(parsedSeats) || parsedSeats < minimumSeatsRequired) {
      return false;
    }

    if (tripRequest.maxPricePerSeat && parsedPrice > tripRequest.maxPricePerSeat) {
      return false;
    }

    return true;
  }, [availableSeats, minimumSeatsRequired, pricePerSeat, tripRequest]);

  const resetOfferForm = useCallback(() => {
    const minDate = tripRequest?.departureDateMin ? new Date(tripRequest.departureDateMin) : new Date();
    const currentDate = new Date();

    setOfferStep('details');
    setSelectedVehicleId('');
    setPricePerSeat('');
    setAvailableSeats(tripRequest ? String(tripRequest.numberOfSeats) : '');
    setMessage('');
    setIosPickerMode(null);
    setProposedDepartureDate(minDate > currentDate ? minDate : currentDate);
  }, [tripRequest]);

  const closeOfferForm = useCallback(() => {
    setShowOfferForm(false);
    resetOfferForm();
  }, [resetOfferForm]);

  const openOfferForm = useCallback(() => {
    resetOfferForm();
    setShowOfferForm(true);
  }, [resetOfferForm]);

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

  // Fonctions pour les date pickers du formulaire de modification
  const openEditDateOrTimePickerMin = (mode: 'date' | 'time') => {
    if (!editDepartureDateMin) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: editDepartureDateMin,
        is24Hour: true,
        minimumDate: mode === 'date' ? new Date() : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          const newDate = mode === 'date' 
            ? applyDatePart(selectedDate, editDepartureDateMin) 
            : applyTimePart(selectedDate, editDepartureDateMin);
          setEditDepartureDateMin(newDate);
          if (mode === 'date' && editDepartureDateMax && newDate >= editDepartureDateMax) {
            setEditDepartureDateMax(new Date(newDate.getTime() + 24 * 60 * 60 * 1000));
          }
        },
      });
    } else {
      setEditIosPickerModeMin(mode);
    }
  };

  const openEditDateOrTimePickerMax = (mode: 'date' | 'time') => {
    if (!editDepartureDateMax) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: editDepartureDateMax,
        is24Hour: true,
        minimumDate: mode === 'date' && editDepartureDateMin ? editDepartureDateMin : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          const newDate = mode === 'date' 
            ? applyDatePart(selectedDate, editDepartureDateMax) 
            : applyTimePart(selectedDate, editDepartureDateMax);
          setEditDepartureDateMax(newDate);
        },
      });
    } else {
      setEditIosPickerModeMax(mode);
    }
  };

  const handleEditIosPickerChangeMin = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !editIosPickerModeMin || !editDepartureDateMin) return;
    const newDate = editIosPickerModeMin === 'date' 
      ? applyDatePart(selectedDate, editDepartureDateMin) 
      : applyTimePart(selectedDate, editDepartureDateMin);
    setEditDepartureDateMin(newDate);
    if (editIosPickerModeMin === 'date' && editDepartureDateMax && newDate >= editDepartureDateMax) {
      setEditDepartureDateMax(new Date(newDate.getTime() + 24 * 60 * 60 * 1000));
    }
    setEditIosPickerModeMin(null);
  };

  const handleEditIosPickerChangeMax = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !editIosPickerModeMax || !editDepartureDateMax) return;
    const newDate = editIosPickerModeMax === 'date' 
      ? applyDatePart(selectedDate, editDepartureDateMax) 
      : applyTimePart(selectedDate, editDepartureDateMax);
    setEditDepartureDateMax(newDate);
    setEditIosPickerModeMax(null);
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

    // Vérifier que l'utilisateur est driver
    const userRole = currentUser?.role;
    if (!(userRole === 'driver' || userRole === 'both')) {
      showDialog({
        title: 'Devenir conducteur requis',
        message: 'Pour faire une proposition sur une demande de covoiturage, vous devez être conducteur. Voulez-vous devenir conducteur ?',
        variant: 'warning',
        actions: [
          { label: 'Annuler', variant: 'ghost' },
          createBecomeDriverAction(router),
        ],
      });
      return;
    }

    // Vérifier que le KYC est approuvé
    if (!isIdentityVerified) {
      const canProceed = checkIdentity('publish');
      if (!canProceed) {
        return;
      }
    }

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
        message: 'Veuillez entrer une participation valide par place.',
        variant: 'danger',
      });
      return;
    }

    if (!availableSeats || parseInt(availableSeats, 10) < tripRequest.numberOfSeats) {
      showDialog({
        title: 'Erreur',
        message: `Vous devez proposer au moins ${tripRequest.numberOfSeats} place(s).`,
        variant: 'danger',
      });
      return;
    }

    if (tripRequest.maxPricePerSeat && parseFloat(pricePerSeat) > tripRequest.maxPricePerSeat) {
      showDialog({
        title: 'Erreur',
        message: `La participation ne doit pas dépasser ${tripRequest.maxPricePerSeat} FC par place.`,
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
        availableSeats: parseInt(availableSeats, 10),
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
      closeOfferForm();

      showDialog({
        title: 'Proposition envoyée',
        message: `Votre proposition de ${parseFloat(pricePerSeat).toLocaleString('fr-FR')} FC/place pour ${availableSeats} place(s) a été envoyée. Le demandeur pourra la choisir si elle lui convient.`,
        variant: 'success',
        actions: [
          { 
            label: 'OK', 
            variant: 'primary',
            onPress: () => refetch() 
          },
        ],
      });
    } catch (error: any) {
      const message = error?.data?.message || 'Impossible de créer la proposition.';
      const isDriverError = isDriverRequiredError(error);
      
      showDialog({
        title: 'Erreur',
        message,
        variant: 'danger',
        actions: isDriverError
          ? [
              { label: 'Fermer', variant: 'ghost' },
              createBecomeDriverAction(router),
            ]
          : undefined,
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
        title: 'Proposition retenue',
        message: 'Vous avez choisi cette proposition de covoiturage.',
        variant: 'success',
        actions: [{ label: 'OK', onPress: () => refetch() }],
      });
    } catch (error: any) {
      showDialog({
        title: 'Erreur',
        message: error?.data?.message || 'Impossible de retenir cette proposition.',
        variant: 'danger',
      });
    }
  };

  const handleRejectOffer = async (offerId: string) => {
    if (!tripRequest || !id) return;

    showDialog({
      title: 'Rejeter la proposition',
      message: 'Êtes-vous sûr de vouloir rejeter cette proposition ?',
      variant: 'warning',
      actions: [
        {
          label: 'Annuler',
          variant: 'secondary',
          onPress: () => {},
        },
        {
          label: 'Rejeter',
          variant: 'secondary',
          onPress: async () => {
            try {
              await rejectOffer({
                tripRequestId: id,
                offerId,
              }).unwrap();

              showDialog({
                title: 'Proposition rejetée',
                message: 'La proposition a été rejetée avec succès.',
                variant: 'success',
                actions: [{ label: 'OK', onPress: () => refetch() }],
              });
            } catch (error: any) {
              showDialog({
                title: 'Erreur',
                message: error?.data?.message || 'Impossible de rejeter cette proposition.',
                variant: 'danger',
              });
            }
          },
        },
      ],
    });
  };

  const handleStartTripFromRequest = async () => {
    if (!tripRequest || !id) return;

    showDialog({
      title: 'Démarrer le trajet',
      message: 'Vous allez créer un trajet et une réservation automatique pour le passager. Le trajet démarrera immédiatement. Continuer ?',
      variant: 'info',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Démarrer',
          variant: 'primary',
          onPress: async () => {
            try {
              const result = await startTripFromRequest(id).unwrap();
              showDialog({
                title: 'Trajet démarré',
                message: 'Le trajet a été créé et démarré avec succès. Le passager a été automatiquement réservé.',
                variant: 'success',
                actions: [
                  {
                    label: 'Voir le trajet',
                    variant: 'primary',
                    onPress: () => {
                      refetch();
                      router.push(`/trip/manage/${result.trip.id}`);
                    },
                  },
                  { label: 'OK', variant: 'ghost', onPress: () => refetch() },
                ],
              });
            } catch (error: any) {
              showDialog({
                title: 'Erreur',
                message: error?.data?.message || 'Impossible de démarrer le trajet',
                variant: 'danger',
              });
            }
          },
        },
      ],
    });
  };

  const handleDirectAcceptTripRequest = async (startImmediately: boolean) => {
    if (!tripRequest || !id || !directAcceptDepartureDate) return;

    const payload: { vehicleId?: string; departureDate?: string } = {
      departureDate: directAcceptDepartureDate.toISOString(),
    };

    if (directAcceptVehicle?.id) {
      payload.vehicleId = directAcceptVehicle.id;
    }

    try {
      const result = await acceptTripRequest({
        tripRequestId: id,
        payload,
      }).unwrap();

      if (startImmediately) {
        try {
          await startTrip(result.trip.id).unwrap();

          showDialog({
            title: 'Trajet d\u00E9marr\u00E9',
            message: 'La demande a \u00E9t\u00E9 accept\u00E9e et le trajet a d\u00E9marr\u00E9. Le passager a d\u00E9j\u00E0 \u00E9t\u00E9 r\u00E9serv\u00E9 automatiquement.',
            variant: 'success',
            actions: [
              {
                label: 'Ouvrir le trajet',
                variant: 'primary',
                onPress: () => {
                  refetch();
                  router.push(`/trip/manage/${result.trip.id}`);
                },
              },
              {
                label: 'Plus tard',
                variant: 'ghost',
                onPress: () => refetch(),
              },
            ],
          });
        } catch (startError: any) {
          const startErrorMessage =
            startError?.data?.message ??
            startError?.error ??
            'La demande est accept\u00E9e, mais le trajet n\u2019a pas pu d\u00E9marrer tout de suite.';

          showDialog({
            title: 'Demande accept\u00E9e',
            message: `${startErrorMessage} Vous pouvez ouvrir le trajet pour le lancer depuis son \u00E9cran de gestion.`,
            variant: 'warning',
            actions: [
              {
                label: 'Ouvrir le trajet',
                variant: 'primary',
                onPress: () => {
                  refetch();
                  router.push(`/trip/manage/${result.trip.id}`);
                },
              },
              {
                label: 'Rester ici',
                variant: 'ghost',
                onPress: () => refetch(),
              },
            ],
          });
        }

        return;
      }

      showDialog({
        title: 'Demande accept\u00E9e',
        message: 'Le trajet a \u00E9t\u00E9 cr\u00E9\u00E9 imm\u00E9diatement et le passager a d\u00E9j\u00E0 \u00E9t\u00E9 r\u00E9serv\u00E9. Vous pouvez maintenant ouvrir le trajet quand vous \u00EAtes pr\u00EAt.',
        variant: 'success',
        actions: [
          {
            label: 'Ouvrir le trajet',
            variant: 'primary',
            onPress: () => {
              refetch();
              router.push(`/trip/manage/${result.trip.id}`);
            },
          },
          {
            label: 'Plus tard',
            variant: 'ghost',
            onPress: () => refetch(),
          },
        ],
      });
    } catch (error: any) {
      const resolvedMessage =
        error?.data?.message ??
        error?.error ??
        'Impossible d\u2019accepter cette demande pour le moment.';
      const isDriverError = isDriverRequiredError(error);

      showDialog({
        title: 'Erreur',
        message: resolvedMessage,
        variant: 'danger',
        actions: isDriverError
          ? [
              { label: 'Fermer', variant: 'ghost' },
              createBecomeDriverAction(router),
            ]
          : undefined,
      });
    }
  };

  const handleOpenDirectAcceptDialog = () => {
    if (!tripRequest || !directAcceptDepartureDate) return;

    const vehicleLabel = directAcceptVehicle
      ? `${directAcceptVehicle.brand} ${directAcceptVehicle.model}`
      : 'votre profil conducteur';

    showDialog({
      title: 'Accepter la demande',
      message: `Le trajet sera cr\u00E9\u00E9 pour ${formatDateWithRelativeLabel(directAcceptDepartureDate.toISOString(), true)} avec ${vehicleLabel}. Le passager sera r\u00E9serv\u00E9 automatiquement.`,
      variant: 'info',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Accepter',
          variant: 'secondary',
          onPress: async () => {
            await handleDirectAcceptTripRequest(false);
          },
        },
        {
          label: 'Accepter et d\u00E9marrer',
          variant: 'primary',
          onPress: async () => {
            await handleDirectAcceptTripRequest(true);
          },
        },
      ],
    });
  };

  const handleViewTrip = (tripId: string) => {
    if (!tripId) return;

    const targetRoute = isCurrentDriverAssigned ? `/trip/manage/${tripId}` as const : `/trip/${tripId}` as const;
    router.push(targetRoute);
  };

  // Initialiser le formulaire de modification avec les valeurs actuelles
  const initializeEditForm = () => {
    if (!tripRequest) return;
    
    setEditDepartureLocation({
      title: tripRequest.departure.name,
      address: tripRequest.departure.address || '',
      latitude: tripRequest.departure.lat,
      longitude: tripRequest.departure.lng,
    });
    
    setEditArrivalLocation({
      title: tripRequest.arrival.name,
      address: tripRequest.arrival.address || '',
      latitude: tripRequest.arrival.lat,
      longitude: tripRequest.arrival.lng,
    });
    
    setEditDepartureDateMin(new Date(tripRequest.departureDateMin));
    setEditDepartureDateMax(new Date(tripRequest.departureDateMax));
    setEditNumberOfSeats(tripRequest.numberOfSeats.toString());
    setEditMaxPricePerSeat(tripRequest.maxPricePerSeat?.toString() || '');
    setEditDescription(tripRequest.description || '');
  };

  const handleOpenEditForm = () => {
    initializeEditForm();
    setShowEditForm(true);
  };

  const handleUpdateRequest = async () => {
    if (!id || !editDepartureLocation || !editArrivalLocation) return;

    try {
      await updateTripRequest({
        id,
        payload: {
          departureLocation: editDepartureLocation.title,
          departureCoordinates: [editDepartureLocation.longitude, editDepartureLocation.latitude],
          arrivalLocation: editArrivalLocation.title,
          arrivalCoordinates: [editArrivalLocation.longitude, editArrivalLocation.latitude],
          departureDateMin: editDepartureDateMin?.toISOString() || tripRequest?.departureDateMin || '',
          departureDateMax: editDepartureDateMax?.toISOString() || tripRequest?.departureDateMax || '',
          numberOfSeats: parseInt(editNumberOfSeats) || tripRequest?.numberOfSeats || 1,
          maxPricePerSeat: editMaxPricePerSeat ? parseFloat(editMaxPricePerSeat) : undefined,
          description: editDescription.trim() || undefined,
        },
      }).unwrap();

      setShowEditForm(false);
      refetch();
      
      showDialog({
        title: 'Demande modifiée',
        message: 'Votre demande a été modifiée avec succès',
        variant: 'success',
      });
    } catch (error: any) {
      showDialog({
        title: 'Erreur',
        message: error?.data?.message || 'Impossible de modifier la demande',
        variant: 'danger',
      });
    }
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
          variant: 'secondary',
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
            La demande de trajet que vous recherchez n&apos;existe pas ou n&apos;est plus disponible.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfigMap = {
    pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15' },
    offers_received: { label: 'Réponses reçues', color: Colors.info, bg: Colors.info + '15' },
    driver_selected: { label: 'Conducteur choisi', color: Colors.success, bg: Colors.success + '15' },
    cancelled: { label: 'Annulée', color: Colors.danger, bg: Colors.danger + '15' },
    expired: { label: 'Expirée', color: Colors.gray[500], bg: Colors.gray[200] },
  };
  const statusConfig = statusConfigMap[tripRequest.status] || statusConfigMap.pending;

  const pendingOffersCount = tripRequest.offers?.filter((offer) => offer.status === 'pending').length ?? 0;
  const heroStepIndex =
    tripRequest.tripId
      ? 3
      : tripRequest.status === 'driver_selected'
        ? 2
        : tripRequest.status === 'offers_received' || pendingOffersCount > 0
          ? 1
          : tripRequest.status === 'pending'
            ? 0
            : -1;
  const heroSteps = ['Demande', 'Réponses', 'Conducteur', 'Départ'];
  const ownerHero = (() => {
    if (tripRequest.tripId) {
      return {
        colors: ['#0F766E', '#14B8A6'] as const,
        title: 'Votre course est prête',
        subtitle: 'Le trajet a déjà été créé. Vous pouvez maintenant suivre la course en direct.',
      };
    }
    if (tripRequest.status === 'driver_selected') {
      return {
        colors: ['#166534', '#22C55E'] as const,
        title: tripRequest.selectedDriverName
          ? `${tripRequest.selectedDriverName} prépare votre prise en charge`
          : 'Votre conducteur a été confirmé',
        subtitle: 'Restez disponible, la prise en charge va bientôt commencer.',
      };
    }
    if (tripRequest.status === 'offers_received' || pendingOffersCount > 0) {
      return {
        colors: ['#0F766E', '#0EA5E9'] as const,
        title:
          pendingOffersCount > 1
            ? `${pendingOffersCount} conducteurs ont répondu`
            : 'Un conducteur a répondu',
        subtitle: "Le conducteur retenu apparaîtra ici dès qu'il sera confirmé.",
      };
    }
    if (tripRequest.status === 'cancelled') {
      return {
        colors: ['#7F1D1D', '#DC2626'] as const,
        title: 'Votre demande est annulée',
        subtitle: "Cette demande n'est plus visible pour les conducteurs.",
      };
    }
    if (tripRequest.status === 'expired') {
      return {
        colors: ['#374151', '#6B7280'] as const,
        title: 'Votre demande a expiré',
        subtitle: "Aucun conducteur ne s'est positionné à temps. Vous pouvez relancer une nouvelle demande.",
      };
    }
    return {
      colors: ['#111827', Colors.primary] as const,
      title: 'Nous cherchons un conducteur',
      subtitle: 'Votre demande circule déjà auprès des conducteurs disponibles autour de votre trajet.',
    };
  })();
  const ownerHeroHintMessage =
    pendingOffersCount > 0
      ? 'Les réponses arrivent. Le conducteur retenu apparaîtra ici.'
      : "Vous serez alerté dès qu'un conducteur se manifeste.";
  const isDriverRole = currentUser?.role === 'driver' || currentUser?.role === 'both';
  const driverHero = (() => {
    if (canOpenAssignedTrip) {
      return {
        colors: ['#0F766E', '#14B8A6'] as const,
        badge: 'Retenu',
        title: 'Vous pilotez cette course',
        subtitle: 'Le trajet est déjà prêt. Ouvrez-le pour suivre la course ou lancer votre prise en charge.',
      };
    }
    if (canStartAssignedTrip) {
      return {
        colors: ['#166534', '#22C55E'] as const,
        badge: 'Confirmé',
        title: 'Cette demande est pour vous',
        subtitle: 'Le passager est déjà réservé. Vous pouvez démarrer le trajet dès maintenant.',
      };
    }
    if (myOffer?.status === 'pending') {
      return {
        colors: ['#0F766E', '#0EA5E9'] as const,
        badge: 'En attente',
        title: 'Votre proposition attend la décision du passager',
        subtitle: 'Gardez un œil sur cette demande. Vous serez notifié dès qu\'une réponse arrive.',
      };
    }
    if (myOffer?.status === 'rejected') {
      return {
        colors: ['#374151', '#6B7280'] as const,
        badge: 'Clôturé',
        title: 'Votre proposition n\'a pas été retenue',
        subtitle: 'Vous pouvez consulter d\'autres demandes disponibles depuis l\'accueil ou la liste des demandes.',
      };
    }
    if (!isDriverRole) {
      return {
        colors: ['#111827', '#334155'] as const,
        badge: 'Profil',
        title: 'Activez votre profil conducteur',
        subtitle: 'Cette demande est ouverte, mais votre compte doit devenir conducteur pour envoyer une proposition.',
      };
    }
    if (!isIdentityVerified) {
      return {
        colors: ['#92400E', '#F59E0B'] as const,
        badge: 'KYC',
        title: 'Vérifiez votre identité pour répondre',
        subtitle: 'Une vérification rapide est nécessaire avant d\'envoyer une proposition au passager.',
      };
    }
    if (canAcceptDirectly) {
      return {
        colors: ['#111827', Colors.primary] as const,
        badge: 'Immédiat',
        title: 'Vous pouvez accepter cette course maintenant',
        subtitle: 'Le trajet sera créé tout de suite, avec une option pour le démarrer immédiatement si vous êtes prêt.',
      };
    }
    return {
      colors: ['#111827', Colors.primary] as const,
      badge: statusConfig.label,
      title: 'Une course attend votre offre',
      subtitle: 'Analysez les besoins du passager puis proposez votre heure et votre tarif.',
    };
  })();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détails de la demande</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* En-tête avec statut */}
        {isOwner ? (
          <LinearGradient colors={ownerHero.colors} style={styles.ownerHeroCard}>
            <View style={styles.ownerHeroTopRow}>
              <View style={styles.ownerHeroStatusBadge}>
                <Text style={styles.ownerHeroStatusText}>{statusConfig.label}</Text>
              </View>
              {pendingOffersCount > 0 && !tripRequest.tripId && (
                <View style={styles.ownerHeroCounter}>
                  <Ionicons name="sparkles-outline" size={14} color={Colors.white} />
                  <Text style={styles.ownerHeroCounterText}>
                    {pendingOffersCount} réponse{pendingOffersCount > 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.ownerHeroTitle}>{ownerHero.title}</Text>
            <Text style={styles.ownerHeroSubtitle}>{ownerHero.subtitle}</Text>

            <View style={styles.ownerHeroRouteCard}>
              <View style={styles.ownerHeroRouteRow}>
                <View style={[styles.ownerHeroRouteDot, { backgroundColor: Colors.success }]} />
                <View style={styles.ownerHeroRouteInfo}>
                  <Text style={styles.ownerHeroRouteLabel}>Départ</Text>
                  <Text style={styles.ownerHeroRouteText}>{tripRequest.departure.name}</Text>
                </View>
              </View>
              <View style={styles.ownerHeroRouteLine} />
              <View style={styles.ownerHeroRouteRow}>
                <View style={[styles.ownerHeroRouteDot, styles.ownerHeroRouteSquare]} />
                <View style={styles.ownerHeroRouteInfo}>
                  <Text style={styles.ownerHeroRouteLabel}>Destination</Text>
                  <Text style={styles.ownerHeroRouteText}>{tripRequest.arrival.name}</Text>
                </View>
              </View>
            </View>

            <View style={styles.ownerHeroMetaRow}>
              <View style={styles.ownerHeroMetaChip}>
                <Ionicons name="time-outline" size={14} color={Colors.white} />
                <Text style={styles.ownerHeroMetaText}>
                  {formatDateWithRelativeLabel(tripRequest.departureDateMin, true)}
                </Text>
              </View>
              <View style={styles.ownerHeroMetaChip}>
                <Ionicons name="people-outline" size={14} color={Colors.white} />
                <Text style={styles.ownerHeroMetaText}>
                  {tripRequest.numberOfSeats} place{tripRequest.numberOfSeats > 1 ? 's' : ''}
                </Text>
              </View>
              {(tripRequest.selectedPricePerSeat || tripRequest.maxPricePerSeat) && (
                <View style={styles.ownerHeroMetaChip}>
                  <Ionicons name="cash-outline" size={14} color={Colors.white} />
                  <Text style={styles.ownerHeroMetaText}>
                    {tripRequest.selectedPricePerSeat || tripRequest.maxPricePerSeat} FC
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.ownerHeroSteps}>
              {heroSteps.map((step, index) => {
                const active = heroStepIndex >= index;
                return (
                  <View key={step} style={styles.ownerHeroStep}>
                    <View
                      style={[
                        styles.ownerHeroStepDot,
                        active && styles.ownerHeroStepDotActive,
                      ]}
                    />
                    <Text
                      style={[
                        styles.ownerHeroStepText,
                        active && styles.ownerHeroStepTextActive,
                      ]}
                    >
                      {step}
                    </Text>
                  </View>
                );
              })}
            </View>

            {tripRequest.tripId ? (
              <TouchableOpacity
                style={styles.ownerHeroPrimaryButton}
                onPress={() => handleViewTrip(tripRequest.tripId!)}
              >
                <Ionicons name="navigate-outline" size={18} color={Colors.gray[900]} />
                <Text style={styles.ownerHeroPrimaryButtonText}>Suivre la course</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.ownerHeroHintRow}>
                <Ionicons name="notifications-outline" size={16} color={Colors.white} />
                <Text style={styles.ownerHeroHintText}>{ownerHeroHintMessage}</Text>
              </View>
            )}

            {tripRequest.status === 'pending' && (
              <View style={styles.ownerHeroActions}>
                {canEdit && (
                  <TouchableOpacity style={styles.ownerHeroGhostButton} onPress={handleOpenEditForm}>
                    <Ionicons name="create-outline" size={16} color={Colors.white} />
                    <Text style={styles.ownerHeroGhostButtonText}>Modifier</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.ownerHeroGhostButton, styles.ownerHeroGhostButtonDanger]}
                  onPress={handleCancelRequest}
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <>
                      <Ionicons name="close-circle-outline" size={16} color={Colors.white} />
                      <Text style={styles.ownerHeroGhostButtonText}>Annuler</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </LinearGradient>
        ) : (
          <LinearGradient colors={driverHero.colors} style={styles.ownerHeroCard}>
            <View style={styles.ownerHeroTopRow}>
              <View style={styles.ownerHeroStatusBadge}>
                <Text style={styles.ownerHeroStatusText}>{driverHero.badge}</Text>
              </View>
              {!!myOffer?.pricePerSeat && (
                <View style={styles.ownerHeroCounter}>
                  <Ionicons name="cash-outline" size={14} color={Colors.white} />
                  <Text style={styles.ownerHeroCounterText}>{myOffer.pricePerSeat} FC</Text>
                </View>
              )}
            </View>

            <View style={styles.driverHeroPassengerRow}>
              {tripRequest.passengerAvatar ? (
                <Image source={{ uri: tripRequest.passengerAvatar }} style={styles.driverHeroAvatar} />
              ) : (
                <View style={styles.driverHeroAvatar}>
                  <Ionicons name="person" size={18} color={Colors.white} />
                </View>
              )}
              <View style={styles.driverHeroPassengerInfo}>
                <Text style={styles.driverHeroPassengerLabel}>Passager</Text>
                <Text style={styles.driverHeroPassengerName}>{tripRequest.passengerName}</Text>
              </View>
            </View>

            <Text style={styles.ownerHeroTitle}>{driverHero.title}</Text>
            <Text style={styles.ownerHeroSubtitle}>{driverHero.subtitle}</Text>

            <View style={styles.ownerHeroRouteCard}>
              <View style={styles.ownerHeroRouteRow}>
                <View style={[styles.ownerHeroRouteDot, { backgroundColor: Colors.success }]} />
                <View style={styles.ownerHeroRouteInfo}>
                  <Text style={styles.ownerHeroRouteLabel}>Départ</Text>
                  <Text style={styles.ownerHeroRouteText}>{tripRequest.departure.name}</Text>
                </View>
              </View>
              <View style={styles.ownerHeroRouteLine} />
              <View style={styles.ownerHeroRouteRow}>
                <View style={[styles.ownerHeroRouteDot, styles.ownerHeroRouteSquare]} />
                <View style={styles.ownerHeroRouteInfo}>
                  <Text style={styles.ownerHeroRouteLabel}>Destination</Text>
                  <Text style={styles.ownerHeroRouteText}>{tripRequest.arrival.name}</Text>
                </View>
              </View>
            </View>

            <View style={styles.ownerHeroMetaRow}>
              <View style={styles.ownerHeroMetaChip}>
                <Ionicons name="time-outline" size={14} color={Colors.white} />
                <Text style={styles.ownerHeroMetaText}>
                  {formatDateWithRelativeLabel(tripRequest.departureDateMin, true)}
                </Text>
              </View>
              <View style={styles.ownerHeroMetaChip}>
                <Ionicons name="people-outline" size={14} color={Colors.white} />
                <Text style={styles.ownerHeroMetaText}>
                  {tripRequest.numberOfSeats} place{tripRequest.numberOfSeats > 1 ? 's' : ''}
                </Text>
              </View>
              {tripRequest.maxPricePerSeat && (
                <View style={styles.ownerHeroMetaChip}>
                  <Ionicons name="wallet-outline" size={14} color={Colors.white} />
                  <Text style={styles.ownerHeroMetaText}>{tripRequest.maxPricePerSeat} FC max</Text>
                </View>
              )}
            </View>

            {canOpenAssignedTrip ? (
              <TouchableOpacity
                style={styles.ownerHeroPrimaryButton}
                onPress={() => handleViewTrip(tripRequest.tripId!)}
              >
                <Ionicons name="navigate-outline" size={18} color={Colors.gray[900]} />
                <Text style={styles.ownerHeroPrimaryButtonText}>Ouvrir le trajet</Text>
              </TouchableOpacity>
            ) : canStartAssignedTrip ? (
              <TouchableOpacity
                style={styles.ownerHeroPrimaryButton}
                onPress={handleStartTripFromRequest}
                disabled={isStartingTripFromRequest}
              >
                {isStartingTripFromRequest ? (
                  <ActivityIndicator size="small" color={Colors.gray[900]} />
                ) : (
                  <>
                    <Ionicons name="play-circle-outline" size={18} color={Colors.gray[900]} />
                    <Text style={styles.ownerHeroPrimaryButtonText}>Démarrer le trajet</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : canAcceptDirectly ? (
              <>
                <TouchableOpacity
                  style={styles.ownerHeroPrimaryButton}
                  onPress={handleOpenDirectAcceptDialog}
                  disabled={isAcceptingTripRequest || isStartingTrip}
                >
                  {isAcceptingTripRequest || isStartingTrip ? (
                    <ActivityIndicator size="small" color={Colors.gray[900]} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color={Colors.gray[900]} />
                      <Text style={styles.ownerHeroPrimaryButtonText}>Accepter la demande</Text>
                    </>
                  )}
                </TouchableOpacity>
                <View style={[styles.ownerHeroActions, styles.ownerHeroSecondaryActions]}>
                  <TouchableOpacity style={styles.ownerHeroGhostButton} onPress={openOfferForm}>
                    <Ionicons name="options-outline" size={16} color={Colors.white} />
                    <Text style={styles.ownerHeroGhostButtonText}>Faire une proposition</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : canMakeOffer ? (
              <TouchableOpacity style={styles.ownerHeroPrimaryButton} onPress={openOfferForm}>
                <Ionicons name="send-outline" size={18} color={Colors.gray[900]} />
                <Text style={styles.ownerHeroPrimaryButtonText}>
                  {myOffer?.status === 'rejected' ? 'Faire une nouvelle proposition' : 'Faire une proposition'}
                </Text>
              </TouchableOpacity>
            ) : !isDriverRole ? (
              <TouchableOpacity style={styles.ownerHeroPrimaryButton} onPress={() => router.push('/publish')}>
                <Ionicons name="car-outline" size={18} color={Colors.gray[900]} />
                <Text style={styles.ownerHeroPrimaryButtonText}>Devenir conducteur</Text>
              </TouchableOpacity>
            ) : !isIdentityVerified ? (
              <TouchableOpacity style={styles.ownerHeroPrimaryButton} onPress={() => checkIdentity('publish')}>
                <Ionicons name="shield-checkmark-outline" size={18} color={Colors.gray[900]} />
                <Text style={styles.ownerHeroPrimaryButtonText}>Vérifier mon identité</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.ownerHeroHintRow}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.white} />
                <Text style={styles.ownerHeroHintText}>
                  Faites défiler pour consulter tout le détail de la demande et votre proposition.
                </Text>
              </View>
            )}
          </LinearGradient>
        )}

        {/* Carte du trajet */}
        {false && tripRequest?.departure.lat && tripRequest?.departure.lng && tripRequest?.arrival.lat && tripRequest?.arrival.lng && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Carte du trajet</Text>
            <View style={styles.mapCard}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setMapModalVisible(true)}
                style={styles.mapTouchable}
              >
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.mapView}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  initialRegion={{
                    latitude: (tripRequest?.departure.lat + tripRequest?.arrival.lat) / 2,
                    longitude: ((tripRequest?.departure.lng ?? 0) + (tripRequest?.arrival.lng ?? 0)) / 2,
                    latitudeDelta: Math.abs(tripRequest?.departure.lat - tripRequest?.arrival.lat) * 2.5 || 0.1,
                    longitudeDelta: Math.abs(tripRequest?.departure.lng - tripRequest?.arrival.lng) * 2.5 || 0.1,
                  }}
                >
                  {/* Trajectoire réelle de circulation */}
                  {routeCoordinates && routeCoordinates.length > 0 ? (
                    <Polyline
                      coordinates={routeCoordinates}
                      strokeColor={Colors.primary}
                      strokeWidth={4}
                    />
                  ) : (
                    // Fallback sur ligne droite pendant le chargement ou en cas d'erreur
                    <Polyline
                      coordinates={[
                        { latitude: tripRequest.departure.lat, longitude: tripRequest.departure.lng },
                        { latitude: tripRequest.arrival.lat, longitude: tripRequest.arrival.lng },
                      ]}
                      strokeColor={Colors.gray[400]}
                      strokeWidth={3}
                      lineDashPattern={[2, 2]}
                    />
                  )}

                  {/* Marqueur de départ */}
                  <Marker
                    coordinate={{
                      latitude: tripRequest.departure.lat,
                      longitude: tripRequest.departure.lng,
                    }}
                  >
                    <View style={styles.markerStartCircle}>
                      <Ionicons name="location" size={18} color={Colors.white} />
                    </View>
                    <Callout>
                      <View>
                        <Text style={{ fontWeight: 'bold' }}>Départ</Text>
                        <Text>{tripRequest.departure.name}</Text>
                      </View>
                    </Callout>
                  </Marker>

                  {/* Marqueur d'arrivée */}
                  <Marker
                    coordinate={{
                      latitude: tripRequest.arrival.lat,
                      longitude: tripRequest.arrival.lng,
                    }}
                  >
                    <View style={styles.markerEndCircle}>
                      <Ionicons name="navigate" size={18} color={Colors.white} />
                    </View>
                    <Callout>
                      <View>
                        <Text style={{ fontWeight: 'bold' }}>Destination</Text>
                        <Text>{tripRequest.arrival.name}</Text>
                      </View>
                    </Callout>
                  </Marker>
                </MapView>
                <View style={styles.mapOverlay}>
                  <Text style={styles.mapOverlayText}>Touchez pour agrandir</Text>
                </View>
                <View style={styles.expandButton}>
                  <View style={styles.expandButtonInner}>
                    <Ionicons name="expand" size={20} color={Colors.gray[700]} />
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {false && (
          <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations utiles</Text>
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Ionicons name="radio-outline" size={20} color={Colors.gray[600]} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Demande publiée</Text>
                <Text style={styles.detailValue}>
                  {formatDateWithRelativeLabel(tripRequest.createdAt, false)}
                </Text>
              </View>
            </View>
            <View style={styles.detailDivider} />
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
        )}

        {tripRequest.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Note du passager</Text>
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Ionicons name="document-text-outline" size={20} color={Colors.gray[600]} />
                <View style={styles.detailInfo}>
                  <Text style={styles.detailValue}>{tripRequest.description}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Driver sélectionné et trajet créé (pour le propriétaire) */}
        {isOwner && (tripRequest.selectedDriverId || tripRequest.tripId) && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderWithBadge}>
              <View style={styles.sectionTitleContainer}>
                <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
                <Text style={styles.sectionTitle}>
                  {tripRequest.tripId ? 'Course en cours' : 'Conducteur choisi'}
                </Text>
              </View>
            </View>
            <View style={[styles.offerCard, styles.offerCardAccepted]}>
              <View style={styles.offerHeader}>
                <View style={styles.driverInfo}>
                  {tripRequest.selectedDriverAvatar ? (
                    <Image
                      source={{ uri: tripRequest.selectedDriverAvatar }}
                      style={styles.offerAvatar}
                    />
                  ) : (
                    <View style={styles.offerAvatar}>
                      <Ionicons name="person" size={20} color={Colors.gray[500]} />
                    </View>
                  )}
                  <View>
                    <Text style={styles.driverName}>
                      {tripRequest.selectedDriverName || 'Conducteur confirmé'}
                    </Text>
                    {tripRequest.selectedVehicle && (
                      <Text style={styles.ratingText}>
                        {tripRequest.selectedVehicle.brand} {tripRequest.selectedVehicle.model}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              {tripRequest.selectedPricePerSeat && (
                <View style={styles.offerDetail}>
                  <Ionicons name="cash-outline" size={16} color={Colors.gray[600]} />
                  <Text style={styles.offerDetailText}>
                    {tripRequest.selectedPricePerSeat} FC/place
                  </Text>
                </View>
              )}
              {tripRequest.tripId && (
                <View style={styles.tripCreatedContainer}>
                  <View style={styles.tripCreatedInfo}>
                    <Ionicons name="car" size={20} color={Colors.primary} />
                    <Text style={styles.tripCreatedText}>
                      Le conducteur a déjà lancé le trajet. Vous pouvez suivre la course en temps réel.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.viewTripButton}
                    onPress={() => handleViewTrip(tripRequest.tripId!)}
                  >
                    <Ionicons name="arrow-forward" size={18} color={Colors.primary} />
                    <Text style={styles.viewTripButtonText}>Voir le trajet</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Offres reçues (pour le propriétaire) */}
        {false && isOwner && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderWithBadge}>
              <View style={styles.sectionTitleContainer}>
                <Ionicons name="checkmark-circle" size={24} color={Colors.info} />
                <Text style={styles.sectionTitle}>
                  Propositions reçues
                </Text>
              </View>
              {tripRequest.offers && tripRequest.offers.length > 0 && (
                <View style={styles.offersCountBadge}>
                  <Text style={styles.offersCountText}>{tripRequest.offers.length}</Text>
                </View>
              )}
            </View>
            
            {(!tripRequest.offers || tripRequest.offers.length === 0) ? (
              <View style={styles.noOffersContainer}>
                <View style={styles.noOffersIconContainer}>
                  <Ionicons name="hourglass-outline" size={48} color={Colors.gray[400]} />
                </View>
                <Text style={styles.noOffersTitle}>Aucune proposition pour le moment</Text>
                <Text style={styles.noOffersText}>
                  Les conducteurs intéressés verront votre demande et pourront vous envoyer une proposition. Elles apparaîtront ici dès leur arrivée.
                </Text>
              </View>
            ) : (
              <>
            {tripRequest.offers?.map((offer, index) => {
              const isPending = offer.status === 'pending';
              const driverRating = offer.driverRating;
              return (
              <Animated.View
                key={offer.id}
                entering={FadeInDown.delay(index * 50)}
                style={[
                  styles.offerCard,
                  isPending && styles.offerCardPending,
                  offer.status === 'accepted' && styles.offerCardAccepted,
                ]}
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
                      {driverRating !== undefined && driverRating > 0 && (
                        <View style={styles.ratingRow}>
                          <Ionicons name="star" size={14} color={Colors.secondary} />
                          <Text style={styles.ratingText}>{driverRating.toFixed(1)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {offer.status === 'accepted' && (
                    <View style={[styles.statusBadge, { backgroundColor: Colors.success + '15' }]}>
                      <Text style={[styles.statusText, { color: Colors.success }]}>Retenue</Text>
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
                          <Text style={styles.acceptButtonText}>Choisir</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>
            );
            })}
              </>
            )}
          </View>
        )}

        {/* Statut de l'offre du driver (si le driver a déjà fait une offre) */}
        {!isOwner && myOffer && (
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <Ionicons name="star" size={24} color={Colors.secondary} />
              <Text style={styles.sectionTitle}>Votre proposition</Text>
            </View>
            <View style={[
              styles.offerCard,
              myOffer.status === 'accepted' && styles.offerCardAccepted,
              myOffer.status === 'rejected' && styles.offerCardRejected,
            ]}>
              <View style={styles.offerHeader}>
                <View>
                  <Text style={styles.driverName}>Statut de votre proposition</Text>
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
                      ? 'Retenue'
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
              {myOffer.status === 'accepted' && (tripRequest.status === 'driver_selected' || !!tripRequest.tripId) && (
                <View style={styles.successMessage}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  <Text style={styles.successMessageText}>
                    Félicitations ! Votre proposition a été retenue. {tripRequest.tripId ? 'Le trajet a déjà été créé.' : 'Vous pouvez maintenant démarrer le trajet.'}
                  </Text>
                  {!tripRequest.tripId && (
                    <TouchableOpacity
                      style={styles.startTripButton}
                      onPress={handleStartTripFromRequest}
                      disabled={isStartingTripFromRequest}
                    >
                      {isStartingTripFromRequest ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <>
                          <Ionicons name="play-circle" size={18} color={Colors.white} />
                          <Text style={styles.startTripButtonText}>Démarrer le trajet</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                  {tripRequest.tripId && (
                    <TouchableOpacity
                      style={styles.viewTripButton}
                  onPress={() => handleViewTrip(tripRequest.tripId!)}
                    >
                      <Ionicons name="car" size={18} color={Colors.primary} />
                      <Text style={styles.viewTripButtonText}>Voir le trajet</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Aide contextuelle pour les conducteurs non éligibles */}
        {!isOwner && !myOffer && !canMakeOffer && (
          <View style={styles.section}>
            {!(currentUser?.role === 'driver' || currentUser?.role === 'both') ? (
              <View style={styles.driverRequiredCard}>
                <View style={styles.driverRequiredIconContainer}>
                  <Ionicons name="car-outline" size={32} color={Colors.primary} />
                </View>
                <Text style={styles.driverRequiredTitle}>Conducteur requis</Text>
                <Text style={styles.driverRequiredText}>
                  Seuls les conducteurs peuvent proposer un covoiturage sur cette demande. Activez votre compte conducteur pour proposer vos places.
                </Text>
                <TouchableOpacity
                  style={styles.becomeDriverButton}
                  onPress={() => router.push('/publish')}
                >
                  <Ionicons name="car" size={18} color={Colors.white} />
                  <Text style={styles.becomeDriverButtonText}>Devenir conducteur</Text>
                </TouchableOpacity>
              </View>
            ) : !isIdentityVerified ? (
              <View style={styles.driverRequiredCard}>
                <View style={styles.driverRequiredIconContainer}>
                  <Ionicons name="shield-checkmark-outline" size={32} color={Colors.warning} />
                </View>
                <Text style={styles.driverRequiredTitle}>Vérification d&apos;identité requise</Text>
                <Text style={styles.driverRequiredText}>
                  Vous devez compléter la vérification de votre identité (KYC) avant de pouvoir proposer un covoiturage.
                </Text>
                <TouchableOpacity
                  style={styles.becomeDriverButton}
                  onPress={() => checkIdentity('publish')}
                >
                  <Ionicons name="shield-checkmark" size={18} color={Colors.white} />
                  <Text style={styles.becomeDriverButtonText}>Vérifier mon identité</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}

        {/* Modal pour créer une offre */}
        {tripRequest && (
          <Modal
            visible={showOfferForm}
            animationType="slide"
            transparent={true}
            onRequestClose={closeOfferForm}
          >
            <View style={styles.modalOverlay}>
              <TouchableOpacity
                style={styles.modalBackdrop}
                activeOpacity={1}
                onPress={closeOfferForm}
              />
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.modalKeyboardView}
              >
                <SafeAreaView edges={['bottom']} style={styles.modalContent}>
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={(e) => e.stopPropagation()}
                    style={styles.modalContentInner}
                  >
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Faire une proposition</Text>
                      <TouchableOpacity
                        style={styles.modalCloseButton}
                        onPress={closeOfferForm}
                      >
                        <Ionicons name="close" size={24} color={Colors.gray[600]} />
                      </TouchableOpacity>
                    </View>

                    {/* Indicateur d'étapes */}
                    <View style={styles.offerStepIndicator}>
                      <View style={styles.offerStepContainer}>
                        <View style={[styles.offerStepCircle, offerStep === 'details' && styles.offerStepCircleActive]}>
                          {offerStep === 'preview' ? (
                            <Ionicons name="checkmark" size={16} color={Colors.white} />
                          ) : (
                            <Text style={[styles.offerStepNumber, offerStep === 'details' && styles.offerStepNumberActive]}>1</Text>
                          )}
                        </View>
                        <Text style={[styles.offerStepLabel, offerStep === 'details' && styles.offerStepLabelActive]}>Détails</Text>
                      </View>
                      <View style={[styles.offerStepLine, offerStep === 'preview' && styles.offerStepLineActive]} />
                      <View style={styles.offerStepContainer}>
                        <View style={[styles.offerStepCircle, offerStep === 'preview' && styles.offerStepCircleActive]}>
                          <Text style={[styles.offerStepNumber, offerStep === 'preview' && styles.offerStepNumberActive]}>2</Text>
                        </View>
                        <Text style={[styles.offerStepLabel, offerStep === 'preview' && styles.offerStepLabelActive]}>Confirmation</Text>
                      </View>
                    </View>

                    <ScrollView
                      style={styles.modalScrollView}
                      contentContainerStyle={[
                        styles.modalScrollContent,
                        { paddingBottom: Math.max(insets.bottom, 16) + 16 }
                      ]}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                    >
                      <View style={styles.offerFormCard}>
                        {offerStep === 'details' && (
                          <>
                            {activeVehicles.length > 0 && (
                              <View style={styles.formGroup}>
                                <Text style={styles.formLabel}>Véhicule (optionnel)</Text>
                                <ScrollView
                                  horizontal
                                  showsHorizontalScrollIndicator={false}
                                  style={styles.vehicleScrollView}
                                  contentContainerStyle={styles.vehicleScrollContent}
                                >
                                  {activeVehicles.map((vehicle: Vehicle) => (
                                    <TouchableOpacity
                                      key={vehicle.id}
                                      style={[
                                        styles.vehicleCard,
                                        selectedVehicleId === vehicle.id && styles.vehicleCardActive,
                                      ]}
                                      onPress={() =>
                                        setSelectedVehicleId(
                                          selectedVehicleId === vehicle.id ? '' : vehicle.id
                                        )
                                      }
                                    >
                                      <View style={styles.vehicleCardHeader}>
                                        <Ionicons
                                          name="car"
                                          size={24}
                                          color={selectedVehicleId === vehicle.id ? Colors.primary : Colors.gray[600]}
                                        />
                                        {selectedVehicleId === vehicle.id && (
                                          <View style={styles.vehicleCardBadge}>
                                            <Ionicons name="checkmark" size={14} color={Colors.white} />
                                          </View>
                                        )}
                                      </View>
                                      <Text style={styles.vehicleCardBrand}>{vehicle.brand}</Text>
                                      <Text style={styles.vehicleCardModel}>{vehicle.model}</Text>
                                      <Text style={styles.vehicleCardDetails}>
                                        {vehicle.color} • {vehicle.licensePlate}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </ScrollView>
                              </View>
                            )}

                            <View style={styles.acceptanceNotice}>
                              <Ionicons name="information-circle" size={24} color={Colors.info} />
                              <Text style={styles.acceptanceNoticeText}>
                                Le demandeur a publié un besoin. Vous proposez votre horaire, vos places et votre participation par place. Rien n&apos;est confirmé tant qu&apos;il n&apos;a pas choisi votre proposition.
                              </Text>
                            </View>

                            <View style={styles.formGroup}>
                              <Text style={styles.formLabel}>Date et heure de départ proposées *</Text>
                              {tripRequest && (
                                <Text style={styles.formHelperText}>
                                  Choisissez une date et une heure entre le {formatDateWithRelativeLabel(tripRequest.departureDateMin, true)} et le {formatDateWithRelativeLabel(tripRequest.departureDateMax, true)}
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
                              <Text style={styles.formLabel}>Places proposées *</Text>
                              <Text style={styles.formHelperText}>
                                Cette demande concerne au moins {minimumSeatsRequired} place(s).
                              </Text>
                              <TextInput
                                style={styles.input}
                                keyboardType="number-pad"
                                placeholder={`Au moins ${minimumSeatsRequired}`}
                                value={availableSeats}
                                onChangeText={setAvailableSeats}
                              />
                            </View>

                            <View style={styles.formGroup}>
                              <Text style={styles.formLabel}>Participation proposée par place *</Text>
                              <Text style={styles.formHelperText}>
                                {tripRequest.maxPricePerSeat
                                  ? `Le demandeur a indiqué un budget maximum de ${tripRequest.maxPricePerSeat} FC par place.`
                                  : 'Indiquez le montant demandé par place pour ce covoiturage.'}
                              </Text>
                              <TextInput
                                style={styles.input}
                                keyboardType="number-pad"
                                placeholder="Ex: 2000"
                                value={pricePerSeat}
                                onChangeText={setPricePerSeat}
                              />
                            </View>

                            <View style={styles.formGroup}>
                              <Text style={styles.formLabel}>Message (optionnel)</Text>
                              <TextInput
                                style={[styles.input, styles.textArea]}
                                multiline
                                numberOfLines={4}
                                placeholder="Ajoutez un message pour rassurer ou préciser votre proposition..."
                                value={message}
                                onChangeText={setMessage}
                              />
                            </View>

                            <View style={styles.formActions}>
                              <TouchableOpacity
                                style={styles.cancelFormButton}
                                onPress={() => {
                                  closeOfferForm();
                                }}
                              >
                                <Text style={styles.cancelFormButtonText}>Annuler</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.nextButton, !isOfferDraftValid && styles.submitButtonDisabled]}
                                onPress={() => {
                                  if (isOfferDraftValid) {
                                    setOfferStep('preview');
                                  }
                                }}
                                disabled={!isOfferDraftValid}
                              >
                                <Text style={styles.nextButtonText}>Suivant</Text>
                                <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                              </TouchableOpacity>
                            </View>
                          </>
                        )}


                        {offerStep === 'preview' && (
                          <>
                            <View style={styles.previewContainer}>
                              <Text style={styles.previewTitle}>Confirmer votre proposition</Text>
                              
                              {/* Information importante */}
                              <View style={styles.acceptanceNotice}>
                                <Ionicons name="information-circle" size={24} color={Colors.info} />
                                <Text style={styles.acceptanceNoticeText}>
                                  Votre proposition sera envoyée au demandeur. Un trajet ne sera créé que s&apos;il la retient.
                                </Text>
                              </View>

                              {/* Informations du véhicule */}
                              {selectedVehicleId && (
                                <View style={styles.previewSection}>
                                  <Text style={styles.previewSectionTitle}>Véhicule</Text>
                                  {activeVehicles.find(v => v.id === selectedVehicleId) && (
                                    <View style={styles.previewVehicleCard}>
                                      <Ionicons name="car" size={24} color={Colors.primary} />
                                      <View style={styles.previewVehicleInfo}>
                                        <Text style={styles.previewVehicleBrand}>
                                          {activeVehicles.find(v => v.id === selectedVehicleId)?.brand} {activeVehicles.find(v => v.id === selectedVehicleId)?.model}
                                        </Text>
                                        <Text style={styles.previewVehicleDetails}>
                                          {activeVehicles.find(v => v.id === selectedVehicleId)?.color} • {activeVehicles.find(v => v.id === selectedVehicleId)?.licensePlate}
                                        </Text>
                                      </View>
                                    </View>
                                  )}
                                </View>
                              )}

                              {/* Date et heure */}
                              <View style={styles.previewSection}>
                                <Text style={styles.previewSectionTitle}>Départ proposé</Text>
                                <View style={styles.previewInfoCard}>
                                  <Ionicons name="calendar" size={20} color={Colors.primary} />
                                  <Text style={styles.previewInfoText}>
                                    {formatDateWithRelativeLabel(proposedDepartureDate.toISOString(), true)}
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.previewSection}>
                                <Text style={styles.previewSectionTitle}>Places proposées</Text>
                                <View style={styles.previewInfoCard}>
                                  <Ionicons name="people" size={20} color={Colors.primary} />
                                  <Text style={styles.previewInfoText}>
                                    {availableSeats} place(s)
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.previewSection}>
                                <Text style={styles.previewSectionTitle}>Participation proposée</Text>
                                <View style={styles.previewTotalCard}>
                                  <Text style={styles.previewTotalLabel}>Par place</Text>
                                  <Text style={styles.previewTotalAmount}>
                                    {Number.parseFloat(pricePerSeat || '0').toLocaleString('fr-FR')} FC
                                  </Text>
                                </View>
                              </View>

                              {/* Message */}
                              {message && (
                                <View style={styles.previewSection}>
                                  <Text style={styles.previewSectionTitle}>Message</Text>
                                  <View style={styles.previewInfoCard}>
                                    <Ionicons name="chatbox" size={20} color={Colors.primary} />
                                    <Text style={styles.previewInfoText}>{message}</Text>
                                  </View>
                                </View>
                              )}
                            </View>

                            <View style={styles.formActions}>
                              <TouchableOpacity
                                style={styles.offerBackButton}
                                onPress={() => setOfferStep('details')}
                              >
                                <Ionicons name="arrow-back" size={18} color={Colors.gray[700]} />
                                <Text style={styles.offerBackButtonText}>Retour</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.submitButton, !isOfferDraftValid && styles.submitButtonDisabled]}
                                onPress={handleCreateOffer}
                                disabled={isCreatingOffer || !isOfferDraftValid}
                              >
                                {isCreatingOffer ? (
                                  <ActivityIndicator size="small" color={Colors.white} />
                                ) : (
                                  <>
                                    <Ionicons name="send" size={18} color={Colors.white} />
                                    <Text style={styles.submitButtonText}>Envoyer la proposition</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </View>
                    </ScrollView>
                  </TouchableOpacity>
                </SafeAreaView>
              </KeyboardAvoidingView>
            </View>
          </Modal>
        )}

        {/* Modal de la carte en plein écran */}
        {tripRequest.departure.lat && tripRequest.departure.lng && tripRequest.arrival.lat && tripRequest.arrival.lng && (
          <Modal visible={mapModalVisible} animationType="fade" transparent onRequestClose={() => setMapModalVisible(false)}>
            <View style={styles.mapModalOverlay}>
              <View style={styles.mapModalContent}>
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.fullscreenMap}
                  mapType="standard"
                  initialRegion={{
                    latitude: (tripRequest.departure.lat + tripRequest.arrival.lat) / 2,
                    longitude: (tripRequest.departure.lng + tripRequest.arrival.lng) / 2,
                    latitudeDelta: Math.abs(tripRequest.departure.lat - tripRequest.arrival.lat) * 2.5 || 0.1,
                    longitudeDelta: Math.abs(tripRequest.departure.lng - tripRequest.arrival.lng) * 2.5 || 0.1,
                  }}
                >
                  {/* Trajectoire réelle de circulation */}
                  {routeCoordinates && routeCoordinates.length > 0 ? (
                    <Polyline
                      coordinates={routeCoordinates}
                      strokeColor={Colors.primary}
                      strokeWidth={5}
                    />
                  ) : (
                    // Fallback sur ligne droite pendant le chargement ou en cas d'erreur
                    <Polyline
                      coordinates={[
                        { latitude: tripRequest.departure.lat, longitude: tripRequest.departure.lng },
                        { latitude: tripRequest.arrival.lat, longitude: tripRequest.arrival.lng },
                      ]}
                      strokeColor={Colors.gray[400]}
                      strokeWidth={4}
                      lineDashPattern={[2, 2]}
                    />
                  )}

                  {/* Marqueur de départ */}
                  <Marker
                    coordinate={{
                      latitude: tripRequest.departure.lat,
                      longitude: tripRequest.departure.lng,
                    }}
                  >
                    <View style={styles.markerStartCircle}>
                      <Ionicons name="location" size={18} color={Colors.white} />
                    </View>
                    <Callout>
                      <View>
                        <Text style={{ fontWeight: 'bold' }}>Départ</Text>
                        <Text>{tripRequest.departure.name}</Text>
                      </View>
                    </Callout>
                  </Marker>

                  {/* Marqueur d'arrivée */}
                  <Marker
                    coordinate={{
                      latitude: tripRequest.arrival.lat,
                      longitude: tripRequest.arrival.lng,
                    }}
                  >
                    <View style={styles.markerEndCircle}>
                      <Ionicons name="navigate" size={18} color={Colors.white} />
                    </View>
                    <Callout>
                      <View>
                        <Text style={{ fontWeight: 'bold' }}>Destination</Text>
                        <Text>{tripRequest.arrival.name}</Text>
                      </View>
                    </Callout>
                  </Marker>
                </MapView>
                <TouchableOpacity style={styles.closeMapButton} onPress={() => setMapModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.white} />
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

        {/* Modal de modification de la demande */}
        {showEditForm && tripRequest && (
          <Modal
            visible={showEditForm}
            animationType="slide"
            transparent
            onRequestClose={() => setShowEditForm(false)}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalOverlay}
            >
              <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => setShowEditForm(false)}
              >
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={(e) => e.stopPropagation()}
                  style={styles.modalContent}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Modifier la demande</Text>
                    <TouchableOpacity
                      style={styles.modalCloseButton}
                      onPress={() => setShowEditForm(false)}
                    >
                      <Ionicons name="close" size={24} color={Colors.gray[600]} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    style={styles.modalScrollView}
                    contentContainerStyle={[
                      styles.modalScrollContent,
                      { paddingBottom: Math.max(insets.bottom, 16) + 16 }
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    {/* Sélection du lieu de départ */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Lieu de départ *</Text>
                      <TouchableOpacity
                        style={styles.locationButton}
                        onPress={() => {
                          setEditLocationPickerType('departure');
                          setEditActivePicker('departure');
                        }}
                      >
                        <Ionicons name="location" size={20} color={Colors.primary} />
                        <Text style={styles.locationButtonText}>
                          {editDepartureLocation?.title || 'Sélectionner le lieu de départ'}
                        </Text>
                        <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
                      </TouchableOpacity>
                    </View>

                    {/* Sélection du lieu d'arrivée */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Lieu d&apos;arrivée *</Text>
                      <TouchableOpacity
                        style={styles.locationButton}
                        onPress={() => {
                          setEditLocationPickerType('arrival');
                          setEditActivePicker('arrival');
                        }}
                      >
                        <Ionicons name="navigate" size={20} color={Colors.primary} />
                        <Text style={styles.locationButtonText}>
                          {editArrivalLocation?.title || "Sélectionner le lieu d'arrivée"}
                        </Text>
                        <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
                      </TouchableOpacity>
                    </View>

                    {/* Date et heure de départ min */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Date/heure de départ (min) *</Text>
                      <View style={styles.dateTimeContainer}>
                        <TouchableOpacity
                          style={styles.dateTimeButton}
                          onPress={() => openEditDateOrTimePickerMin('date')}
                        >
                          <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                          <Text style={styles.dateTimeText}>
                            {editDepartureDateMin
                              ? editDepartureDateMin.toLocaleDateString('fr-FR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                })
                              : 'Date'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.dateTimeButton}
                          onPress={() => openEditDateOrTimePickerMin('time')}
                        >
                          <Ionicons name="time-outline" size={20} color={Colors.primary} />
                          <Text style={styles.dateTimeText}>
                            {editDepartureDateMin
                              ? editDepartureDateMin.toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Heure'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {Platform.OS === 'ios' && editIosPickerModeMin && editDepartureDateMin && (
                        <View style={styles.iosPickerContainer}>
                          <DateTimePicker
                            value={editDepartureDateMin}
                            mode={editIosPickerModeMin}
                            display="spinner"
                            onChange={handleEditIosPickerChangeMin}
                            minimumDate={new Date()}
                          />
                          <TouchableOpacity
                            style={styles.iosPickerCloseButton}
                            onPress={() => setEditIosPickerModeMin(null)}
                          >
                            <Text style={styles.iosPickerCloseText}>Confirmer</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {/* Date et heure de départ max */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Date/heure de départ (max) *</Text>
                      <View style={styles.dateTimeContainer}>
                        <TouchableOpacity
                          style={styles.dateTimeButton}
                          onPress={() => openEditDateOrTimePickerMax('date')}
                        >
                          <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                          <Text style={styles.dateTimeText}>
                            {editDepartureDateMax
                              ? editDepartureDateMax.toLocaleDateString('fr-FR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                })
                              : 'Date'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.dateTimeButton}
                          onPress={() => openEditDateOrTimePickerMax('time')}
                        >
                          <Ionicons name="time-outline" size={20} color={Colors.primary} />
                          <Text style={styles.dateTimeText}>
                            {editDepartureDateMax
                              ? editDepartureDateMax.toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Heure'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {Platform.OS === 'ios' && editIosPickerModeMax && editDepartureDateMax && (
                        <View style={styles.iosPickerContainer}>
                          <DateTimePicker
                            value={editDepartureDateMax}
                            mode={editIosPickerModeMax}
                            display="spinner"
                            onChange={handleEditIosPickerChangeMax}
                            minimumDate={editDepartureDateMin || new Date()}
                          />
                          <TouchableOpacity
                            style={styles.iosPickerCloseButton}
                            onPress={() => setEditIosPickerModeMax(null)}
                          >
                            <Text style={styles.iosPickerCloseText}>Confirmer</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {/* Nombre de places */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Nombre de places *</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        placeholder="Ex: 1"
                        value={editNumberOfSeats}
                        onChangeText={setEditNumberOfSeats}
                      />
                    </View>

                    {/* Prix maximum par place */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Prix maximum par place (FC)</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        placeholder="Ex: 5000"
                        value={editMaxPricePerSeat}
                        onChangeText={setEditMaxPricePerSeat}
                      />
                    </View>

                    {/* Description */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Description (optionnel)</Text>
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        multiline
                        numberOfLines={4}
                        placeholder="Ajoutez des informations supplémentaires..."
                        value={editDescription}
                        onChangeText={setEditDescription}
                      />
                    </View>

                    <View style={styles.formActions}>
                      <TouchableOpacity
                        style={styles.cancelFormButton}
                        onPress={() => {
                          setShowEditForm(false);
                          setEditDepartureLocation(null);
                          setEditArrivalLocation(null);
                          setEditDepartureDateMin(null);
                          setEditDepartureDateMax(null);
                          setEditNumberOfSeats('');
                          setEditMaxPricePerSeat('');
                          setEditDescription('');
                        }}
                      >
                        <Text style={styles.cancelFormButtonText}>Annuler</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.submitButton,
                          (!editDepartureLocation ||
                            !editArrivalLocation ||
                            !editDepartureDateMin ||
                            !editDepartureDateMax ||
                            !editNumberOfSeats ||
                            parseInt(editNumberOfSeats) <= 0)
                            ? styles.submitButtonDisabled
                            : undefined,
                        ]}
                        onPress={handleUpdateRequest}
                        disabled={Boolean(
                          isUpdating ||
                            !editDepartureLocation ||
                            !editArrivalLocation ||
                            !editDepartureDateMin ||
                            !editDepartureDateMax ||
                            !editNumberOfSeats ||
                            parseInt(editNumberOfSeats) <= 0
                        )}
                      >
                        {isUpdating ? (
                          <ActivityIndicator size="small" color={Colors.white} />
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={18} color={Colors.white} />
                            <Text style={styles.submitButtonText}>Enregistrer</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </TouchableOpacity>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </Modal>
        )}

        {/* Location Picker Modal pour la modification */}
        {editLocationPickerType && (
          <LocationPickerModal
            visible={editActivePicker !== null}
            onClose={() => {
              setEditActivePicker(null);
              setEditLocationPickerType(null);
            }}
            onSelect={(location) => {
              if (editLocationPickerType === 'departure') {
                setEditDepartureLocation(location);
              } else {
                setEditArrivalLocation(location);
              }
              setEditActivePicker(null);
              setEditLocationPickerType(null);
            }}
            initialLocation={
              editLocationPickerType === 'departure' ? editDepartureLocation : editArrivalLocation
            }
          />
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
  // Styles pour le formulaire d'offre en deux étapes
  offerStepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  offerStepContainer: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  offerStepCircle: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.gray[300],
  },
  offerStepCircleActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  offerStepNumber: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[600],
  },
  offerStepNumberActive: {
    color: Colors.white,
  },
  offerStepLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
  },
  offerStepLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  offerStepLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.gray[300],
    marginHorizontal: Spacing.md,
    maxWidth: 60,
  },
  offerStepLineActive: {
    backgroundColor: Colors.primary,
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  nextButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  offerBackButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
  },
  offerBackButtonText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
    fontSize: FontSizes.base,
  },
  // Styles pour la preview
  previewContainer: {
    gap: Spacing.lg,
  },
  previewTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
  },
  acceptanceNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.info + '10',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.info + '30',
    marginBottom: Spacing.md,
  },
  acceptanceNoticeText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.info,
    lineHeight: 20,
    fontWeight: FontWeights.medium,
  },
  previewSection: {
    marginBottom: Spacing.lg,
  },
  previewSectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginBottom: Spacing.md,
  },
  previewVehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.primary + '08',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  previewVehicleInfo: {
    flex: 1,
  },
  previewVehicleBrand: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  previewVehicleDetails: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  previewInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  previewInfoText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
  },
  previewTotalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
    marginTop: Spacing.sm,
  },
  previewTotalLabel: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  previewTotalAmount: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  previewMessageCard: {
    padding: Spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  previewMessageText: {
    fontSize: FontSizes.base,
    color: Colors.gray[700],
    lineHeight: 22,
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
  ownerHeroCard: {
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  ownerHeroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ownerHeroStatusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  ownerHeroStatusText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  ownerHeroCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ownerHeroCounterText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  ownerHeroTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    lineHeight: 30,
  },
  ownerHeroSubtitle: {
    fontSize: FontSizes.sm,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 20,
  },
  ownerHeroRouteCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
  },
  ownerHeroRouteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  ownerHeroRouteDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 5,
    backgroundColor: Colors.white,
  },
  ownerHeroRouteSquare: {
    borderRadius: 3,
    backgroundColor: Colors.white,
  },
  ownerHeroRouteInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  ownerHeroRouteLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
  },
  ownerHeroRouteText: {
    marginTop: 4,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.white,
  },
  ownerHeroRouteLine: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.24)',
    marginLeft: 5,
    marginVertical: 6,
  },
  ownerHeroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  ownerHeroMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ownerHeroMetaText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  ownerHeroSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  ownerHeroStep: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  ownerHeroStepDot: {
    width: '100%',
    height: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  ownerHeroStepDotActive: {
    backgroundColor: Colors.white,
  },
  ownerHeroStepText: {
    fontSize: FontSizes.xs,
    color: 'rgba(255,255,255,0.68)',
    fontWeight: FontWeights.medium,
  },
  ownerHeroStepTextActive: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  ownerHeroPrimaryButton: {
    minHeight: 52,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  ownerHeroPrimaryButtonText: {
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  ownerHeroHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  ownerHeroHintText: {
    flex: 1,
    color: 'rgba(255,255,255,0.9)',
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  ownerHeroActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  ownerHeroSecondaryActions: {
    marginTop: Spacing.sm,
  },
  ownerHeroGhostButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  ownerHeroGhostButtonDanger: {
    backgroundColor: 'rgba(239,68,68,0.16)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  ownerHeroGhostButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  driverHeroPassengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  driverHeroAvatar: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  driverHeroPassengerInfo: {
    flex: 1,
  },
  driverHeroPassengerLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
  },
  driverHeroPassengerName: {
    marginTop: 2,
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
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
  ownerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  editButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
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
  sectionHeaderWithBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
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
    backgroundColor: '#FFFCF8',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '12',
    ...CommonStyles.shadowSm,
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
    backgroundColor: Colors.gray[100],
    marginVertical: Spacing.md,
    marginLeft: 28,
  },
  offerCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  offerCardPending: {
    borderColor: Colors.info,
    borderWidth: 2,
    backgroundColor: Colors.info + '08',
    shadowColor: Colors.info,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  offerCardAccepted: {
    borderColor: Colors.success,
    borderWidth: 2,
    backgroundColor: Colors.success + '08',
    shadowColor: Colors.success,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  offerCardRejected: {
    borderColor: Colors.danger,
    borderWidth: 2,
    backgroundColor: Colors.danger + '08',
    shadowColor: Colors.danger,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  offersCountBadge: {
    backgroundColor: Colors.info,
    borderRadius: BorderRadius.full,
    minWidth: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  offersCountText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
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
    padding: Spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.gray[200],
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
    minHeight: 48,
    borderRadius: BorderRadius.xl,
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
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginTop: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.success + '20',
  },
  successMessageText: {
    fontSize: FontSizes.sm,
    color: Colors.success,
    fontWeight: FontWeights.medium,
    marginBottom: Spacing.sm,
  },
  startTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
    minHeight: 46,
  },
  startTripButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
  },
  viewTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: Spacing.xs,
  },
  viewTripButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
  },
  tripCreatedContainer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  tripCreatedInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tripCreatedText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    lineHeight: 20,
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
  driverRequiredCard: {
    backgroundColor: '#FFFCF8',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary + '12',
    ...CommonStyles.shadowSm,
  },
  driverRequiredIconContainer: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  driverRequiredTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  driverRequiredText: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  becomeDriverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    minWidth: 200,
  },
  becomeDriverButtonText: {
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
  vehicleScrollView: {
    marginHorizontal: -Spacing.lg,
  },
  vehicleScrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  vehicleCard: {
    width: 140,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.xl,
    gap: Spacing.xs,
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  vehicleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
    shadowColor: Colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    transform: [{ scale: 1.02 }],
  },
  vehicleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleCardBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleCardBrand: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  vehicleCardModel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  vehicleCardDetails: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
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
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    gap: Spacing.sm,
  },
  locationButtonText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    gap: Spacing.sm,
  },
  dateTimeText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
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
  formLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  priceHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.info + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  priceHintText: {
    fontSize: FontSizes.xs,
    color: Colors.info,
    fontWeight: FontWeights.medium,
  },
  priceSuggestionsContainer: {
    marginBottom: Spacing.sm,
  },
  priceSuggestionsLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  priceSuggestions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  priceSuggestionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  priceSuggestionButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  priceSuggestionText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  priceSuggestionTextActive: {
    color: Colors.white,
  },
  inputError: {
    borderColor: Colors.danger,
    backgroundColor: Colors.danger + '05',
  },
  errorText: {
    fontSize: FontSizes.xs,
    color: Colors.danger,
    marginTop: Spacing.xs,
  },
  priceComparisonContainer: {
    marginTop: Spacing.sm,
  },
  priceComparisonBar: {
    height: 6,
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  priceComparisonFill: {
    height: '100%',
    borderRadius: BorderRadius.sm,
  },
  priceComparisonText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  seatsSuggestionsContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  seatsSuggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  seatsSuggestionButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  seatsSuggestionText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  seatsSuggestionTextActive: {
    color: Colors.white,
  },
  offerSummary: {
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  offerSummaryTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
  },
  offerSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  offerSummaryText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  offerSummaryTotal: {
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    fontSize: FontSizes.base,
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
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.gray[400],
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: FontSizes.base,
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalKeyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '100%',
    minHeight: '95%',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  modalContentInner: {
    flex: 1,
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
  noOffersContainer: {
    backgroundColor: '#FFFCF8',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.info + '18',
    ...CommonStyles.shadowSm,
  },
  noOffersIconContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  noOffersTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  noOffersText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 20,
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
  mapCard: {
    height: 220,
    borderRadius: BorderRadius.xxl,
    overflow: 'hidden',
    backgroundColor: Colors.gray[200],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  mapTouchable: {
    flex: 1,
  },
  mapView: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
  },
  mapOverlayText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
  },
  expandButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    zIndex: 1,
  },
  expandButtonInner: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
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
    zIndex: 1,
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
});
