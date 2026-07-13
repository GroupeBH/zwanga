import type { AddressInputMode } from '@/components/AddressEntryModeSelector';
import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useStartTripMutation } from '@/store/api/tripApi';
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
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useGetVehiclesQuery } from '@/store/api/vehicleApi';
import type { Vehicle } from '@/types';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { createBecomeDriverAction, isDriverRequiredError } from '@/utils/errorHelpers';
import { getTripRequestCreateHref } from '@/utils/requestNavigation';
import { getRouteCoordinates } from '@/utils/routeApi';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import type { LatLng, Region } from 'react-native-maps';
import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type RequestRouteMapData = {
  arrivalCoordinate: LatLng;
  departureCoordinate: LatLng;
  fallbackCoordinates: LatLng[];
  initialRegion: Region;
};

type RouteOverridePickerTarget =
  | 'offerDeparture'
  | 'offerArrival'
  | 'directDeparture'
  | 'directArrival';

const LANDMARK_PLACEHOLDER = 'Ex: devant la station, portail bleu, entr\u00E9e principale';

function getLocationText(selection: MapLocationSelection | null, manualAddress: string) {
  return (manualAddress.trim() || selection?.title || selection?.address || '').trim();
}

function getLocationCoordinates(selection: MapLocationSelection | null): [number, number] | undefined {
  if (!selection || !Number.isFinite(selection.latitude) || !Number.isFinite(selection.longitude)) {
    return undefined;
  }
  return [selection.longitude, selection.latitude];
}

