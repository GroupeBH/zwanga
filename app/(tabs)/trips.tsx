import LocationPickerModal, { type MapLocationSelection } from '@/components/LocationPickerModal';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import {
  useDeleteTripMutation,
  useGetMyRecurringTripsQuery,
  useGetMyTripsQuery,
  useUpdateTripMutation,
} from '@/store/api/tripApi';
import type { Trip } from '@/types';
import { formatDateWithRelativeLabel, formatTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type MainTab = 'published' | 'bookings';
type SubTab = 'upcoming' | 'completed';
type EditTripStep = 1 | 2;

const normalizeSearchText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const getLocationText = (selection: MapLocationSelection | null, manualAddress: string) =>
  (manualAddress.trim() || selection?.title || selection?.address || '').trim();

const getLocationCoordinatesTuple = (
  selection: MapLocationSelection | null,
): [number, number] | undefined => {
  if (!selection || !Number.isFinite(selection.latitude) || !Number.isFinite(selection.longitude)) {
    return undefined;
  }
  return [selection.longitude, selection.latitude];
};

function ArrivalTimeBlock({ trip }: { trip: Trip }) {
  const calculatedArrivalTime = useTripArrivalTime(trip);
  const arrivalTimeDisplay = calculatedArrivalTime
    ? formatTime(calculatedArrivalTime.toISOString())
    : formatTime(trip.arrivalTime);

  return (
    <View style={styles.timeContainer}>
      {calculatedArrivalTime ? (
        <Text style={styles.routeDateLabel}>
          {formatDateWithRelativeLabel(calculatedArrivalTime.toISOString(), false)}
        </Text>
      ) : null}
      <Text style={styles.routeTime}>{arrivalTimeDisplay}</Text>
    </View>
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [mainTab, setMainTab] = useState<MainTab>('published');
  const [subTab, setSubTab] = useState<SubTab>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const {
    data: myTrips,
    isLoading: tripsLoading,
    isFetching: tripsFetching,
    isError: tripsError,
    refetch: refetchTrips,
  } = useGetMyTripsQuery(undefined, {
    pollingInterval: isFocused ? 60000 : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: isFocused,
  });
  const {
    data: myBookings,
    isLoading: bookingsLoading,
    isFetching: bookingsFetching,
    isError: bookingsError,
    refetch: refetchBookings,
  } = useGetMyBookingsQuery(undefined, {
    pollingInterval: isFocused ? 60000 : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: isFocused,
  });
  const { data: recurringTemplates = [] } = useGetMyRecurringTripsQuery();
  const [updateTripMutation, { isLoading: isSavingTrip }] = useUpdateTripMutation();
  const [deleteTripMutation, { isLoading: isDeletingTrip }] = useDeleteTripMutation();
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [editStep, setEditStep] = useState<EditTripStep>(1);
  const [editKeyboardHeight, setEditKeyboardHeight] = useState(0);
  const [editSeats, setEditSeats] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDateTime, setEditDateTime] = useState<Date | null>(null);
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);
  const [editRouteMode, setEditRouteMode] = useState<'map' | 'manual'>('map');
  const [editDepartureSelection, setEditDepartureSelection] = useState<MapLocationSelection | null>(null);
  const [editArrivalSelection, setEditArrivalSelection] = useState<MapLocationSelection | null>(null);
  const [editDepartureManualAddress, setEditDepartureManualAddress] = useState('');
  const [editArrivalManualAddress, setEditArrivalManualAddress] = useState('');
  const [editRoutePickerTarget, setEditRoutePickerTarget] = useState<'departure' | 'arrival' | null>(null);
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

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setEditKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setEditKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const dismissTripsGuide = () => {
    setTripsGuideVisible(false);
    completeTripsGuide();
  };

  const trips = useMemo(() => myTrips ?? [], [myTrips]);
  const activeRecurringTemplates = useMemo(
    () => recurringTemplates.filter((template) => template.status === 'active').length,
    [recurringTemplates],
  );

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
      }).sort((a, b) => {
        const dateA = new Date(a.departureTime).getTime();
        const dateB = new Date(b.departureTime).getTime();
        return dateA - dateB;
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
    }).sort((a, b) => {
      const dateA = new Date(a.trip?.departureTime || a.createdAt).getTime();
      const dateB = new Date(b.trip?.departureTime || b.createdAt).getTime();
      return dateA - dateB;
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
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const filteredTrips = useMemo(() => {
    if (!normalizedSearchQuery) return displayTrips;

    return displayTrips.filter((trip) =>
      normalizeSearchText([
        trip.departure?.name,
        trip.departure?.address,
        trip.arrival?.name,
        trip.arrival?.address,
        trip.driverName,
        trip.vehicle?.brand,
        trip.vehicle?.model,
        trip.vehicleInfo,
      ].join(' ')).includes(normalizedSearchQuery),
    );
  }, [displayTrips, normalizedSearchQuery]);
  const filteredBookings = useMemo(() => {
    if (!normalizedSearchQuery) return displayBookings;

    return displayBookings.filter((booking) => {
      const trip = booking.trip;
      return normalizeSearchText([
        trip?.departure?.name,
        trip?.departure?.address,
        booking.passengerDestination,
        trip?.arrival?.name,
        trip?.arrival?.address,
        trip?.driverName,
        trip?.vehicle?.brand,
        trip?.vehicle?.model,
        trip?.vehicleInfo,
      ].join(' ')).includes(normalizedSearchQuery);
    });
  }, [displayBookings, normalizedSearchQuery]);
  const displayData = mainTab === 'published' ? filteredTrips : filteredBookings;
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
    const departureLat = Number(trip.departure?.lat);
    const departureLng = Number(trip.departure?.lng);
    const arrivalLat = Number(trip.arrival?.lat);
    const arrivalLng = Number(trip.arrival?.lng);

    const departureSelection =
      Number.isFinite(departureLat) && Number.isFinite(departureLng)
        ? {
            title: trip.departure?.name || 'Depart',
            address:
              trip.departure?.address || `${departureLat.toFixed(5)}, ${departureLng.toFixed(5)}`,
            latitude: departureLat,
            longitude: departureLng,
          }
        : null;
    const arrivalSelection =
      Number.isFinite(arrivalLat) && Number.isFinite(arrivalLng)
        ? {
            title: trip.arrival?.name || 'Arrivee',
            address: trip.arrival?.address || `${arrivalLat.toFixed(5)}, ${arrivalLng.toFixed(5)}`,
            latitude: arrivalLat,
            longitude: arrivalLng,
          }
        : null;

    setEditingTrip(trip);
    setEditSeats(String(trip.availableSeats));
    setEditPrice(String(trip.price));
    const parsedDate = trip.departureTime ? new Date(trip.departureTime) : null;
    setEditDateTime(parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : getDefaultFutureDate());
    setEditDepartureSelection(departureSelection);
    setEditArrivalSelection(arrivalSelection);
    setEditDepartureManualAddress((trip.departure?.address || trip.departure?.name || '').trim());
    setEditArrivalManualAddress((trip.arrival?.address || trip.arrival?.name || '').trim());
    setEditRouteMode(departureSelection && arrivalSelection ? 'map' : 'manual');
    setEditRoutePickerTarget(null);
    setEditStep(1);
  };

  const closeEditModal = () => {
    setEditingTrip(null);
    setEditStep(1);
    setEditKeyboardHeight(0);
    setEditSeats('');
    setEditPrice('');
    setEditDateTime(null);
    setIosPickerMode(null);
    setEditRouteMode('map');
    setEditDepartureSelection(null);
    setEditArrivalSelection(null);
    setEditDepartureManualAddress('');
    setEditArrivalManualAddress('');
    setEditRoutePickerTarget(null);
  };

  const swapEditRoutePoints = () => {
    setEditDepartureSelection(editArrivalSelection);
    setEditArrivalSelection(editDepartureSelection);
    setEditDepartureManualAddress(editArrivalManualAddress);
    setEditArrivalManualAddress(editDepartureManualAddress);
  };

  const handleContinueEditTrip = () => {
    const departureAddress =
      editRouteMode === 'manual'
        ? editDepartureManualAddress.trim()
        : getLocationText(editDepartureSelection, '');
    const arrivalAddress =
      editRouteMode === 'manual'
        ? editArrivalManualAddress.trim()
        : getLocationText(editArrivalSelection, '');

    if (!departureAddress || !arrivalAddress) {
      showFeedback('error', 'Indiquez un depart et une arrivee avant de continuer.');
      return;
    }

    if (departureAddress.toLowerCase() === arrivalAddress.toLowerCase()) {
      showFeedback('error', 'Le depart et l arrivee doivent etre differents.');
      return;
    }

    Keyboard.dismiss();
    setIosPickerMode(null);
    setEditStep(2);
  };

  const handleBackToEditRoute = () => {
    Keyboard.dismiss();
    setIosPickerMode(null);
    setEditStep(1);
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

  const editDepartureDisplay = useMemo(() => {
    if (editRouteMode === 'manual') {
      return editDepartureManualAddress.trim() || 'Renseigner le depart';
    }
    return (
      editDepartureSelection?.title ||
      editDepartureSelection?.address ||
      editDepartureManualAddress.trim() ||
      'Choisir le point de depart'
    );
  }, [editDepartureManualAddress, editDepartureSelection, editRouteMode]);

  const editArrivalDisplay = useMemo(() => {
    if (editRouteMode === 'manual') {
      return editArrivalManualAddress.trim() || 'Renseigner l arrivee';
    }
    return (
      editArrivalSelection?.title ||
      editArrivalSelection?.address ||
      editArrivalManualAddress.trim() ||
      'Choisir le point d arrivee'
    );
  }, [editArrivalManualAddress, editArrivalSelection, editRouteMode]);

  const editModalKeyboardOffset =
    Platform.OS === 'android' && Boolean(editingTrip)
      ? Math.max(editKeyboardHeight - insets.bottom, 0)
      : 0;
  const editModalBottomPadding = Math.max(insets.bottom, 16) + 8;
  const editModalSheetKeyboardStyle =
    Platform.OS === 'android' && editModalKeyboardOffset > 0
      ? {
          marginBottom: editModalKeyboardOffset,
          maxHeight: '78%' as const,
        }
      : null;

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
      showFeedback('error', 'Veuillez verifier le nombre de places et le prix.');
      return;
    }

    const departureAddress =
      editRouteMode === 'manual'
        ? editDepartureManualAddress.trim()
        : getLocationText(editDepartureSelection, '');
    const arrivalAddress =
      editRouteMode === 'manual'
        ? editArrivalManualAddress.trim()
        : getLocationText(editArrivalSelection, '');

    if (!departureAddress || !arrivalAddress) {
      showFeedback('error', 'Indiquez un depart et une arrivee avant d enregistrer.');
      return;
    }

    if (departureAddress.toLowerCase() === arrivalAddress.toLowerCase()) {
      showFeedback('error', 'Le depart et l arrivee doivent etre differents.');
      return;
    }

    const currentDepartureAddress = (editingTrip.departure?.address || editingTrip.departure?.name || '').trim();
    const currentArrivalAddress = (editingTrip.arrival?.address || editingTrip.arrival?.name || '').trim();
    const updates: {
      totalSeats: number;
      pricePerSeat: number;
      departureDate: string;
      departureLocation?: string;
      arrivalLocation?: string;
      departureCoordinates?: [number, number];
      arrivalCoordinates?: [number, number];
    } = {
      totalSeats: seatsValue,
      pricePerSeat: priceValue,
      departureDate: editDateTime.toISOString(),
    };

    if (departureAddress !== currentDepartureAddress) {
      updates.departureLocation = departureAddress;
    }
    if (arrivalAddress !== currentArrivalAddress) {
      updates.arrivalLocation = arrivalAddress;
    }

    if (editRouteMode === 'map') {
      const departureTuple = getLocationCoordinatesTuple(editDepartureSelection);
      const arrivalTuple = getLocationCoordinatesTuple(editArrivalSelection);
      const currentDepartureLat = Number(editingTrip.departure?.lat);
      const currentDepartureLng = Number(editingTrip.departure?.lng);
      const currentArrivalLat = Number(editingTrip.arrival?.lat);
      const currentArrivalLng = Number(editingTrip.arrival?.lng);

      if (
        departureTuple &&
        (!Number.isFinite(currentDepartureLat) ||
          !Number.isFinite(currentDepartureLng) ||
          Math.abs(departureTuple[1] - currentDepartureLat) > 0.000001 ||
          Math.abs(departureTuple[0] - currentDepartureLng) > 0.000001)
      ) {
        updates.departureCoordinates = departureTuple;
      }

      if (
        arrivalTuple &&
        (!Number.isFinite(currentArrivalLat) ||
          !Number.isFinite(currentArrivalLng) ||
          Math.abs(arrivalTuple[1] - currentArrivalLat) > 0.000001 ||
          Math.abs(arrivalTuple[0] - currentArrivalLng) > 0.000001)
      ) {
        updates.arrivalCoordinates = arrivalTuple;
      }
    }

    try {
      await updateTripMutation({
        id: editingTrip.id,
        updates,
      }).unwrap();
      showFeedback('success', 'Le trajet a ete mis a jour.');
      closeEditModal();
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? 'Impossible de mettre a jour ce trajet pour le moment.';
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
        <View style={styles.headerTopRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>VOTRE ACTIVITÉ</Text>
            <Text style={styles.headerTitle}>Mes trajets</Text>
            <Text style={styles.headerSubtitle}>Suivez et gérez tous vos déplacements.</Text>
          </View>
          <TouchableOpacity
            style={styles.headerPublishButton}
            onPress={() => router.push('/publish')}
            accessibilityLabel="Publier un trajet"
          >
            <Ionicons name="add" size={24} color={Colors.white} />
          </TouchableOpacity>
        </View>

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

        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color={Colors.gray[500]} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={mainTab === 'published' ? 'Rechercher un trajet...' : 'Rechercher une réservation...'}
            placeholderTextColor={Colors.gray[400]}
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && Platform.OS !== 'ios' ? (
            <TouchableOpacity style={styles.searchClearButton} onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          ) : null}
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
        {mainTab === 'published' && (
          <TouchableOpacity
            style={styles.recurringHubCard}
            onPress={() => router.push('/recurring-trips')}
          >
            <View style={styles.recurringHubIcon}>
              <Ionicons name="repeat" size={20} color={Colors.white} />
            </View>
            <View style={styles.recurringHubContent}>
              <Text style={styles.recurringHubTitle}>Trajets recurrents</Text>
              <Text style={styles.recurringHubText}>
                {recurringTemplates.length > 0
                  ? `${activeRecurringTemplates} actif(s) et ${recurringTemplates.length} modèle(s) à gerer`
                  : 'Publier automatiquement un trajet habituel pour plusieurs jours'}
              </Text>
            </View>
            <View style={styles.recurringHubAction}>
              <Text style={styles.recurringHubActionText}>Gérer</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </View>
          </TouchableOpacity>
        )}

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
                name={normalizedSearchQuery ? 'search-outline' : mainTab === 'published' ? 'car-outline' : 'calendar-outline'}
                size={48}
                color={Colors.gray[500]}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {normalizedSearchQuery
                ? 'Aucun résultat'
                : mainTab === 'published' ? 'Aucun trajet' : 'Aucune réservation'}
            </Text>
            <Text style={styles.emptyText}>
              {normalizedSearchQuery
                ? `Aucun trajet ne correspond à « ${searchQuery.trim()} ».`
                : mainTab === 'published'
                ? subTab === 'upcoming'
                  ? 'Vous n\'avez pas de trajet à venir'
                  : 'Vous n\'avez pas encore terminé de trajet'
                : subTab === 'upcoming'
                  ? 'Vous n\'avez pas de réservation à venir'
                  : 'Vous n\'avez pas encore terminé de réservation'}
            </Text>
            {normalizedSearchQuery ? (
              <TouchableOpacity style={styles.emptySecondaryButton} onPress={() => setSearchQuery('')}>
                <Text style={styles.emptySecondaryButtonText}>Effacer la recherche</Text>
              </TouchableOpacity>
            ) : mainTab === 'published' && subTab === 'upcoming' && (
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
            ? filteredTrips.map((trip) => {
              const statusConfig = getStatusConfig(trip);

              return (
                <View key={trip.id} style={styles.tripCard}>
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
                      <ArrivalTimeBlock trip={trip} />
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
                </View>
              );
          })
            : filteredBookings.map((booking) => {
                const trip = booking.trip;
                if (!trip) return null;

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
                    <View key={booking.id} style={styles.tripCard}>
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
                          <ArrivalTimeBlock trip={trip} />
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
                    </View>
                );
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

      <Modal
        transparent={Platform.OS === 'android'}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
        statusBarTranslucent={Platform.OS === 'android'}
        navigationBarTranslucent={Platform.OS === 'android'}
        visible={Boolean(editingTrip)}
        onRequestClose={closeEditModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
          style={[styles.modalKeyboard, Platform.OS === 'ios' && styles.modalKeyboardIos]}
        >
          <View style={[styles.modalOverlay, Platform.OS === 'ios' && styles.modalOverlayIos]}>
            {Platform.OS === 'android' && (
              <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeEditModal} />
            )}
            <View
              style={[
                styles.modalCard,
                Platform.OS === 'ios' && styles.modalCardIos,
                { paddingBottom: editModalBottomPadding },
                editModalSheetKeyboardStyle,
              ]}
            >
              {Platform.OS === 'android' && <View style={styles.modalHandle} />}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Modifier le trajet</Text>
                {editingTrip && (
                  <Text style={styles.modalSubtitle} numberOfLines={1}>
                    {editingTrip.departure.name} {'->'} {editingTrip.arrival.name}
                  </Text>
                )}
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={closeEditModal}>
                <Ionicons name="close" size={20} color={Colors.gray[600]} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalStepIndicator}>
              <View style={[styles.modalStepPill, editStep === 1 && styles.modalStepPillActive]}>
                <Text style={[styles.modalStepText, editStep === 1 && styles.modalStepTextActive]}>
                  1. Itineraire
                </Text>
              </View>
              <View style={[styles.modalStepPill, editStep === 2 && styles.modalStepPillActive]}>
                <Text style={[styles.modalStepText, editStep === 2 && styles.modalStepTextActive]}>
                  2. Details
                </Text>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              style={[styles.modalScrollView, Platform.OS === 'ios' && styles.modalScrollViewIos]}
              contentContainerStyle={styles.modalScrollContent}
              scrollIndicatorInsets={{ bottom: editModalBottomPadding }}
            >

              {editStep === 1 ? (
                <>
            <View style={styles.modalRouteCard}>
              <View style={styles.modalRouteHeader}>
                <Text style={styles.modalRouteTitle}>Points du trajet</Text>
                <TouchableOpacity style={styles.modalSwapButton} onPress={swapEditRoutePoints}>
                  <Ionicons name="swap-vertical" size={16} color={Colors.primary} />
                  <Text style={styles.modalSwapButtonText}>Echanger</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.modalRouteModeRow}>
                <TouchableOpacity
                  style={[
                    styles.modalRouteModeChip,
                    editRouteMode === 'map' && styles.modalRouteModeChipActive,
                  ]}
                  onPress={() => setEditRouteMode('map')}
                >
                  <Ionicons
                    name="map-outline"
                    size={14}
                    color={editRouteMode === 'map' ? Colors.primary : Colors.gray[500]}
                  />
                  <Text
                    style={[
                      styles.modalRouteModeChipText,
                      editRouteMode === 'map' && styles.modalRouteModeChipTextActive,
                    ]}
                  >
                    Carte
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalRouteModeChip,
                    editRouteMode === 'manual' && styles.modalRouteModeChipActive,
                  ]}
                  onPress={() => setEditRouteMode('manual')}
                >
                  <Ionicons
                    name="create-outline"
                    size={14}
                    color={editRouteMode === 'manual' ? Colors.primary : Colors.gray[500]}
                  />
                  <Text
                    style={[
                      styles.modalRouteModeChipText,
                      editRouteMode === 'manual' && styles.modalRouteModeChipTextActive,
                    ]}
                  >
                    Saisie
                  </Text>
                </TouchableOpacity>
              </View>

              {editRouteMode === 'manual' ? (
                <>
                  <Text style={styles.modalLabel}>Adresse de depart</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalRouteInput]}
                    placeholder="Ex: avenue Kasa-Vubu, Bandal"
                    placeholderTextColor={Colors.gray[400]}
                    value={editDepartureManualAddress}
                    onChangeText={setEditDepartureManualAddress}
                    returnKeyType="next"
                  />
                  <Text style={styles.modalLabel}>Adresse d arrivee</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalRouteInput]}
                    placeholder="Ex: rond-point Victoire"
                    placeholderTextColor={Colors.gray[400]}
                    value={editArrivalManualAddress}
                    onChangeText={setEditArrivalManualAddress}
                    returnKeyType="done"
                    onSubmitEditing={handleContinueEditTrip}
                  />
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.modalRoutePointButton}
                    onPress={() => setEditRoutePickerTarget('departure')}
                  >
                    <View style={styles.modalRoutePointIcon}>
                      <Ionicons name="location" size={15} color={Colors.success} />
                    </View>
                    <View style={styles.modalRoutePointContent}>
                      <Text style={styles.modalRoutePointLabel}>Depart</Text>
                      <Text style={styles.modalRoutePointValue} numberOfLines={2}>
                        {editDepartureDisplay}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalRoutePointButton}
                    onPress={() => setEditRoutePickerTarget('arrival')}
                  >
                    <View style={styles.modalRoutePointIcon}>
                      <Ionicons name="navigate" size={15} color={Colors.primary} />
                    </View>
                    <View style={styles.modalRoutePointContent}>
                      <Text style={styles.modalRoutePointLabel}>Arrivee</Text>
                      <Text style={styles.modalRoutePointValue} numberOfLines={2}>
                        {editArrivalDisplay}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
                  </TouchableOpacity>
                </>
              )}
            </View>
                </>
              ) : (
                <>

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
                </>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={editStep === 1 ? closeEditModal : handleBackToEditRoute}
              >
                {editStep === 2 && (
                  <Ionicons name="arrow-back" size={18} color={Colors.gray[800]} style={{ marginRight: 4 }} />
                )}
                <Text style={styles.modalButtonSecondaryText}>{editStep === 1 ? 'Annuler' : 'Retour'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, { marginRight: 0 }]}
                onPress={editStep === 1 ? handleContinueEditTrip : handleSaveTrip}
                disabled={isSavingTrip}
              >
                {editStep === 1 ? (
                  <>
                    <Text style={styles.modalButtonPrimaryText}>Suivant</Text>
                    <Ionicons name="arrow-forward" size={18} color={Colors.white} style={{ marginLeft: 4 }} />
                  </>
                ) : isSavingTrip ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.modalButtonPrimaryText}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <LocationPickerModal
        visible={editRoutePickerTarget !== null}
        title={editRoutePickerTarget === 'departure' ? 'Choisir le depart' : 'Choisir l arrivee'}
        initialLocation={
          editRoutePickerTarget === 'departure' ? editDepartureSelection : editArrivalSelection
        }
        autoLocateOnOpen={false}
        onClose={() => setEditRoutePickerTarget(null)}
        onSelect={(location) => {
          const target = editRoutePickerTarget;
          setEditRoutePickerTarget(null);
          setEditRouteMode('map');
          if (target === 'departure') {
            setEditDepartureSelection(location);
            setEditDepartureManualAddress(location.title || location.address);
            return;
          }
          if (target === 'arrival') {
            setEditArrivalSelection(location);
            setEditArrivalManualAddress(location.title || location.address);
          }
        }}
      />

      <Modal transparent animationType="fade" visible={Boolean(deleteTarget)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Ionicons name="trash" size={28} color={Colors.danger} />
            </View>
            <Text style={styles.confirmTitle}>Supprimer ce trajet ?</Text>
            <Text style={styles.confirmText}>
              Cette action est irréversible. Les passagers seront informés de l&apos;annulation.
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
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  headerCopy: {
    flex: 1,
  },
  headerEyebrow: {
    marginBottom: 3,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    letterSpacing: 1.1,
    color: Colors.primary,
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  headerPublishButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    ...CommonStyles.shadowSm,
  },
  mainTabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.xl,
    padding: 4,
    marginBottom: Spacing.md,
  },
  mainTab: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTabActive: {
    backgroundColor: Colors.white,
    ...CommonStyles.shadowSm,
  },
  mainTabText: {
    textAlign: 'center',
    fontWeight: FontWeights.bold,
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  mainTabTextActive: {
    color: Colors.primary,
  },
  subTabsContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  subTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  subTabActive: {
    backgroundColor: Colors.primary + '12',
  },
  subTabText: {
    textAlign: 'center',
    fontWeight: FontWeights.medium,
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
  },
  subTabTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  searchContainer: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.gray[50],
  },
  searchInput: {
    flex: 1,
    height: 46,
    marginLeft: Spacing.sm,
    paddingVertical: 0,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
  },
  searchClearButton: {
    padding: Spacing.xs,
  },
  recurringHubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  recurringHubIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  recurringHubContent: {
    flex: 1,
  },
  recurringHubTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  recurringHubText: {
    marginTop: 4,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 19,
  },
  recurringHubAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  recurringHubActionText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
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
  emptySecondaryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
  },
  emptySecondaryButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  tripCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
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
  modalKeyboard: {
    flex: 1,
  },
  modalKeyboardIos: {
    backgroundColor: Colors.white,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlayIos: {
    backgroundColor: Colors.white,
    justifyContent: 'flex-start',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    flexDirection: 'column',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  modalCardIos: {
    flex: 1,
    maxHeight: '100%',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: Spacing.lg,
    elevation: 0,
    shadowOpacity: 0,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[300],
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
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
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalStepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: 4,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[50],
  },
  modalStepPill: {
    flex: 1,
    minHeight: 34,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modalStepPillActive: {
    backgroundColor: Colors.white,
    borderColor: Colors.primary + '25',
  },
  modalStepText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
  },
  modalStepTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  modalScrollView: {
    minHeight: 220,
    maxHeight: 430,
  },
  modalScrollViewIos: {
    flex: 1,
    maxHeight: '100%',
  },
  modalScrollContent: {
    paddingBottom: Spacing.xl,
  },
  modalRouteCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  modalRouteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalRouteTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  modalSwapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '10',
    borderWidth: 1,
    borderColor: Colors.primary + '18',
  },
  modalSwapButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  modalRouteModeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.sm,
    padding: 4,
  },
  modalRouteModeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: 'transparent',
  },
  modalRouteModeChipActive: {
    borderColor: Colors.primary + '30',
    backgroundColor: Colors.white,
  },
  modalRouteModeChipText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  modalRouteModeChipTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  modalRouteInput: {
    marginBottom: Spacing.sm,
    backgroundColor: Colors.gray[50],
    borderColor: Colors.gray[200],
  },
  modalRoutePointButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.gray[50],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 60,
  },
  modalRoutePointIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  modalRoutePointContent: {
    flex: 1,
    marginLeft: Spacing.sm,
    marginRight: Spacing.xs,
  },
  modalRoutePointLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    fontWeight: FontWeights.bold,
  },
  modalRoutePointValue: {
    marginTop: 2,
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
    fontWeight: FontWeights.semibold,
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
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: Spacing.xl,
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