export default function TripRequestDetailsScreen() {
  const router = useRouter();
  const goHome = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);
  const openDriverOnboarding = useCallback(() => {
    router.push({
      pathname: '/profile',
      params: { openDriverOnboarding: '1' },
    } as any);
  }, [router]);
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
  const [editDepartureManualAddress, setEditDepartureManualAddress] = useState('');
  const [editDepartureReference, setEditDepartureReference] = useState('');
  const [editArrivalManualAddress, setEditArrivalManualAddress] = useState('');
  const [editArrivalReference, setEditArrivalReference] = useState('');
  const [editAddressInputMode, setEditAddressInputMode] = useState<AddressInputMode>('map');
  const [editDepartureDateMin, setEditDepartureDateMin] = useState<Date | null>(null);
  const [editDepartureDateMax, setEditDepartureDateMax] = useState<Date | null>(null);
  const [editNumberOfSeats, setEditNumberOfSeats] = useState('');
  const [editMaxPricePerSeat, setEditMaxPricePerSeat] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIosPickerModeMin, setEditIosPickerModeMin] = useState<'date' | 'time' | null>(null);
  const [editIosPickerModeMax, setEditIosPickerModeMax] = useState<'date' | 'time' | null>(null);
  const [editActivePicker, setEditActivePicker] = useState<'departure' | 'arrival' | null>(null);
  const [editLocationPickerType, setEditLocationPickerType] = useState<'departure' | 'arrival' | null>(null);
  const editPickerTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editPickerRestorePendingRef = useRef(false);

  useEffect(() => () => {
    if (editPickerTransitionTimerRef.current) {
      clearTimeout(editPickerTransitionTimerRef.current);
    }
  }, []);

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
  const [offerDepartureLocation, setOfferDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [offerDepartureReference, setOfferDepartureReference] = useState('');
  const [offerArrivalLocation, setOfferArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [offerArrivalReference, setOfferArrivalReference] = useState('');
  const [directAcceptDepartureLocation, setDirectAcceptDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [directAcceptDepartureReference, setDirectAcceptDepartureReference] = useState('');
  const [directAcceptArrivalLocation, setDirectAcceptArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [directAcceptArrivalReference, setDirectAcceptArrivalReference] = useState('');
  const [routeOverridePickerTarget, setRouteOverridePickerTarget] = useState<RouteOverridePickerTarget | null>(null);
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
  const editDepartureAddress =
    editAddressInputMode === 'manual'
      ? editDepartureManualAddress.trim()
      : getLocationText(editDepartureLocation, editDepartureManualAddress);
  const editArrivalAddress =
    editAddressInputMode === 'manual'
      ? editArrivalManualAddress.trim()
      : getLocationText(editArrivalLocation, editArrivalManualAddress);

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
    setOfferDepartureLocation(null);
    setOfferDepartureReference('');
    setOfferArrivalLocation(null);
    setOfferArrivalReference('');
    setIosPickerMode(null);
    setProposedDepartureDate(minDate > currentDate ? minDate : currentDate);
  }, [tripRequest]);

  const closeOfferForm = useCallback(() => {
    setShowOfferForm(false);
    resetOfferForm();
  }, [resetOfferForm]);

  const handleRouteOverrideSelected = (location: MapLocationSelection) => {
    switch (routeOverridePickerTarget) {
      case 'offerDeparture':
        setOfferDepartureLocation(location);
        break;
      case 'offerArrival':
        setOfferArrivalLocation(location);
        break;
      case 'directDeparture':
        setDirectAcceptDepartureLocation(location);
        break;
      case 'directArrival':
        setDirectAcceptArrivalLocation(location);
        break;
      default:
        break;
    }
    setRouteOverridePickerTarget(null);
  };

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
        departureReference?: string;
        departureCoordinates?: [number, number];
        arrivalReference?: string;
        arrivalCoordinates?: [number, number];
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

      const offerDepartureCoordinates = getLocationCoordinates(offerDepartureLocation);
      const offerArrivalCoordinates = getLocationCoordinates(offerArrivalLocation);
      if (offerDepartureReference.trim()) {
        payload.departureReference = offerDepartureReference.trim();
      }
      if (offerDepartureCoordinates) {
        payload.departureCoordinates = offerDepartureCoordinates;
      }
      if (offerArrivalReference.trim()) {
        payload.arrivalReference = offerArrivalReference.trim();
      }
      if (offerArrivalCoordinates) {
        payload.arrivalCoordinates = offerArrivalCoordinates;
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

    const payload: {
      vehicleId?: string;
      departureDate?: string;
      departureReference?: string;
      departureCoordinates?: [number, number];
      arrivalReference?: string;
      arrivalCoordinates?: [number, number];
    } = {
      departureDate: directAcceptDepartureDate.toISOString(),
    };

    if (directAcceptVehicle?.id) {
      payload.vehicleId = directAcceptVehicle.id;
    }
    const directDepartureCoordinates = getLocationCoordinates(directAcceptDepartureLocation);
    const directArrivalCoordinates = getLocationCoordinates(directAcceptArrivalLocation);
    if (directAcceptDepartureReference.trim()) {
      payload.departureReference = directAcceptDepartureReference.trim();
    }
    if (directDepartureCoordinates) {
      payload.departureCoordinates = directDepartureCoordinates;
    }
    if (directAcceptArrivalReference.trim()) {
      payload.arrivalReference = directAcceptArrivalReference.trim();
    }
    if (directArrivalCoordinates) {
      payload.arrivalCoordinates = directArrivalCoordinates;
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
    const hasMapCoordinates = tripRequest.departure.hasCoordinates && tripRequest.arrival.hasCoordinates;
    setEditAddressInputMode(hasMapCoordinates ? 'map' : 'manual');
    
    setEditDepartureLocation(
      tripRequest.departure.hasCoordinates
        ? {
            title: tripRequest.departure.name,
            address: tripRequest.departure.address || '',
            latitude: tripRequest.departure.lat,
            longitude: tripRequest.departure.lng,
          }
        : null,
    );
    setEditDepartureManualAddress(tripRequest.departure.name || tripRequest.departure.address || '');
    setEditDepartureReference(tripRequest.departure.reference || '');
    
    setEditArrivalLocation(
      tripRequest.arrival.hasCoordinates
        ? {
            title: tripRequest.arrival.name,
            address: tripRequest.arrival.address || '',
            latitude: tripRequest.arrival.lat,
            longitude: tripRequest.arrival.lng,
          }
        : null,
    );
    setEditArrivalManualAddress(tripRequest.arrival.name || tripRequest.arrival.address || '');
    setEditArrivalReference(tripRequest.arrival.reference || '');
    
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

  const openEditLocationPicker = (target: 'departure' | 'arrival') => {
    Keyboard.dismiss();
    editPickerRestorePendingRef.current = false;
    setShowEditForm(false);
    editPickerTransitionTimerRef.current = setTimeout(() => {
      setEditLocationPickerType(target);
      setEditActivePicker(target);
      editPickerTransitionTimerRef.current = null;
    }, Platform.OS === 'ios' ? 350 : 80);
  };

  const restoreEditFormAfterLocationPicker = () => {
    if (editPickerRestorePendingRef.current) return;
    editPickerRestorePendingRef.current = true;
    setEditActivePicker(null);
    setEditLocationPickerType(null);
    editPickerTransitionTimerRef.current = setTimeout(() => {
      setShowEditForm(true);
      editPickerRestorePendingRef.current = false;
      editPickerTransitionTimerRef.current = null;
    }, Platform.OS === 'ios' ? 350 : 80);
  };

  const handleUpdateRequest = async () => {
    if (!id || !editDepartureAddress || !editArrivalAddress) {
      showDialog({
        title: 'Adresse requise',
        message: 'Indiquez une adresse de départ et une adresse d’arrivée, ou choisissez-les sur la carte.',
        variant: 'warning',
      });
      return;
    }

    try {
      await updateTripRequest({
        id,
        payload: {
          departureLocation: editDepartureAddress,
          departureReference: editDepartureReference.trim() || undefined,
          departureCoordinates:
            editAddressInputMode === 'map' ? getLocationCoordinates(editDepartureLocation) : undefined,
          arrivalLocation: editArrivalAddress,
          arrivalReference: editArrivalReference.trim() || undefined,
          arrivalCoordinates:
            editAddressInputMode === 'map' ? getLocationCoordinates(editArrivalLocation) : undefined,
          departureDateMin: editDepartureDateMin?.toISOString() || tripRequest?.departureDateMin || '',
          departureDateMax: editDepartureDateMax?.toISOString() || tripRequest?.departureDateMax || '',
          numberOfSeats: parseInt(editNumberOfSeats) || tripRequest?.numberOfSeats || 1,
          maxPricePerSeat: editMaxPricePerSeat ? parseFloat(editMaxPricePerSeat) : undefined,
          description: editDescription.trim() || undefined,
        },
      }).unwrap();

      setShowEditForm(false);
      refetch();

      setTimeout(() => {
        showDialog({
          title: 'Demande modifiée',
          message: 'Votre demande a été modifiée avec succès',
          variant: 'success',
        });
      }, Platform.OS === 'ios' ? 350 : 0);
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
                actions: [{ label: 'OK', onPress: goHome }],
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
          <TouchableOpacity onPress={goHome} style={styles.backButton}>
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
          <TouchableOpacity onPress={goHome} style={styles.backButton}>
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

  if (!tripRequest) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goHome} style={styles.backButton}>
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

  const request = tripRequest;
  const departureLat = tripRequest.departure?.lat;
  const departureLng = tripRequest.departure?.lng;
  const arrivalLat = tripRequest.arrival?.lat;
  const arrivalLng = tripRequest.arrival?.lng;
  let requestRouteMapData: RequestRouteMapData | null = null;

  if (
    typeof departureLat === 'number' &&
    typeof departureLng === 'number' &&
    typeof arrivalLat === 'number' &&
    typeof arrivalLng === 'number'
  ) {
    const departureCoordinate = { latitude: departureLat, longitude: departureLng };
    const arrivalCoordinate = { latitude: arrivalLat, longitude: arrivalLng };

    requestRouteMapData = {
      departureCoordinate,
      arrivalCoordinate,
      fallbackCoordinates: [departureCoordinate, arrivalCoordinate],
      initialRegion: {
        latitude: (departureLat + arrivalLat) / 2,
        longitude: (departureLng + arrivalLng) / 2,
        latitudeDelta: Math.abs(departureLat - arrivalLat) * 2.5 || 0.1,
        longitudeDelta: Math.abs(departureLng - arrivalLng) * 2.5 || 0.1,
      },
    };
  }

  const displayedRouteCoordinates = routeCoordinates ?? [];
  const receivedOffers = tripRequest.offers ?? [];
  const shouldShowReceivedOffers = false;

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
        title: 'Votre course est prête',
        subtitle: 'Le trajet a déjà été créé. Vous pouvez maintenant suivre la course en direct.',
      };
    }
    if (tripRequest.status === 'driver_selected') {
      return {
        title: tripRequest.selectedDriverName
          ? `${tripRequest.selectedDriverName} prépare votre prise en charge`
          : 'Votre conducteur a été confirmé',
        subtitle: 'Restez disponible, la prise en charge va bientôt commencer.',
      };
    }
    if (tripRequest.status === 'offers_received' || pendingOffersCount > 0) {
      return {
        title:
          pendingOffersCount > 1
            ? `${pendingOffersCount} conducteurs ont répondu`
            : 'Un conducteur a répondu',
        subtitle: "Le conducteur retenu apparaîtra ici dès qu'il sera confirmé.",
      };
    }
    if (tripRequest.status === 'cancelled') {
      return {
        title: 'Votre demande est annulée',
        subtitle: "Cette demande n'est plus visible pour les conducteurs.",
      };
    }
    if (tripRequest.status === 'expired') {
      return {
        title: 'Votre demande a expiré',
        subtitle: "Aucun conducteur ne s'est positionné à temps. Vous pouvez relancer une nouvelle demande.",
      };
    }
    return {
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
        badge: 'Retenu',
        title: 'Vous pilotez cette course',
        subtitle: 'Le trajet est déjà prêt. Ouvrez-le pour suivre la course ou lancer votre prise en charge.',
      };
    }
    if (canStartAssignedTrip) {
      return {
        badge: 'Confirmé',
        title: 'Cette demande est pour vous',
        subtitle: 'Le passager est déjà réservé. Vous pouvez démarrer le trajet dès maintenant.',
      };
    }
    if (myOffer?.status === 'pending') {
      return {
        badge: 'En attente',
        title: 'Votre proposition attend la décision du passager',
        subtitle: 'Gardez un œil sur cette demande. Vous serez notifié dès qu\'une réponse arrive.',
      };
    }
    if (myOffer?.status === 'rejected') {
      return {
        badge: 'Clôturé',
        title: 'Votre proposition n\'a pas été retenue',
        subtitle: 'Vous pouvez consulter d\'autres demandes disponibles depuis l\'accueil ou la liste des demandes.',
      };
    }
    if (!isDriverRole) {
      return {
        badge: 'Profil',
        title: 'Activez votre profil conducteur',
        subtitle: 'Cette demande est ouverte, mais votre compte doit devenir conducteur pour envoyer une proposition.',
      };
    }
    if (!isIdentityVerified) {
      return {
        badge: 'KYC',
        title: 'Vérifiez votre identité pour répondre',
        subtitle: 'Une vérification rapide est nécessaire avant d\'envoyer une proposition au passager.',
      };
    }
    if (canAcceptDirectly) {
      return {
        badge: 'Immédiat',
        title: 'Vous pouvez accepter cette course maintenant',
        subtitle: 'Le trajet sera créé tout de suite, avec une option pour le démarrer immédiatement si vous êtes prêt.',
      };
    }
    return {
      badge: statusConfig.label,
      title: 'Une course attend votre offre',
      subtitle: 'Analysez les besoins du passager puis proposez votre heure et votre tarif.',
    };
  })();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goHome} style={styles.backButton}>
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
          <View style={styles.ownerHeroCard}>
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
                <Ionicons name="time-outline" size={14} color={Colors.primary} />
                <Text style={styles.ownerHeroMetaText}>
                  {formatDateWithRelativeLabel(tripRequest.departureDateMin, true)}
                </Text>
              </View>
              <View style={styles.ownerHeroMetaChip}>
                <Ionicons name="people-outline" size={14} color={Colors.primary} />
                <Text style={styles.ownerHeroMetaText}>
                  {tripRequest.numberOfSeats} place{tripRequest.numberOfSeats > 1 ? 's' : ''}
                </Text>
              </View>
              {(tripRequest.selectedPricePerSeat || tripRequest.maxPricePerSeat) && (
                <View style={styles.ownerHeroMetaChip}>
                  <Ionicons name="cash-outline" size={14} color={Colors.primary} />
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
                <Ionicons name="navigate-outline" size={18} color={Colors.white} />
                <Text style={styles.ownerHeroPrimaryButtonText}>Suivre la course</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.ownerHeroHintRow}>
                <Ionicons name="notifications-outline" size={16} color={Colors.primary} />
                <Text style={styles.ownerHeroHintText}>{ownerHeroHintMessage}</Text>
              </View>
            )}

            {tripRequest.status === 'pending' && (
              <View style={styles.ownerHeroActions}>
                {canEdit && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.ownerHeroGhostButton,
                      pressed && styles.ownerHeroButtonPressed,
                    ]}
                    onPress={handleOpenEditForm}
                  >
                    <Ionicons name="create-outline" size={16} color={Colors.primary} />
                    <Text style={styles.ownerHeroGhostButtonText}>Modifier</Text>
                  </Pressable>
                )}
                <Pressable
                  style={({ pressed }) => [
                    styles.ownerHeroGhostButton,
                    styles.ownerHeroGhostButtonDanger,
                    pressed && styles.ownerHeroButtonPressed,
                    isCancelling && styles.ownerHeroButtonDisabled,
                  ]}
                  onPress={handleCancelRequest}
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <>
                      <Ionicons name="close-circle-outline" size={16} color={Colors.white} />
                      <Text style={[styles.ownerHeroGhostButtonText, styles.ownerHeroGhostButtonTextDanger]}>
                        Annuler
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.ownerHeroCard}>
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
                <Ionicons name="time-outline" size={14} color={Colors.primary} />
                <Text style={styles.ownerHeroMetaText}>
                  {formatDateWithRelativeLabel(tripRequest.departureDateMin, true)}
                </Text>
              </View>
              <View style={styles.ownerHeroMetaChip}>
                <Ionicons name="people-outline" size={14} color={Colors.primary} />
                <Text style={styles.ownerHeroMetaText}>
                  {tripRequest.numberOfSeats} place{tripRequest.numberOfSeats > 1 ? 's' : ''}
                </Text>
              </View>
              {tripRequest.maxPricePerSeat && (
                <View style={styles.ownerHeroMetaChip}>
                  <Ionicons name="wallet-outline" size={14} color={Colors.primary} />
                  <Text style={styles.ownerHeroMetaText}>{tripRequest.maxPricePerSeat} FC max</Text>
                </View>
              )}
            </View>

            {canAcceptDirectly && (
              <View style={styles.driverOverridePanel}>
                <Text style={styles.driverOverrideTitle}>Précisions optionnelles</Text>
                <TouchableOpacity
                  style={styles.driverOverrideButton}
                  onPress={() => setRouteOverridePickerTarget('directDeparture')}
                >
                  <Ionicons name="location-outline" size={16} color={Colors.primary} />
                  <Text style={styles.driverOverrideButtonText}>
                    {directAcceptDepartureLocation?.title || 'Point de départ sur la carte'}
                  </Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.driverOverrideInput}
                  placeholder={LANDMARK_PLACEHOLDER}
                  placeholderTextColor={Colors.gray[400]}
                  value={directAcceptDepartureReference}
                  onChangeText={setDirectAcceptDepartureReference}
                />
                <TouchableOpacity
                  style={styles.driverOverrideButton}
                  onPress={() => setRouteOverridePickerTarget('directArrival')}
                >
                  <Ionicons name="navigate-outline" size={16} color={Colors.primary} />
                  <Text style={styles.driverOverrideButtonText}>
                    {directAcceptArrivalLocation?.title || 'Point d’arrivée sur la carte'}
                  </Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.driverOverrideInput}
                  placeholder={LANDMARK_PLACEHOLDER}
                  placeholderTextColor={Colors.gray[400]}
                  value={directAcceptArrivalReference}
                  onChangeText={setDirectAcceptArrivalReference}
                />
              </View>
            )}

            {canOpenAssignedTrip ? (
              <TouchableOpacity
                style={styles.ownerHeroPrimaryButton}
                onPress={() => handleViewTrip(tripRequest.tripId!)}
              >
                <Ionicons name="navigate-outline" size={18} color={Colors.white} />
                <Text style={styles.ownerHeroPrimaryButtonText}>Ouvrir le trajet</Text>
              </TouchableOpacity>
            ) : canStartAssignedTrip ? (
              <TouchableOpacity
                style={styles.ownerHeroPrimaryButton}
                onPress={handleStartTripFromRequest}
                disabled={isStartingTripFromRequest}
              >
                {isStartingTripFromRequest ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="play-circle-outline" size={18} color={Colors.white} />
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
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color={Colors.white} />
                      <Text style={styles.ownerHeroPrimaryButtonText}>Accepter la demande</Text>
                    </>
                  )}
                </TouchableOpacity>
                <View style={[styles.ownerHeroActions, styles.ownerHeroSecondaryActions]}>
                  <TouchableOpacity style={styles.ownerHeroGhostButton} onPress={openOfferForm}>
                    <Ionicons name="options-outline" size={16} color={Colors.primary} />
                    <Text style={styles.ownerHeroGhostButtonText}>Faire une proposition</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : canMakeOffer ? (
              <TouchableOpacity style={styles.ownerHeroPrimaryButton} onPress={openOfferForm}>
                <Ionicons name="send-outline" size={18} color={Colors.white} />
                <Text style={styles.ownerHeroPrimaryButtonText}>
                  {myOffer?.status === 'rejected' ? 'Faire une nouvelle proposition' : 'Faire une proposition'}
                </Text>
              </TouchableOpacity>
            ) : !isDriverRole ? (
              <TouchableOpacity style={styles.ownerHeroPrimaryButton} onPress={openDriverOnboarding}>
                <Ionicons name="car-outline" size={18} color={Colors.white} />
                <Text style={styles.ownerHeroPrimaryButtonText}>Devenir conducteur</Text>
              </TouchableOpacity>
            ) : !isIdentityVerified ? (
              <TouchableOpacity style={styles.ownerHeroPrimaryButton} onPress={() => checkIdentity('publish')}>
                <Ionicons name="shield-checkmark-outline" size={18} color={Colors.white} />
                <Text style={styles.ownerHeroPrimaryButtonText}>Vérifier mon identité</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.ownerHeroHintRow}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
                <Text style={styles.ownerHeroHintText}>
                  Faites défiler pour consulter tout le détail de la demande et votre proposition.
                </Text>
              </View>
            )}
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
                  {formatDateWithRelativeLabel(request.createdAt, false)}
                </Text>
              </View>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={20} color={Colors.gray[600]} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Date de départ souhaitée</Text>
                <Text style={styles.detailValue}>
                  {formatDateWithRelativeLabel(request.departureDateMin, true)}
                </Text>
                <Text style={styles.detailSubValue}>
                  Délai max: {formatDateWithRelativeLabel(request.departureDateMax, true)}
                </Text>
              </View>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={20} color={Colors.gray[600]} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Nombre de places</Text>
                <Text style={styles.detailValue}>{request.numberOfSeats}</Text>
              </View>
            </View>
            {request.maxPricePerSeat && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Ionicons name="cash-outline" size={20} color={Colors.gray[600]} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>Prix maximum par place</Text>
                    <Text style={styles.detailValue}>{request.maxPricePerSeat} FC</Text>
                  </View>
                </View>
              </>
            )}
            {request.description && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Ionicons name="document-text-outline" size={20} color={Colors.gray[600]} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>Description</Text>
                    <Text style={styles.detailValue}>{request.description}</Text>
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
        {shouldShowReceivedOffers && isOwner && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderWithBadge}>
              <View style={styles.sectionTitleContainer}>
                <Ionicons name="checkmark-circle" size={24} color={Colors.info} />
                <Text style={styles.sectionTitle}>
                  Propositions reçues
                </Text>
              </View>
              {receivedOffers.length > 0 && (
                <View style={styles.offersCountBadge}>
                  <Text style={styles.offersCountText}>{receivedOffers.length}</Text>
                </View>
              )}
            </View>
            
            {receivedOffers.length === 0 ? (
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
            {receivedOffers.map((offer, index) => {
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
                    <View style={styles.offerDriverText}>
                      <View style={styles.offerDriverNameRow}>
                        <Text style={styles.driverName} numberOfLines={1}>{offer.driverName}</Text>
                        {offer.driverPremiumBadge && (
                          <View style={styles.offerProBadge}>
                            <Ionicons name="shield-checkmark" size={11} color={Colors.white} />
                            <Text style={styles.offerProBadgeText}>Pro</Text>
                          </View>
                        )}
                      </View>
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

                {(offer.departureReference || offer.departureCoordinates) && (
                  <View style={styles.offerDetail}>
                    <Ionicons name="location-outline" size={16} color={Colors.gray[600]} />
                    <Text style={styles.offerDetailText}>
                      {offer.departureReference || 'Point de départ précisé'}
                    </Text>
                  </View>
                )}

                {(offer.arrivalReference || offer.arrivalCoordinates) && (
                  <View style={styles.offerDetail}>
                    <Ionicons name="navigate-outline" size={16} color={Colors.gray[600]} />
                    <Text style={styles.offerDetailText}>
                      {offer.arrivalReference || 'Point d’arrivée précisé'}
                    </Text>
                  </View>
                )}

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
              {(myOffer.departureReference || myOffer.departureCoordinates) && (
                <View style={styles.offerDetail}>
                  <Ionicons name="location-outline" size={16} color={Colors.gray[600]} />
                  <Text style={styles.offerDetailText}>
                    {myOffer.departureReference || 'Point de départ précisé'}
                  </Text>
                </View>
              )}
              {(myOffer.arrivalReference || myOffer.arrivalCoordinates) && (
                <View style={styles.offerDetail}>
                  <Ionicons name="navigate-outline" size={16} color={Colors.gray[600]} />
                  <Text style={styles.offerDetailText}>
                    {myOffer.arrivalReference || 'Point d’arrivée précisé'}
                  </Text>
                </View>
              )}
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
                  onPress={openDriverOnboarding}
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
                              <Text style={styles.formLabel}>Repère de départ</Text>
                              <Text style={styles.formHelperText}>
                                Optionnel. Ajoutez un point de prise en charge ou un repère plus précis.
                              </Text>
                              <TouchableOpacity
                                style={styles.locationButton}
                                onPress={() => setRouteOverridePickerTarget('offerDeparture')}
                              >
                                <Ionicons name="location" size={20} color={Colors.primary} />
                                <Text style={styles.locationButtonText}>
                                  {offerDepartureLocation?.title || 'Utiliser position/carte'}
                                </Text>
                                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
                              </TouchableOpacity>
                              <TextInput
                                style={[styles.input, styles.referenceInput]}
                                placeholder={LANDMARK_PLACEHOLDER}
                                value={offerDepartureReference}
                                onChangeText={setOfferDepartureReference}
                              />
                            </View>

                            <View style={styles.formGroup}>
                              <Text style={styles.formLabel}>Repère d’arrivée</Text>
                              <Text style={styles.formHelperText}>
                                Optionnel. Précisez le point d&apos;arrivée si nécessaire.
                              </Text>
                              <TouchableOpacity
                                style={styles.locationButton}
                                onPress={() => setRouteOverridePickerTarget('offerArrival')}
                              >
                                <Ionicons name="navigate" size={20} color={Colors.primary} />
                                <Text style={styles.locationButtonText}>
                                  {offerArrivalLocation?.title || 'Utiliser position/carte'}
                                </Text>
                                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
                              </TouchableOpacity>
                              <TextInput
                                style={[styles.input, styles.referenceInput]}
                                placeholder={LANDMARK_PLACEHOLDER}
                                value={offerArrivalReference}
                                onChangeText={setOfferArrivalReference}
                              />
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
                                {(offerDepartureLocation || offerDepartureReference.trim()) && (
                                  <View style={styles.previewInfoCard}>
                                    <Ionicons name="location" size={20} color={Colors.primary} />
                                    <Text style={styles.previewInfoText}>
                                      {[offerDepartureLocation?.title, offerDepartureReference.trim()].filter(Boolean).join(' - ')}
                                    </Text>
                                  </View>
                                )}
                                {(offerArrivalLocation || offerArrivalReference.trim()) && (
                                  <View style={styles.previewInfoCard}>
                                    <Ionicons name="navigate" size={20} color={Colors.primary} />
                                    <Text style={styles.previewInfoText}>
                                      {[offerArrivalLocation?.title, offerArrivalReference.trim()].filter(Boolean).join(' - ')}
                                    </Text>
                                  </View>
                                )}
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
        {requestRouteMapData && (
          <Modal visible={mapModalVisible} animationType="fade" transparent onRequestClose={() => setMapModalVisible(false)}>
            <View style={styles.mapModalOverlay}>
              <View style={styles.mapModalContent}>
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.fullscreenMap}
                  mapType="standard"
                  initialRegion={requestRouteMapData.initialRegion}
                >
                  {/* Trajectoire réelle de circulation */}
                  {displayedRouteCoordinates.length > 0 ? (
                    <Polyline
                      coordinates={displayedRouteCoordinates}
                      strokeColor={Colors.primary}
                      strokeWidth={5}
                    />
                  ) : (
                    // Fallback sur ligne droite pendant le chargement ou en cas d'erreur
                    <Polyline
                      coordinates={requestRouteMapData.fallbackCoordinates}
                      strokeColor={Colors.gray[400]}
                      strokeWidth={4}
                      lineDashPattern={[2, 2]}
                    />
                  )}

                  {/* Marqueur de départ */}
                  <Marker
                    coordinate={requestRouteMapData.departureCoordinate}
                    tracksViewChanges={false}
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
                    coordinate={requestRouteMapData.arrivalCoordinate}
                    tracksViewChanges={false}
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
                style={styles.editModalRoot}
              >
                <TouchableOpacity
                  style={styles.editModalBackdrop}
                  activeOpacity={1}
                  onPress={() => setShowEditForm(false)}
                />
                
                <View style={styles.editModalCard}>
                  {/* En-tête */}
                  <View style={styles.editModalHeader}>
                    <View style={styles.editModalHeaderContent}>
                      <Ionicons name="create-outline" size={24} color={Colors.primary} />
                      <View>
                        <Text style={styles.editModalTitle}>Modifier la demande</Text>
                        <Text style={styles.editModalSubtitle}>Ajustez les détails avant de republier</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.editModalCloseButton}
                      onPress={() => setShowEditForm(false)}
                    >
                      <Ionicons name="close" size={24} color={Colors.gray[600]} />
                    </TouchableOpacity>
                  </View>

                  {/* Contenu Scrollable */}
                  <ScrollView
                    style={styles.editModalScrollView}
                    contentContainerStyle={styles.editModalScrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    {/* ── Section Itinéraire ── */}
                    <View style={styles.editSectionHeader}>
                      <View style={styles.editSectionIconWrap}>
                        <Ionicons name="map-outline" size={15} color={Colors.primary} />
                      </View>
                      <Text style={styles.editSectionTitle}>Itinéraire</Text>
                    </View>

                    {/* Mode selector */}
                    <View style={styles.editModeRow}>
                      <TouchableOpacity
                        style={[styles.editModeChip, editAddressInputMode === 'map' && styles.editModeChipActive]}
                        onPress={() => setEditAddressInputMode('map')}
                      >
                        <Ionicons name="map-outline" size={13} color={editAddressInputMode === 'map' ? Colors.primary : Colors.gray[500]} />
                        <Text style={[styles.editModeChipText, editAddressInputMode === 'map' && styles.editModeChipTextActive]}>Carte</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.editModeChip, editAddressInputMode === 'manual' && styles.editModeChipActive]}
                        onPress={() => setEditAddressInputMode('manual')}
                      >
                        <Ionicons name="create-outline" size={13} color={editAddressInputMode === 'manual' ? Colors.primary : Colors.gray[500]} />
                        <Text style={[styles.editModeChipText, editAddressInputMode === 'manual' && styles.editModeChipTextActive]}>Saisie manuelle</Text>
                      </TouchableOpacity>
                    </View>

                    {editAddressInputMode === 'manual' ? (
                      <View style={styles.editRouteCard}>
                        <View style={styles.editRouteManualItem}>
                          <View style={[styles.editRouteManualDot, { backgroundColor: Colors.success }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.editRouteManualLabel}>Départ</Text>
                            <TextInput
                              style={styles.editRouteManualInput}
                              placeholder="Adresse de départ"
                              placeholderTextColor={Colors.gray[400]}
                              value={editDepartureManualAddress}
                              onChangeText={setEditDepartureManualAddress}
                            />
                          </View>
                        </View>
                        <View style={styles.editRouteDividerLine} />
                        <View style={styles.editRouteManualItem}>
                          <View style={[styles.editRouteManualDot, { backgroundColor: Colors.primary }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.editRouteManualLabel}>Arrivée</Text>
                            <TextInput
                              style={styles.editRouteManualInput}
                              placeholder="Adresse d'arrivée"
                              placeholderTextColor={Colors.gray[400]}
                              value={editArrivalManualAddress}
                              onChangeText={setEditArrivalManualAddress}
                            />
                          </View>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.editRouteCard}>
                        <TouchableOpacity
                          style={styles.editRouteMapBtn}
                          onPress={() => openEditLocationPicker('departure')}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.editRouteMapDot, { backgroundColor: Colors.success + '20' }]}>
                            <Ionicons name="location" size={16} color={Colors.success} />
                          </View>
                          <View style={styles.editRouteMapContent}>
                            <Text style={[styles.editRouteMapType, { color: Colors.success }]}>DÉPART</Text>
                            <Text style={styles.editRouteMapValue} numberOfLines={1}>
                              {editDepartureAddress || 'Sélectionner sur la carte'}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
                        </TouchableOpacity>

                        <View style={styles.editRouteDividerLine} />

                        <TouchableOpacity
                          style={styles.editRouteMapBtn}
                          onPress={() => openEditLocationPicker('arrival')}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.editRouteMapDot, { backgroundColor: Colors.primary + '18' }]}>
                            <Ionicons name="navigate" size={16} color={Colors.primary} />
                          </View>
                          <View style={styles.editRouteMapContent}>
                            <Text style={[styles.editRouteMapType, { color: Colors.primary }]}>ARRIVÉE</Text>
                            <Text style={styles.editRouteMapValue} numberOfLines={1}>
                              {editArrivalAddress || 'Sélectionner sur la carte'}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Fenêtre horaire */}
                    <View style={styles.editSection}>
                      <View style={styles.editSectionHeader}>
                        <Ionicons name="calendar" size={20} color={Colors.warning} />
                        <Text style={styles.editSectionTitle}>Créneau de départ</Text>
                      </View>
                      
                      {/* Min */}
                      <View style={styles.editDateTimeRow}>
                        <Text style={styles.editDateTimeLabel}>Au plus tôt</Text>
                        <TouchableOpacity style={styles.editDateTimeButton} onPress={() => openEditDateOrTimePickerMin('date')}>
                          <Ionicons name="calendar-outline" size={16} color={Colors.gray[600]} />
                          <Text style={styles.editDateTimeText}>{editDepartureDateMin ? editDepartureDateMin.toLocaleDateString('fr-FR') : 'Date'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.editDateTimeButton} onPress={() => openEditDateOrTimePickerMin('time')}>
                          <Ionicons name="time-outline" size={16} color={Colors.gray[600]} />
                          <Text style={styles.editDateTimeText}>{editDepartureDateMin ? editDepartureDateMin.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : 'Heure'}</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Max */}
                      <View style={styles.editDateTimeRow}>
                        <Text style={styles.editDateTimeLabel}>Au plus tard</Text>
                        <TouchableOpacity style={styles.editDateTimeButton} onPress={() => openEditDateOrTimePickerMax('date')}>
                          <Ionicons name="calendar-outline" size={16} color={Colors.gray[600]} />
                          <Text style={styles.editDateTimeText}>{editDepartureDateMax ? editDepartureDateMax.toLocaleDateString('fr-FR') : 'Date'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.editDateTimeButton} onPress={() => openEditDateOrTimePickerMax('time')}>
                          <Ionicons name="time-outline" size={16} color={Colors.gray[600]} />
                          <Text style={styles.editDateTimeText}>{editDepartureDateMax ? editDepartureDateMax.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : 'Heure'}</Text>
                        </TouchableOpacity>
                      </View>

                      {/* iOS Pickers intégrés */}
                      {Platform.OS === 'ios' && editIosPickerModeMin && editDepartureDateMin && (
                        <View style={styles.editIosPickerWrapper}>
                          <DateTimePicker value={editDepartureDateMin} mode={editIosPickerModeMin} display="spinner" onChange={handleEditIosPickerChangeMin} minimumDate={new Date()} />
                        </View>
                      )}
                      {Platform.OS === 'ios' && editIosPickerModeMax && editDepartureDateMax && (
                        <View style={styles.editIosPickerWrapper}>
                          <DateTimePicker value={editDepartureDateMax} mode={editIosPickerModeMax} display="spinner" onChange={handleEditIosPickerChangeMax} minimumDate={editDepartureDateMin || new Date()} />
                        </View>
                      )}
                    </View>

                    {/* Capacité & Prix */}
                    <View style={styles.editSection}>
                      <View style={styles.editSectionHeader}>
                        <Ionicons name="people" size={20} color={Colors.info} />
                        <Text style={styles.editSectionTitle}>Capacité & Budget</Text>
                      </View>
                      <View style={styles.editRowInputs}>
                        <View style={{flex: 1}}>
                          <Text style={styles.editLabel}>Places demandées</Text>
                          <TextInput
                            style={styles.editInput}
                            keyboardType="numeric"
                            placeholder="Ex: 1"
                            value={editNumberOfSeats}
                            onChangeText={setEditNumberOfSeats}
                          />
                        </View>
                        <View style={{flex: 1}}>
                          <Text style={styles.editLabel}>Prix max/place (FC)</Text>
                          <TextInput
                            style={styles.editInput}
                            keyboardType="numeric"
                            placeholder="Ex: 5000"
                            value={editMaxPricePerSeat}
                            onChangeText={setEditMaxPricePerSeat}
                          />
                        </View>
                      </View>
                    </View>

                    {/* Description */}
                    <View style={styles.editSection}>
                      <Text style={styles.editLabel}>Note pour le conducteur (optionnel)</Text>
                      <TextInput
                        style={[styles.editInput, styles.editTextArea]}
                        multiline
                        numberOfLines={4}
                        placeholder="Bagages, contraintes horaires, précisions..."
                        value={editDescription}
                        onChangeText={setEditDescription}
                      />
                    </View>
                  </ScrollView>

                  {/* Actions fixes en bas */}
                  <View style={styles.editModalFooter}>
                    <TouchableOpacity style={styles.editModalCancelButton} onPress={() => setShowEditForm(false)}>
                      <Text style={styles.editModalCancelText}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.editModalSaveButton,
                        (!editDepartureAddress || !editArrivalAddress || !editDepartureDateMin || !editDepartureDateMax || !editNumberOfSeats || parseInt(editNumberOfSeats) <= 0) && styles.editModalSaveButtonDisabled
                      ]}
                      onPress={handleUpdateRequest}
                      disabled={
                        isUpdating || !editDepartureAddress || !editArrivalAddress ||
                        !editDepartureDateMin || !editDepartureDateMax ||
                        !editNumberOfSeats || parseInt(editNumberOfSeats) <= 0
                      }
                    >
                      {isUpdating ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <>
                          <Ionicons name="save-outline" size={18} color={Colors.white} />
                          <Text style={styles.editModalSaveText}>Enregistrer</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          )}
        {/* Location Picker Modal pour la modification */}
        {editLocationPickerType && (
          <LocationPickerModal
            visible={editActivePicker !== null}
            onClose={restoreEditFormAfterLocationPicker}
            onSelect={(location) => {
              if (editLocationPickerType === 'departure') {
                setEditDepartureLocation(location);
                setEditDepartureManualAddress(location.title || location.address);
              } else {
                setEditArrivalLocation(location);
                setEditArrivalManualAddress(location.title || location.address);
              }
              setEditAddressInputMode('map');
              restoreEditFormAfterLocationPicker();
            }}
            initialLocation={
              editLocationPickerType === 'departure' ? editDepartureLocation : editArrivalLocation
            }
          />
        )}

        <LocationPickerModal
          visible={routeOverridePickerTarget !== null}
          onClose={() => setRouteOverridePickerTarget(null)}
          onSelect={handleRouteOverrideSelected}
          initialLocation={
            routeOverridePickerTarget === 'offerDeparture'
              ? offerDepartureLocation
              : routeOverridePickerTarget === 'offerArrival'
                ? offerArrivalLocation
                : routeOverridePickerTarget === 'directDeparture'
                  ? directAcceptDepartureLocation
                  : routeOverridePickerTarget === 'directArrival'
                    ? directAcceptArrivalLocation
                    : null
          }
          title={
            routeOverridePickerTarget === 'offerArrival' || routeOverridePickerTarget === 'directArrival'
              ? 'Point d’arrivée'
              : 'Point de départ'
          }
        />

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.white,
  },
  ownerHeroCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
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
    backgroundColor: Colors.primary + '12',
  },
  ownerHeroStatusText: {
    color: Colors.primaryDark,
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
    backgroundColor: Colors.primary,
  },
  ownerHeroCounterText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  ownerHeroTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    lineHeight: 30,
  },
  ownerHeroSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 20,
  },
  ownerHeroRouteCard: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
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
    backgroundColor: Colors.primary,
  },
  ownerHeroRouteInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  ownerHeroRouteLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.gray[500],
    textTransform: 'uppercase',
  },
  ownerHeroRouteText: {
    marginTop: 4,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  ownerHeroRouteLine: {
    width: 1,
    height: 18,
    backgroundColor: Colors.gray[200],
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
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.primary + '18',
  },
  ownerHeroMetaText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  driverOverridePanel: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    marginBottom: Spacing.md,
  },
  driverOverrideTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  driverOverrideButton: {
    minHeight: 42,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.white,
  },
  driverOverrideButtonText: {
    flex: 1,
    color: Colors.gray[800],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  driverOverrideInput: {
    minHeight: 42,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingHorizontal: Spacing.md,
    color: Colors.gray[900],
    backgroundColor: Colors.white,
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
    backgroundColor: Colors.gray[200],
  },
  ownerHeroStepDotActive: {
    backgroundColor: Colors.primary,
  },
  ownerHeroStepText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
  },
  ownerHeroStepTextActive: {
    color: Colors.primaryDark,
    fontWeight: FontWeights.bold,
  },
  ownerHeroPrimaryButton: {
    minHeight: 52,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  ownerHeroPrimaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  ownerHeroHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  ownerHeroHintText: {
    flex: 1,
    color: Colors.gray[700],
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
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '22',
    backgroundColor: Colors.primary + '10',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  ownerHeroGhostButtonDanger: {
    backgroundColor: Colors.danger,
    borderColor: Colors.danger,
  },
  ownerHeroButtonPressed: {
    opacity: 0.72,
  },
  ownerHeroButtonDisabled: {
    opacity: 0.6,
  },
  ownerHeroGhostButtonText: {
    color: Colors.primaryDark,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  ownerHeroGhostButtonTextDanger: {
    color: Colors.white,
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
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  driverHeroPassengerInfo: {
    flex: 1,
  },
  driverHeroPassengerLabel: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
  },
  driverHeroPassengerName: {
    marginTop: 2,
    color: Colors.gray[900],
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
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
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
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  offerCardPending: {
    borderColor: Colors.info,
    borderWidth: 1,
    backgroundColor: Colors.info + '08',
  },
  offerCardAccepted: {
    borderColor: Colors.success,
    borderWidth: 1,
    backgroundColor: Colors.success + '08',
  },
  offerCardRejected: {
    borderColor: Colors.danger,
    borderWidth: 1,
    backgroundColor: Colors.danger + '08',
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
  offerDriverText: {
    flex: 1,
    minWidth: 0,
  },
  offerDriverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  driverName: {
    flexShrink: 1,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  offerProBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  offerProBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: FontWeights.bold,
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
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
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
  referenceInput: {
    marginTop: Spacing.sm,
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
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
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
    // === MODAL DE MODIFICATION ===
  editModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  editModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  editModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '90%',
    flexShrink: 1,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
    overflow: 'hidden',
  },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  editModalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  editModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  editModalSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
  editModalCloseButton: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
  },
  editModalScrollView: {
    flexShrink: 1,
  },
  editModalScrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  editSection: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  editSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  editSectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  editInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
  },
  editInputButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  editInputButtonText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
  },
  editInputSecondary: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.white,
    borderColor: Colors.gray[300],
  },
  editLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  editDateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  editDateTimeLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  editDateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.gray[100],
  },
  editDateTimeText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
    fontWeight: FontWeights.semibold,
  },
  editIosPickerWrapper: {
    marginTop: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    overflow: 'hidden',
  },
  editRowInputs: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  editTextArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  editModalFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
    backgroundColor: Colors.white,
  },
  editModalCancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
  },
  editModalCancelText: {
    fontSize: FontSizes.base,
    color: Colors.gray[700],
    fontWeight: FontWeights.semibold,
  },
  editModalSaveButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  editModalSaveButtonDisabled: {
    backgroundColor: Colors.gray[300],
    opacity: 0.7,
  },
  editModalSaveText: {
    fontSize: FontSizes.base,
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  editSectionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModeRow: {
    flexDirection: 'row',
    backgroundColor: Colors.gray[100],
    borderRadius: 10,
    padding: 4,
    marginBottom: Spacing.md,
  },
  editModeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  editModeChipActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  editModeChipText: {
    fontSize: 13,
    fontWeight: FontWeights.medium,
    color: Colors.gray[500],
  },
  editModeChipTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  editRouteCard: {
    backgroundColor: Colors.gray[50],
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  editRouteMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  editRouteMapDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  editRouteMapContent: {
    flex: 1,
    justifyContent: 'center',
  },
  editRouteMapType: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    marginBottom: 2,
  },
  editRouteMapValue: {
    fontSize: 14,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  editRouteDividerLine: {
    width: 1,
    height: 20,
    backgroundColor: Colors.gray[300],
    marginLeft: 16,
    marginVertical: 4,
  },
  editRouteManualItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editRouteManualDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.md,
    marginLeft: 10,
  },
  editRouteManualLabel: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  editRouteManualInput: {
    fontSize: 14,
    fontWeight: FontWeights.medium,
    color: Colors.gray[900],
    padding: 0,
    minHeight: 24,
  },
});
