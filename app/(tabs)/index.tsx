import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetNotificationsQuery } from '@/store/api/notificationApi';
import { useGetMyTripRequestsQuery } from '@/store/api/tripRequestApi';
import {
  TripSearchParams,
  useGetTripsQuery,
  useSearchTripsByCoordinatesMutation,
} from '@/store/api/tripApi';
import { useGetCurrentUserQuery, useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectAvailableTrips, selectSavedLocations } from '@/store/selectors';
import { addSavedLocation } from '@/store/slices/locationSlice';
import { setTrips } from '@/store/slices/tripsSlice';
import { formatDateWithRelativeLabel, formatTime } from '@/utils/dateHelpers';
import { getTripRequestCreateHref, getTripRequestDetailHref } from '@/utils/requestNavigation';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const RECENT_TRIPS_LIMIT = 15;

type HomeQuickPlace = {
  id: string;
  title: string;
  subtitle: string;
  searchValue: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  badge: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { showDialog } = useDialog();
  const { width } = useWindowDimensions();
  const { data: currentUser } = useGetCurrentUserQuery();
  const { data: favoriteLocations = [], isLoading: favoriteLocationsLoading } =
    useGetFavoriteLocationsQuery();
  const storedTrips = useAppSelector(selectAvailableTrips);
  const savedLocations = useAppSelector(selectSavedLocations);
  const [queryParams, setQueryParams] = useState<TripSearchParams>({});
  const [searchTripsByCoordinates, { isLoading: advancedSearching }] =
    useSearchTripsByCoordinatesMutation();
  const [activePicker, setActivePicker] = useState<'departure' | 'arrival' | null>(null);
  const [filterDepartureLocation, setFilterDepartureLocation] = useState<MapLocationSelection | null>(
    null,
  );
  const [filterArrivalLocation, setFilterArrivalLocation] = useState<MapLocationSelection | null>(
    null,
  );
  const [departureRadius, setDepartureRadius] = useState('50');
  const [arrivalRadius, setArrivalRadius] = useState('50');
  const [minSeatsFilter, setMinSeatsFilter] = useState('');
  const [maxPriceFilter, setMaxPriceFilter] = useState('');
  const [showQuickFields, setShowQuickFields] = useState(false);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const {
    data: remoteTrips,
    isLoading: tripsLoading,
    isError: tripsError,
    refetch: refetchTrips,
  } = useGetTripsQuery(queryParams, {
    // Polling toutes les 60 secondes pour maintenir la liste à jour
    pollingInterval: 60000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  // console.log('remoteTrips', remoteTrips[0]);
  const { data: notificationsData } = useGetNotificationsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const { data: myBookings } = useGetMyBookingsQuery();
  const { data: myTripRequests = [] } = useGetMyTripRequestsQuery(undefined, {
    skip: !currentUser?.id,
    pollingInterval: 30000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (remoteTrips) {
      // Limiter le nombre de trajets stockés pour éviter les problèmes de mémoire
      const limitedTrips = remoteTrips.slice(0, 50);
      dispatch(setTrips(limitedTrips));
      // console.log('limitedTrips', limitedTrips);
    }
  }, [remoteTrips, dispatch]);

  // Créer un Set des IDs de trajets réservés par l'utilisateur
  const bookedTripIds = useMemo(() => {
    if (!myBookings || !currentUser?.id) {
      return new Set<string>();
    }
    // Filtrer les réservations actives (pending ou accepted) et créer un Set des tripIds
    return new Set(
      myBookings
        .filter(
          (booking) =>
            (booking.status === 'pending' || booking.status === 'accepted') &&
            booking.tripId
        )
        .map((booking) => booking.tripId)
    );
  }, [myBookings, currentUser?.id]);

  // Créer un Set des IDs de trajets avec réservation complétée (où le passager a été déposé)
  const completedBookingTripIds = useMemo(() => {
    if (!myBookings || !currentUser?.id) {
      return new Set<string>();
    }
    // Filtrer les réservations complétées (où le passager a été déposé)
    return new Set(
      myBookings
        .filter(
          (booking) =>
            booking.status === 'completed' &&
            booking.droppedOffConfirmedByPassenger === true &&
            booking.tripId
        )
        .map((booking) => booking.tripId)
    );
  }, [myBookings, currentUser?.id]);

  const activeTripRequest = useMemo(() => {
    const statusPriority = {
      driver_selected: 0,
      offers_received: 1,
      pending: 2,
    } as const;

    return [...myTripRequests]
      .filter(
        (request) =>
          (request.status === 'pending' ||
            request.status === 'offers_received' ||
            request.status === 'driver_selected') &&
          !request.tripId,
      )
      .sort((a, b) => {
        const priorityA = statusPriority[a.status as keyof typeof statusPriority] ?? 99;
        const priorityB = statusPriority[b.status as keyof typeof statusPriority] ?? 99;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        const updatedA = new Date(a.updatedAt || a.createdAt).getTime();
        const updatedB = new Date(b.updatedAt || b.createdAt).getTime();
        return updatedB - updatedA;
      })[0] ?? null;
  }, [myTripRequests]);

  const activeTripRequestPendingOffers = useMemo(
    () => activeTripRequest?.offers?.filter((offer) => offer.status === 'pending').length ?? 0,
    [activeTripRequest],
  );

  const activeTripRequestStatus = useMemo(() => {
    if (!activeTripRequest) return null;

    if (activeTripRequest.status === 'driver_selected') {
      return { label: 'Conducteur confirmé', color: Colors.success, bg: `${Colors.success}18` };
    }
    if (activeTripRequest.status === 'offers_received' || activeTripRequestPendingOffers > 0) {
      return { label: 'Offres reçues', color: Colors.info, bg: `${Colors.info}18` };
    }
    return { label: 'Recherche en cours', color: Colors.primary, bg: `${Colors.primary}18` };
  }, [activeTripRequest, activeTripRequestPendingOffers]);

  const activeTripRequestHeadline = useMemo(() => {
    if (!activeTripRequest) return '';
    if (activeTripRequest.status === 'driver_selected') {
      return activeTripRequest.selectedDriverName
        ? `${activeTripRequest.selectedDriverName} prépare votre prise en charge`
        : 'Votre conducteur est prêt pour la prise en charge';
    }
    if (activeTripRequestPendingOffers > 0) {
      return `${activeTripRequestPendingOffers} proposition${activeTripRequestPendingOffers > 1 ? 's' : ''} à consulter`;
    }
    return 'Votre demande reste visible pour les conducteurs autour de vous';
  }, [activeTripRequest, activeTripRequestPendingOffers]);

  const requestsRoute = (
    currentUser?.role === 'driver' || currentUser?.role === 'both' ? '/requests' : '/my-requests'
  ) as const;
  const requestsActionTitle =
    currentUser?.role === 'driver' || currentUser?.role === 'both'
      ? 'Voir les demandes'
      : 'Mes demandes';
  const requestsActionSubtitle =
    currentUser?.role === 'driver' || currentUser?.role === 'both'
      ? 'Trouver des passagers'
      : 'Suivre mes courses';

  const baseTrips = remoteTrips ?? storedTrips ?? [];
  const latestTrips = useMemo(() => {
    // Filtrer les trajets pour exclure ceux publiés par l'utilisateur actuel et ceux avec réservation complétée
    const filteredTrips = baseTrips.filter((trip) => {
      // Si l'utilisateur n'est pas connecté, afficher tous les trajets
      if (!currentUser?.id) {
        return true;
      }
      // Exclure les trajets dont l'utilisateur est le driver
      if (trip.driverId === currentUser.id) {
        return false;
      }
      // Exclure les trajets où l'utilisateur a une réservation complétée (déposé)
      if (completedBookingTripIds.has(trip.id)) {
        return false;
      }
      return true;
    });

    return [...filteredTrips]
      .sort((a: any, b: any) => {
        const departureA = new Date(a.departureTime).getTime();
        const departureB = new Date(b.departureTime).getTime();
        const safeDepartureA = Number.isFinite(departureA) ? departureA : Number.MAX_SAFE_INTEGER;
        const safeDepartureB = Number.isFinite(departureB) ? departureB : Number.MAX_SAFE_INTEGER;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartTs = todayStart.getTime();
        const tomorrowStartTs = todayStartTs + 24 * 60 * 60 * 1000;

        const aIsToday = safeDepartureA >= todayStartTs && safeDepartureA < tomorrowStartTs;
        const bIsToday = safeDepartureB >= todayStartTs && safeDepartureB < tomorrowStartTs;

        // Prioriser les trajets d'aujourd'hui.
        if (aIsToday !== bIsToday) {
          return aIsToday ? -1 : 1;
        }

        // Trier du plus tôt au plus tard.
        if (safeDepartureA !== safeDepartureB) {
          return safeDepartureA - safeDepartureB;
        }

        // Fallback stable sur la dernière mise à jour/publication.
        const recencyA = new Date(a.updatedAt || a.createdAt || a.departureTime).getTime();
        const recencyB = new Date(b.updatedAt || b.createdAt || b.departureTime).getTime();
        const safeRecencyA = Number.isFinite(recencyA) ? recencyA : 0;
        const safeRecencyB = Number.isFinite(recencyB) ? recencyB : 0;
        return safeRecencyB - safeRecencyA;
      })
      .slice(0, RECENT_TRIPS_LIMIT);
  }, [baseTrips, currentUser?.id, completedBookingTripIds]);
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [addMode, setAddMode] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customAddress, setCustomAddress] = useState('');
  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');

  const handleQuickSearch = () => {
    const trimmedDeparture = departure.trim();
    const trimmedArrival = arrival.trim();

    setQueryParams((prev) => ({
      ...prev,
      departureLocation: trimmedDeparture || undefined,
      arrivalLocation: trimmedArrival || undefined,
    }));

    router.push({
      pathname: '/search',
      params: {
        ...(trimmedDeparture ? { departure: trimmedDeparture } : {}),
        ...(trimmedArrival ? { arrival: trimmedArrival } : {}),
      },
    });
  };

  const advancedDepartureSummary = useMemo(
    () => ({
      title: filterDepartureLocation?.title ?? 'Point de départ',
      address: filterDepartureLocation?.address ?? 'Sélectionnez un lieu',
      coords: filterDepartureLocation
        ? `${filterDepartureLocation.latitude.toFixed(4)} / ${filterDepartureLocation.longitude.toFixed(4)}`
        : 'Coordonnées inconnues',
    }),
    [filterDepartureLocation],
  );

  const advancedArrivalSummary = useMemo(
    () => ({
      title: filterArrivalLocation?.title ?? 'Destination',
      address: filterArrivalLocation?.address ?? 'Sélectionnez un lieu',
      coords: filterArrivalLocation
        ? `${filterArrivalLocation.latitude.toFixed(4)} / ${filterArrivalLocation.longitude.toFixed(4)}`
        : 'Coordonnées inconnues',
    }),
    [filterArrivalLocation],
  );
  const handleAdvancedLocationSelect = (selection: MapLocationSelection) => {
    if (activePicker === 'departure') {
      setFilterDepartureLocation(selection);
    } else if (activePicker === 'arrival') {
      setFilterArrivalLocation(selection);
    }
    setActivePicker(null);
  };

  const parseNumberInput = (value: string) => {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const handleAdvancedSearch = async () => {
    const departureCoordinates = filterDepartureLocation
      ? ([filterDepartureLocation.longitude, filterDepartureLocation.latitude] as [number, number])
      : undefined;
    const arrivalCoordinates = filterArrivalLocation
      ? ([filterArrivalLocation.longitude, filterArrivalLocation.latitude] as [number, number])
      : undefined;

    if (!departureCoordinates && !arrivalCoordinates) {
      showDialog({
        variant: 'warning',
        title: 'Sélection requise',
        message: 'Choisissez au moins un point (départ ou arrivée) pour lancer la recherche.',
      });
      return;
    }

    const payload = {
      ...(departureCoordinates
        ? {
            departureCoordinates,
            departureRadiusKm: parseNumberInput(departureRadius) ?? 50,
          }
        : {}),
      ...(arrivalCoordinates
        ? {
            arrivalCoordinates,
            arrivalRadiusKm: parseNumberInput(arrivalRadius) ?? 50,
          }
        : {}),
      minSeats: parseNumberInput(minSeatsFilter),
      maxPrice: parseNumberInput(maxPriceFilter),
    };

    try {
      const results = await searchTripsByCoordinates(payload).unwrap();
      dispatch(setTrips(results));
      router.push({
        pathname: '/search',
        params: {
          mode: 'map',
          ...(filterDepartureLocation
            ? {
                departureLat: filterDepartureLocation.latitude.toString(),
                departureLng: filterDepartureLocation.longitude.toString(),
                departureRadiusKm: String(payload.departureRadiusKm ?? 50),
                departureLabel: filterDepartureLocation.title,
              }
            : {}),
          ...(filterArrivalLocation
            ? {
                arrivalLat: filterArrivalLocation.latitude.toString(),
                arrivalLng: filterArrivalLocation.longitude.toString(),
                arrivalRadiusKm: String(payload.arrivalRadiusKm ?? 50),
                arrivalLabel: filterArrivalLocation.title,
              }
            : {}),
        },
      });
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible de filtrer les trajets pour le moment.';
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
      });
    }
  };

  const handleClearAdvancedFilters = () => {
    setFilterDepartureLocation(null);
    setFilterArrivalLocation(null);
    setDepartureRadius('50');
    setArrivalRadius('50');
    setMinSeatsFilter('');
    setMaxPriceFilter('');
  };

  const handleLocationPress = (location: { coords: { latitude: number; longitude: number }; label: string }) => {
    router.push({
      pathname: '/search',
      params: {
        origin: location.label,
        latitude: location.coords.latitude.toString(),
        longitude: location.coords.longitude.toString(),
      },
    });
  };

  const handleAddLocation = () => {
    if (!customLabel || !customAddress || !customLat || !customLng) return;
    const latitude = parseFloat(customLat);
    const longitude = parseFloat(customLng);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return;
    }

    dispatch(
      addSavedLocation({
        id: `${Date.now()}`,
        label: customLabel,
        address: customAddress,
        coords: { latitude, longitude },
      }),
    );

    setCustomLabel('');
    setCustomAddress('');
    setCustomLat('');
    setCustomLng('');
    setAddMode(false);
  };

  const unreadNotifications = notificationsData?.unreadCount ?? 0;
  const hasLocationSelections = Boolean(filterDepartureLocation || filterArrivalLocation);
  const isCompactScreen = width <= 360;

  const quickPlaces = useMemo<HomeQuickPlace[]>(() => {
    const favoritePlaceCards = favoriteLocations.map((location) => {
      const typeMeta =
        location.type === 'home'
          ? {
              title: 'Domicile',
              icon: 'home' as const,
              accent: Colors.primary,
              badge: 'Favori',
            }
          : location.type === 'work'
            ? {
                title: 'Bureau',
                icon: 'briefcase' as const,
                accent: '#2563EB',
                badge: 'Favori',
              }
            : {
                title: location.name,
                icon: 'location' as const,
                accent: Colors.success,
                badge: 'Repere',
              };

      return {
        id: `favorite-${location.id}`,
        title: location.name || typeMeta.title,
        subtitle: location.notes || location.address,
        searchValue: location.address || location.name,
        icon: typeMeta.icon,
        accent: typeMeta.accent,
        badge: typeMeta.badge,
      };
    });

    const savedPlaceCards = savedLocations.map((location) => ({
      id: `saved-${location.id}`,
      title: location.label,
      subtitle: location.address,
      searchValue: location.address || location.label,
      icon: 'bookmark' as const,
      accent: Colors.warningDark,
      badge: 'Rapide',
    }));

    const mergedPlaces = [...favoritePlaceCards, ...savedPlaceCards];
    const dedupedPlaces = mergedPlaces.filter(
      (place, index, collection) =>
        collection.findIndex(
          (candidate) =>
            candidate.title.toLowerCase() === place.title.toLowerCase() &&
            candidate.searchValue.toLowerCase() === place.searchValue.toLowerCase(),
        ) === index,
    );

    return dedupedPlaces.slice(0, 4);
  }, [favoriteLocations, savedLocations]);

  const openNotifications = () => {
    router.push('/notifications');
  };

  const handleQuickPlacePress = (place: HomeQuickPlace) => {
    router.push({
      pathname: '/search',
      params: {
        departure: place.searchValue,
      },
    });
  };

  const animatedSearchCardStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isHeaderExpanded ? 1 : 0, { duration: 200 }),
    maxHeight: withTiming(isHeaderExpanded ? 1000 : 0, { duration: 300 }),
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header avec un nouveau style plus moderne */}
      <View style={styles.header}>
        <LinearGradient
          colors={[Colors.primary, '#2563EB']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Bonjour {currentUser?.name?.split(' ')[0] || ''} 👋</Text>
            <Text style={styles.headerTitle}>Où allez-vous ?</Text>
          </View>
          <View style={styles.headerTopRight}>
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setIsHeaderExpanded(!isHeaderExpanded)}
            >
              <Ionicons
                name={isHeaderExpanded ? "search" : "options-outline"}
                size={20}
                color={Colors.white}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.notificationButton} onPress={openNotifications}>
              <Ionicons name="notifications-outline" size={24} color={Colors.white} />
              {unreadNotifications > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Recherche intelligente - Améliorée */}
        <Animated.View
          style={[
            styles.searchCardContainer,
            animatedSearchCardStyle,
          ]}
        >
          <View style={styles.searchCard}>
            <View style={styles.advancedCard}>
              <View style={styles.advancedHeader}>
                <Text style={styles.advancedTitle}>Recherche précise</Text>
                <Ionicons name="map" size={20} color={Colors.primary} />
              </View>

              <View style={styles.advancedLocations}>
                <TouchableOpacity
                  style={styles.advancedLocationButton}
                  onPress={() => setActivePicker('departure')}
                >
                  <View style={[styles.advancedLocationIcon, { backgroundColor: Colors.success + '15' }]}>
                    <Ionicons name="location" size={18} color={Colors.success} />
                  </View>
                  <View style={styles.advancedLocationContent}>
                    <Text style={styles.advancedLocationLabel}>Départ</Text>
                    <Text style={styles.advancedLocationTitle} numberOfLines={1}>
                      {filterDepartureLocation?.title ?? 'Point de départ'}
                    </Text>
                    <Text style={styles.advancedLocationSubtitle} numberOfLines={1}>
                      {filterDepartureLocation?.address ?? 'Sélectionnez un lieu'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.advancedLocationDivider}>
                  <View style={styles.locationLine} />
                </View>

                <TouchableOpacity
                  style={styles.advancedLocationButton}
                  onPress={() => setActivePicker('arrival')}
                >
                  <View style={[styles.advancedLocationIcon, { backgroundColor: Colors.primary + '15' }]}>
                    <Ionicons name="navigate" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.advancedLocationContent}>
                    <Text style={styles.advancedLocationLabel}>Arrivée</Text>
                    <Text style={styles.advancedLocationTitle} numberOfLines={1}>
                      {filterArrivalLocation?.title ?? 'Destination'}
                    </Text>
                    <Text style={styles.advancedLocationSubtitle} numberOfLines={1}>
                      {filterArrivalLocation?.address ?? 'Où souhaitez-vous aller ?'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {hasLocationSelections && (
                <View style={styles.advancedButtons}>
                  <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={handleClearAdvancedFilters}>
                    <Text style={styles.buttonSecondaryText}>Effacer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.buttonPrimary,
                      { flex: 1, marginLeft: Spacing.md },
                      (advancedSearching) && styles.buttonDisabled,
                    ]}
                    onPress={handleAdvancedSearch}
                    disabled={advancedSearching}
                  >
                    {advancedSearching ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={styles.buttonText}>Rechercher</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Animated.View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.section, isCompactScreen && styles.sectionCompact]}>
          <View style={[styles.quickActionsLead, isCompactScreen && styles.quickActionsLeadCompact]}>
            <Text style={styles.quickActionsEyebrow}>Actions rapides</Text>
            <Text style={styles.sectionTitle}>Choisissez votre prochaine action</Text>
            <Text style={[styles.quickActionsLeadText, isCompactScreen && styles.quickActionsLeadTextCompact]}>
              Publiez si vous conduisez, trouvez un trajet si vous voyagez, ou gérez vos demandes sans chercher.
            </Text>
          </View>

          <View style={[styles.quickActionsPrimaryRow, isCompactScreen && styles.quickActionsRowCompact]}>
            <TouchableOpacity
              activeOpacity={0.92}
              style={[
                styles.quickActionPrimaryCard,
                styles.publishActionCard,
                isCompactScreen && styles.quickActionPrimaryCardCompact,
              ]}
              onPress={() => router.push('/publish')}
            >
              <LinearGradient
                colors={[Colors.primary, '#2563EB']}
                style={[
                  styles.quickActionPrimaryGradient,
                  isCompactScreen && styles.quickActionPrimaryGradientCompact,
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={[styles.quickActionPrimaryTop, isCompactScreen && styles.quickActionPrimaryTopCompact]}>
                  <View style={[styles.quickActionPrimaryIcon, isCompactScreen && styles.quickActionPrimaryIconCompact]}>
                    <Ionicons name="add" size={28} color={Colors.white} />
                  </View>
                  <View
                    style={[
                      styles.quickActionPrimaryBadge,
                      isCompactScreen && styles.quickActionPrimaryBadgeCompact,
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickActionPrimaryBadgeText,
                        isCompactScreen && styles.quickActionPrimaryBadgeTextCompact,
                      ]}
                      numberOfLines={1}
                    >
                      Conducteur
                    </Text>
                  </View>
                </View>
                <Text style={[styles.quickActionPrimaryTitle, isCompactScreen && styles.quickActionPrimaryTitleCompact]}>
                  Publier un trajet
                </Text>
                <Text
                  style={[
                    styles.quickActionPrimarySubtitle,
                    isCompactScreen && styles.quickActionPrimarySubtitleCompact,
                  ]}
                >
                  Proposer mes places et recevoir des réservations.
                </Text>
                <View style={[styles.quickActionPrimaryFooter, isCompactScreen && styles.quickActionPrimaryFooterCompact]}>
                  <Text
                    style={[
                      styles.quickActionPrimaryFooterText,
                      isCompactScreen && styles.quickActionPrimaryFooterTextCompact,
                    ]}
                  >
                    Commencer
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.92}
              style={[
                styles.quickActionPrimaryCard,
                styles.searchActionCard,
                isCompactScreen && styles.quickActionPrimaryCardCompact,
              ]}
              onPress={() => router.push('/search')}
            >
              <LinearGradient
                colors={['#2563EB', '#0EA5E9']}
                style={[
                  styles.quickActionPrimaryGradient,
                  isCompactScreen && styles.quickActionPrimaryGradientCompact,
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={[styles.quickActionPrimaryTop, isCompactScreen && styles.quickActionPrimaryTopCompact]}>
                  <View style={[styles.quickActionPrimaryIcon, isCompactScreen && styles.quickActionPrimaryIconCompact]}>
                    <Ionicons name="search" size={24} color={Colors.white} />
                  </View>
                  <View
                    style={[
                      styles.quickActionPrimaryBadge,
                      isCompactScreen && styles.quickActionPrimaryBadgeCompact,
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickActionPrimaryBadgeText,
                        isCompactScreen && styles.quickActionPrimaryBadgeTextCompact,
                      ]}
                      numberOfLines={1}
                    >
                      Passager
                    </Text>
                  </View>
                </View>
                <Text style={[styles.quickActionPrimaryTitle, isCompactScreen && styles.quickActionPrimaryTitleCompact]}>
                  Trouver un trajet
                </Text>
                <Text
                  style={[
                    styles.quickActionPrimarySubtitle,
                    isCompactScreen && styles.quickActionPrimarySubtitleCompact,
                  ]}
                >
                  Rechercher une place disponible pour voyager rapidement.
                </Text>
                <View style={[styles.quickActionPrimaryFooter, isCompactScreen && styles.quickActionPrimaryFooterCompact]}>
                  <Text
                    style={[
                      styles.quickActionPrimaryFooterText,
                      isCompactScreen && styles.quickActionPrimaryFooterTextCompact,
                    ]}
                  >
                    Rechercher
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.quickActionsSecondaryRow,
              isCompactScreen && styles.quickActionsRowCompact,
              isCompactScreen && styles.quickActionsSecondaryRowCompact,
            ]}
          >
            <TouchableOpacity
              style={[styles.quickActionCard, styles.requestActionCard, isCompactScreen && styles.quickActionCardCompact]}
                onPress={() => router.push(getTripRequestCreateHref())}
            >
              <View style={[styles.quickActionBadge, isCompactScreen && styles.quickActionBadgeCompact]}>
                <Text style={[styles.quickActionBadgeText, isCompactScreen && styles.quickActionBadgeTextCompact]}>Flexible</Text>
              </View>
              <View
                style={[
                  styles.quickActionIcon,
                  { backgroundColor: Colors.success },
                  isCompactScreen && styles.quickActionIconCompact,
                ]}
              >
                <Ionicons name="paper-plane" size={24} color={Colors.white} />
              </View>
              <Text style={[styles.quickActionTitle, isCompactScreen && styles.quickActionTitleCompact]}>Demander une course</Text>
              <Text style={[styles.quickActionSubtitle, isCompactScreen && styles.quickActionSubtitleCompact]}>Créer un trajet sur mesure</Text>
              <View style={[styles.quickActionFooter, isCompactScreen && styles.quickActionFooterCompact]}>
                <Text style={styles.quickActionFooterText}>Ouvrir</Text>
                <Ionicons name="arrow-forward" size={16} color={Colors.success} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionCard, styles.listActionCard, isCompactScreen && styles.quickActionCardCompact]}
              onPress={() => router.push(requestsRoute)}
            >
              <View style={[styles.quickActionBadge, isCompactScreen && styles.quickActionBadgeCompact]}>
                <Text style={[styles.quickActionBadgeText, isCompactScreen && styles.quickActionBadgeTextCompact]}>Suivi</Text>
              </View>
              <View
                style={[
                  styles.quickActionIcon,
                  { backgroundColor: '#8B5CF6' },
                  isCompactScreen && styles.quickActionIconCompact,
                ]}
              >
                <Ionicons name="list" size={24} color={Colors.white} />
              </View>
              <Text style={[styles.quickActionTitle, isCompactScreen && styles.quickActionTitleCompact]}>{requestsActionTitle}</Text>
              <Text style={[styles.quickActionSubtitle, isCompactScreen && styles.quickActionSubtitleCompact]}>{requestsActionSubtitle}</Text>
              <View style={[styles.quickActionFooter, isCompactScreen && styles.quickActionFooterCompact]}>
                <Text style={[styles.quickActionFooterText, { color: '#7C3AED' }]}>Voir</Text>
                <Ionicons name="arrow-forward" size={16} color="#7C3AED" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {activeTripRequest && activeTripRequestStatus && (
          <View style={styles.section}>
            <TouchableOpacity
              activeOpacity={0.92}
              style={styles.activeRequestCard}
              onPress={() => router.push(getTripRequestDetailHref(activeTripRequest.id))}
            >
              <LinearGradient colors={['#FFF7ED', '#FFFFFF']} style={styles.activeRequestGradient}>
                <View style={styles.activeRequestHeader}>
                  <View style={styles.activeRequestPill}>
                    <Ionicons name="paper-plane-outline" size={14} color={Colors.primary} />
                    <Text style={styles.activeRequestPillText}>Demande en cours</Text>
                  </View>
                  <View
                    style={[
                      styles.activeRequestStatusBadge,
                      { backgroundColor: activeTripRequestStatus.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.activeRequestStatusText,
                        { color: activeTripRequestStatus.color },
                      ]}
                    >
                      {activeTripRequestStatus.label}
                    </Text>
                  </View>
                </View>

                <Text style={styles.activeRequestTitle}>{activeTripRequestHeadline}</Text>
                <Text style={styles.activeRequestRoute}>
                  {activeTripRequest.departure.name} vers {activeTripRequest.arrival.name}
                </Text>

                <View style={styles.activeRequestMetaRow}>
                  <View style={styles.activeRequestMetaChip}>
                    <Ionicons name="time-outline" size={14} color={Colors.gray[600]} />
                    <Text style={styles.activeRequestMetaText}>
                      {formatDateWithRelativeLabel(activeTripRequest.departureDateMin, true)}
                    </Text>
                  </View>
                  <View style={styles.activeRequestMetaChip}>
                    <Ionicons
                      name={activeTripRequestPendingOffers > 0 ? 'sparkles-outline' : 'cash-outline'}
                      size={14}
                      color={Colors.gray[600]}
                    />
                    <Text style={styles.activeRequestMetaText}>
                      {activeTripRequestPendingOffers > 0
                        ? `${activeTripRequestPendingOffers} offre${activeTripRequestPendingOffers > 1 ? 's' : ''}`
                        : activeTripRequest.maxPricePerSeat
                          ? `${activeTripRequest.maxPricePerSeat} FC max`
                          : `${activeTripRequest.numberOfSeats} place${activeTripRequest.numberOfSeats > 1 ? 's' : ''}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.activeRequestFooter}>
                  <Text style={styles.activeRequestFooterText}>Ouvrir ma demande</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.primary} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.section, styles.quickPlacesSection]}>
          <View style={styles.quickPlacesLead}>
            <View style={styles.quickPlacesLeadCopy}>
              <Text style={styles.quickPlacesEyebrow}>Départ rapide</Text>
              <Text style={styles.sectionTitle}>Mes lieux utiles</Text>
              <Text style={styles.quickPlacesLeadText}>
                Retrouvez vos repères les plus utilisés et relancez une recherche en un geste.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.quickPlacesManageButton}
              onPress={() => router.push('/favorite-locations')}
            >
              <Ionicons name="options-outline" size={16} color={Colors.gray[800]} />
              <Text style={styles.quickPlacesManageText}>Gérer</Text>
            </TouchableOpacity>
          </View>

          {favoriteLocationsLoading && quickPlaces.length === 0 ? (
            <View style={styles.quickPlacesStateCard}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.quickPlacesStateText}>Chargement de vos lieux favoris...</Text>
            </View>
          ) : quickPlaces.length > 0 ? (
            <View style={styles.quickPlacesGrid}>
              {quickPlaces.map((place) => (
                <TouchableOpacity
                  key={place.id}
                  style={[styles.quickPlaceCard, { borderColor: `${place.accent}22` }]}
                  onPress={() => handleQuickPlacePress(place)}
                >
                  <View style={styles.quickPlaceHeader}>
                    <View
                      style={[
                        styles.quickPlaceIcon,
                        { backgroundColor: `${place.accent}18` },
                      ]}
                    >
                      <Ionicons name={place.icon} size={18} color={place.accent} />
                    </View>
                    <View style={styles.quickPlaceBadge}>
                      <Text style={styles.quickPlaceBadgeText}>{place.badge}</Text>
                    </View>
                  </View>

                  <View style={styles.quickPlaceBody}>
                    <Text style={styles.quickPlaceTitle} numberOfLines={1}>
                      {place.title}
                    </Text>
                    <Text style={styles.quickPlaceSubtitle} numberOfLines={2}>
                      {place.subtitle}
                    </Text>
                  </View>

                  <View style={[styles.quickPlaceAction, { backgroundColor: `${place.accent}12` }]}>
                    <Text style={[styles.quickPlaceActionText, { color: place.accent }]}>Partir d&apos;ici</Text>
                    <Ionicons name="arrow-forward" size={16} color={place.accent} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.quickPlacesEmptyCard}
              onPress={() => router.push('/favorite-locations')}
            >
              <View style={styles.quickPlacesEmptyIcon}>
                <Ionicons name="location-outline" size={22} color={Colors.primary} />
              </View>
              <View style={styles.quickPlacesEmptyContent}>
                <Text style={styles.quickPlacesEmptyTitle}>Ajoutez vos repères utiles</Text>
                <Text style={styles.quickPlacesEmptyText}>
                  Enregistrez Domicile, Bureau ou un lieu connu pour lancer une recherche plus vite.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
            </TouchableOpacity>
          )}
        </View>


        {/* Trajets disponibles */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Trajets disponibles</Text>
            <TouchableOpacity onPress={() => router.push('/search')}>
              <Text style={styles.seeAllText}>Voir tout</Text>
            </TouchableOpacity>
          </View>

          {tripsLoading && (
            <View style={styles.tripStateCard}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.tripStateText}>Chargement des trajets...</Text>
            </View>
          )}

          {tripsError && !tripsLoading && (
            <View style={styles.tripStateCard}>
              <Ionicons name="alert-circle" size={24} color={Colors.danger} />
              <Text style={styles.tripStateText}>Impossible de charger les trajets.</Text>
              <TouchableOpacity style={styles.retryButton} onPress={refetchTrips}>
                <Text style={styles.retryButtonText}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          )}

          {!tripsLoading && !tripsError && latestTrips.length === 0 && (
            <View style={styles.tripStateCard}>
              <Ionicons name="car-outline" size={24} color={Colors.gray[500]} />
              <Text style={styles.tripStateText}>Aucun trajet pour le moment.</Text>
              <Text style={styles.tripStateSubText}>Publiez le vôtre ou revenez plus tard.</Text>
            </View>
          )}

          {latestTrips.map((trip) => {
            const TripCardWithArrival = () => {
              const calculatedArrivalTime = useTripArrivalTime(trip);
              const arrivalTimeDisplay = calculatedArrivalTime
                ? formatTime(calculatedArrivalTime.toISOString())
                : formatTime(trip.arrivalTime);

              const parsedRating = Number(trip.driverRating);
              const hasDriverRating = Number.isFinite(parsedRating) && parsedRating > 0;

              return (
                <View key={trip.id} style={styles.tripCard}>
                  <View style={styles.tripHeader}>
                    <View style={styles.tripDriverInfo}>
                      {trip.driverAvatar ? (
                        <Image
                          source={{ uri: trip.driverAvatar }}
                          style={styles.avatar}
                          resizeMode="cover"
                          defaultSource={require('@/assets/images/zwanga-transparent.png')}
                        />
                      ) : (
                        <View style={styles.avatar} />
                      )}
                      <View style={styles.tripDriverDetails}>
                        <Text style={styles.driverName} numberOfLines={1} ellipsizeMode="tail">
                          {trip?.driverName ?? ''}
                        </Text>
                        <View style={styles.driverMeta}>
                          <Ionicons
                            name={hasDriverRating ? "star" : "star-outline"}
                            size={14}
                            color={hasDriverRating ? Colors.secondary : Colors.gray[400]}
                          />
                          <Text
                            style={[
                              styles.driverRating,
                              !hasDriverRating && styles.driverRatingPlaceholder,
                            ]}
                          >
                            {hasDriverRating ? parsedRating.toFixed(1) : 'Nouveau'}
                          </Text>
                          <View style={styles.dot} />
                          <Text style={styles.vehicleInfo} numberOfLines={1} ellipsizeMode="tail">
                            {trip?.vehicle
                              ? `${trip.vehicle.brand} ${trip.vehicle.model}${trip.vehicle.color ? ` • ${trip.vehicle.color}` : ''}`
                              : trip?.vehicleInfo ?? ''}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.headerBadges}>
                      {bookedTripIds.has(trip.id) && (
                        <View style={styles.bookedBadge}>
                          <Ionicons name="checkmark-circle" size={10} color={Colors.primary} />
                          <Text style={styles.bookedBadgeText}>Réservé</Text>
                        </View>
                      )}
                      {trip?.status === 'ongoing' && !bookedTripIds.has(trip.id) && (
                        <View style={styles.ongoingBadge}>
                          <Ionicons name="car-sport" size={10} color={Colors.success} />
                          <Text style={styles.ongoingBadgeText}>En cours</Text>
                        </View>
                      )}
                      {trip?.price === 0 ? (
                        <View style={styles.freeBadge}>
                          <Text style={styles.freeBadgeText}>Gratuit</Text>
                        </View>
                      ) : (
                        <View style={styles.priceBadge}>
                          <Text style={styles.priceText}>{trip?.price ?? 0} FC</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.tripRoute}>
                    <View style={styles.routeRow}>
                      <Ionicons name="location" size={16} color={Colors.success} />
                      <Text style={styles.routeText}>{trip?.departure?.name ?? ''}</Text>
                      <View style={styles.timeContainer}>
                        <Text style={styles.routeDateLabel}>
                          {formatDateWithRelativeLabel(trip.departureTime, false)}
                        </Text>
                        <Text style={styles.routeTime}>
                          {formatTime(trip.departureTime)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.routeRow}>
                      <Ionicons name="navigate" size={16} color={Colors.primary} />
                      <Text style={styles.routeText}>{trip?.arrival?.name ?? ''}</Text>
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

                  <View style={styles.tripFooter}>
                    <View style={styles.tripFooterLeft}>
                      <Ionicons name="people" size={16} color={Colors.gray[600]} />
                      <Text style={styles.seatsText}>
                        {trip?.availableSeats} places disponibles
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.reserveButton,
                        bookedTripIds.has(trip.id) && styles.viewButton
                      ]}
                      onPress={() => router.push(`/trip/${trip.id}`)}
                    >
                      <Text style={styles.reserveButtonText}>
                        {bookedTripIds.has(trip.id) ? 'Voir' : 'Réserver'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            };

            return <TripCardWithArrival key={trip.id} />;
          })}
        </View>
      </ScrollView>

      <LocationPickerModal
        visible={activePicker !== null}
        title={
          activePicker === 'departure'
            ? 'Sélectionner le point de départ'
            : 'Sélectionner la destination'
        }
        initialLocation={
          activePicker === 'departure'
            ? filterDepartureLocation
            : activePicker === 'arrival'
              ? filterArrivalLocation
              : null
        }
        onClose={() => setActivePicker(null)}
        onSelect={handleAdvancedLocationSelect}
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: BorderRadius.xxl,
    borderBottomRightRadius: BorderRadius.xxl,
    overflow: 'hidden',
    position: 'relative',
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    zIndex: 1,
  },
  headerTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  expandButton: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  greeting: {
    color: Colors.white,
    opacity: 0.9,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    marginBottom: 2,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
  },
  notificationButton: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  notificationBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  searchCardContainer: {
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  searchCard: {
    backgroundColor: 'transparent',
  },
  advancedCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    ...CommonStyles.shadowLg,
  },
  advancedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  advancedTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  advancedLocations: {
    gap: 0,
  },
  advancedLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  advancedLocationIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  advancedLocationContent: {
    flex: 1,
  },
  advancedLocationLabel: {
    fontSize: 10,
    color: Colors.gray[500],
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  advancedLocationTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  advancedLocationSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  advancedLocationDivider: {
    height: 20,
    marginLeft: 22,
    justifyContent: 'center',
  },
  locationLine: {
    width: 2,
    height: '100%',
    backgroundColor: Colors.gray[200],
    borderRadius: 1,
  },
  advancedButtons: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  button: {
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  buttonPrimary: {
    backgroundColor: Colors.primary,
  },
  buttonSecondary: {
    backgroundColor: Colors.gray[100],
  },
  buttonSecondaryText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.bold,
  },
  buttonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingTop: Spacing.md,
    paddingBottom: 100,
  },
  section: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  sectionCompact: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  quickPlacesSection: {
    paddingTop: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  seeAllText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  quickPlacesLead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  quickPlacesLeadCopy: {
    flex: 1,
  },
  quickPlacesEyebrow: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  quickPlacesLeadText: {
    marginTop: 6,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 20,
    maxWidth: 300,
  },
  quickPlacesManageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: '#FFF8F3',
    borderWidth: 1,
    borderColor: Colors.primary + '12',
  },
  quickPlacesManageText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  quickPlacesStateCard: {
    backgroundColor: '#FFF8F3',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '12',
  },
  quickPlacesStateText: {
    color: Colors.gray[600],
    textAlign: 'center',
  },
  quickPlacesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  quickPlaceCard: {
    width: '48%',
    backgroundColor: '#FFF8F3',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    minHeight: 168,
    justifyContent: 'space-between',
    borderWidth: 1,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  quickPlaceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  quickPlaceBody: {
    flex: 1,
  },
  quickPlaceIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPlaceBadge: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  quickPlaceBadgeText: {
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  quickPlaceTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  quickPlaceSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 19,
    minHeight: 38,
  },
  quickPlaceAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  quickPlaceActionText: {
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
  },
  quickPlacesEmptyCard: {
    backgroundColor: '#FFF8F3',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '12',
  },
  quickPlacesEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPlacesEmptyContent: {
    flex: 1,
  },
  quickPlacesEmptyTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  quickPlacesEmptyText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 18,
  },
  quickActionsLead: {
    marginBottom: Spacing.md,
  },
  quickActionsLeadCompact: {
    marginBottom: Spacing.sm,
  },
  quickActionsEyebrow: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  quickActionsLeadText: {
    marginTop: 6,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 20,
    maxWidth: 320,
  },
  quickActionsLeadTextCompact: {
    fontSize: 13,
    lineHeight: 18,
    maxWidth: '100%',
  },
  quickActionsPrimaryRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  quickActionsSecondaryRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  quickActionsRowCompact: {
    gap: Spacing.sm,
  },
  quickActionsSecondaryRowCompact: {
    marginTop: Spacing.sm,
  },
  quickActionPrimaryCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: BorderRadius.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    ...CommonStyles.shadowMd,
  },
  quickActionPrimaryCardCompact: {
    borderRadius: BorderRadius.xl,
  },
  quickActionPrimaryGradient: {
    minHeight: 182,
    padding: Spacing.md,
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  quickActionPrimaryGradientCompact: {
    minHeight: 164,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  quickActionPrimaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  quickActionPrimaryTopCompact: {
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  quickActionPrimaryIcon: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  quickActionPrimaryIconCompact: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
  },
  quickActionPrimaryBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  quickActionPrimaryBadgeCompact: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 5,
    flexShrink: 1,
    maxWidth: '60%',
  },
  quickActionPrimaryBadgeText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
  },
  quickActionPrimaryBadgeTextCompact: {
    fontSize: 10,
  },
  quickActionPrimaryTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    lineHeight: 24,
  },
  quickActionPrimaryTitleCompact: {
    fontSize: FontSizes.base,
    lineHeight: 22,
  },
  quickActionPrimarySubtitle: {
    fontSize: FontSizes.sm,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 20,
  },
  quickActionPrimarySubtitleCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  quickActionPrimaryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
  },
  quickActionPrimaryFooterCompact: {
    paddingTop: Spacing.xs,
  },
  quickActionPrimaryFooterText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  quickActionPrimaryFooterTextCompact: {
    fontSize: 13,
  },
  quickActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  quickActionCard: {
    flex: 1,
    minWidth: 0,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xxl,
    backgroundColor: '#FFFCF8',
    minHeight: 164,
    justifyContent: 'space-between',
    borderWidth: 1,
    ...CommonStyles.shadowSm,
  },
  quickActionCardCompact: {
    padding: Spacing.md,
    minHeight: 150,
    borderRadius: BorderRadius.xl,
  },
  publishActionCard: {
    borderColor: Colors.primary + '16',
  },
  searchActionCard: {
    borderColor: '#3B82F620',
  },
  requestActionCard: {
    backgroundColor: '#F2FBF7',
    borderColor: Colors.success + '18',
  },
  listActionCard: {
    backgroundColor: '#F7F4FF',
    borderColor: '#8B5CF620',
  },
  quickActionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    marginBottom: Spacing.md,
  },
  quickActionBadgeCompact: {
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  quickActionBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
    textTransform: 'uppercase',
  },
  quickActionBadgeTextCompact: {
    fontSize: 10,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  quickActionIconCompact: {
    width: 42,
    height: 42,
    marginBottom: Spacing.sm,
  },
  quickActionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    lineHeight: 22,
  },
  quickActionTitleCompact: {
    fontSize: 15,
    lineHeight: 20,
  },
  quickActionSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 4,
    lineHeight: 19,
  },
  quickActionSubtitleCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  quickActionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  quickActionFooterCompact: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  quickActionFooterText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.success,
  },
  activeRequestCard: {
    borderRadius: BorderRadius.xxl,
    overflow: 'hidden',
    ...CommonStyles.shadowSm,
  },
  activeRequestGradient: {
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '15',
    gap: Spacing.md,
  },
  activeRequestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  activeRequestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '12',
  },
  activeRequestPillText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  activeRequestStatusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  activeRequestStatusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  activeRequestTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  activeRequestRoute: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 20,
  },
  activeRequestMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  activeRequestMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  activeRequestMetaText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  activeRequestFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  activeRequestFooterText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  tripCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  tripDriverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray[200],
    marginRight: Spacing.md,
  },
  tripDriverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  driverRating: {
    fontSize: 12,
    color: Colors.gray[600],
    marginLeft: 4,
  },
  driverRatingPlaceholder: {
    color: Colors.gray[500],
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.gray[400],
    marginHorizontal: 6,
  },
  vehicleInfo: {
    fontSize: 12,
    color: Colors.gray[500],
    flex: 1,
  },
  headerBadges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  bookedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bookedBadgeText: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    marginLeft: 4,
  },
  ongoingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ongoingBadgeText: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: Colors.success,
    marginLeft: 4,
  },
  priceBadge: {
    backgroundColor: Colors.success + '10',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  priceText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.success,
  },
  freeBadge: {
    backgroundColor: Colors.success + '15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  freeBadgeText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.success,
  },
  tripRoute: {
    marginVertical: Spacing.md,
    paddingLeft: 4,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginVertical: 4,
  },
  routeText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  routeDateLabel: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  routeTime: {
    fontSize: 12,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[50],
  },
  tripFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  seatsText: {
    fontSize: 13,
    color: Colors.gray[600],
  },
  reserveButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.lg,
  },
  viewButton: {
    backgroundColor: Colors.secondary,
  },
  reserveButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: 14,
  },
  tripStateCard: {
    padding: Spacing.xxl,
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
  },
  tripStateText: {
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    fontWeight: FontWeights.bold,
    marginTop: Spacing.md,
  },
  tripStateSubText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    textAlign: 'center',
    marginTop: 4,
  },
  retryButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
});

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: Colors.gray[50],
//   },
//   header: {
//     backgroundColor: Colors.primary,
//     paddingHorizontal: Spacing.xl,
//     paddingTop: Spacing.lg,
//     paddingBottom: Spacing.lg,
//     borderBottomLeftRadius: BorderRadius.xxl,
//     borderBottomRightRadius: BorderRadius.xxl,
//   },
//   headerTop: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     marginBottom: Spacing.xl,
//   },
//   headerTopRight: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: Spacing.sm,
//   },
//   expandButton: {
//     width: 40,
//     height: 40,
//     backgroundColor: 'rgba(255, 255, 255, 0.2)',
//     borderRadius: BorderRadius.full,
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   greeting: {
//     color: Colors.white,
//     opacity: 0.8,
//     fontSize: FontSizes.sm,
//     marginBottom: Spacing.xs,
//   },
//   headerTitle: {
//     color: Colors.white,
//     fontSize: FontSizes.xxl,
//     fontWeight: FontWeights.bold,
//   },
//   notificationButton: {
//     width: 48,
//     height: 48,
//     backgroundColor: 'rgba(255, 255, 255, 0.2)',
//     borderRadius: BorderRadius.full,
//     alignItems: 'center',
//     justifyContent: 'center',
//     position: 'relative',
//   },
//   notificationBadge: {
//     position: 'absolute',
//     top: -2,
//     right: -2,
//     minWidth: 18,
//     height: 18,
//     borderRadius: BorderRadius.full,
//     backgroundColor: Colors.danger,
//     alignItems: 'center',
//     justifyContent: 'center',
//     paddingHorizontal: Spacing.xs / 2,
//   },
//   notificationBadgeText: {
//     color: Colors.white,
//     fontSize: FontSizes.xs,
//     fontWeight: FontWeights.bold,
//   },
//   searchCardContainer: {
//     marginTop: Spacing.md,
//     overflow: 'hidden',
//   },
//   searchCard: {
//     backgroundColor: Colors.primary,
//     borderRadius: BorderRadius.xl,
//     padding: Spacing.lg,
//     ...CommonStyles.shadowLg,
//   },
//   searchRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: Spacing.md,
//     paddingBottom: Spacing.md,
//     borderBottomWidth: 1,
//     borderBottomColor: Colors.gray[100],
//   },
//   searchDivider: {
//     height: 1,
//     backgroundColor: Colors.gray[100],
//     marginBottom: Spacing.md,
//   },
//   searchInput: {
//     flex: 1,
//     marginLeft: Spacing.md,
//     fontSize: FontSizes.base,
//     color: Colors.gray[800],
//   },
//   searchButton: {
//     backgroundColor: Colors.primary,
//     marginTop: Spacing.lg,
//     paddingVertical: Spacing.md,
//     borderRadius: BorderRadius.md,
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   searchButtonText: {
//     color: Colors.white,
//     fontSize: FontSizes.base,
//     fontWeight: FontWeights.bold,
//   },
//   scrollView: {
//     flex: 1,
//   },
//   scrollViewContent: {
//     flexGrow: 1,
//     paddingHorizontal: Spacing.xl,
//     paddingTop: Spacing.xl,
//     paddingBottom: 120, // Increased to ensure content is not hidden behind the tab bar
//   },
//   section: {
//     marginBottom: Spacing.xl,
//   },
//   sectionHeader: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     marginBottom: Spacing.md,
//   },
//   sectionTitle: {
//     fontSize: FontSizes.lg,
//     fontWeight: FontWeights.bold,
//     color: Colors.gray[800],
//     marginBottom: Spacing.md,
//   },
//   seeAllText: {
//     color: Colors.primary,
//     fontSize: FontSizes.base,
//     fontWeight: FontWeights.semibold,
//   },
//   popularLocations: {
//     flexDirection: 'row',
//     flexWrap: 'wrap',
//     marginBottom: Spacing.md,
//   },
//   locationChip: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: Colors.white,
//     borderRadius: BorderRadius.full,
//     borderWidth: 1,
//     borderColor: Colors.primary + '30',
//     paddingHorizontal: Spacing.md,
//     paddingVertical: Spacing.xs,
//     marginRight: Spacing.sm,
//     marginBottom: Spacing.sm,
//     ...CommonStyles.shadowSm,
//   },
//   locationChipText: {
//     marginLeft: Spacing.xs,
//     fontSize: FontSizes.sm,
//     color: Colors.gray[800],
//     fontWeight: FontWeights.semibold,
//   },
//   locationCard: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: Colors.white,
//     borderRadius: BorderRadius.xl,
//     padding: Spacing.sm,
//     borderWidth: 1,
//     borderColor: Colors.gray[100],
//     marginBottom: Spacing.sm,
//   },
//   locationIcon: {
//     width: 40,
//     height: 40,
//     borderRadius: BorderRadius.full,
//     backgroundColor: Colors.primary + '10',
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginRight: Spacing.md,
//   },
//   locationInfo: {
//     flex: 1,
//   },
//   locationName: {
//     fontWeight: FontWeights.bold,
//     color: Colors.gray[900],
//   },
//   locationAddress: {
//     color: Colors.gray[500],
//     fontSize: FontSizes.sm,
//     marginTop: 2,
//   },
//   savedSection: {
//     marginTop: Spacing.md,
//   },
//   savedTitle: {
//     fontSize: FontSizes.sm,
//     color: Colors.gray[500],
//     marginBottom: Spacing.sm,
//   },
//   addLocationCard: {
//     marginTop: Spacing.md,
//     backgroundColor: Colors.white,
//     borderRadius: BorderRadius.xl,
//     padding: Spacing.lg,
//     borderWidth: 1,
//     borderColor: Colors.gray[200],
//     gap: Spacing.sm,
//   },
//   addLocationTitle: {
//     fontWeight: FontWeights.bold,
//     color: Colors.gray[800],
//     marginBottom: Spacing.sm,
//   },
//   addInputRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     borderWidth: 1,
//     borderColor: Colors.gray[200],
//     borderRadius: BorderRadius.md,
//     paddingHorizontal: Spacing.md,
//     paddingVertical: Spacing.xs,
//     gap: Spacing.sm,
//   },
//   addInput: {
//     flex: 1,
//     fontSize: FontSizes.base,
//     color: Colors.gray[800],
//     paddingVertical: Spacing.sm,
//   },
//   coordsRow: {
//     flexDirection: 'row',
//     gap: Spacing.sm,
//   },
//   coordInput: {
//     flex: 1,
//   },
//   addButton: {
//     backgroundColor: Colors.primary,
//     borderRadius: BorderRadius.md,
//     paddingVertical: Spacing.md,
//     alignItems: 'center',
//     marginTop: Spacing.sm,
//   },
//   addButtonText: {
//     color: Colors.white,
//     fontWeight: FontWeights.bold,
//   },
//   quickToggleRow: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     marginTop: Spacing.lg,
//     marginBottom: Spacing.lg,
//     padding: Spacing.sm,
//     borderWidth: 1,
//     borderColor: Colors.gray[200],
//     borderRadius: BorderRadius.md,
//     backgroundColor: Colors.gray[50],
//   },
//   quickToggleLabel: {
//     color: Colors.gray[700],
//     fontSize: FontSizes.sm,
//     fontWeight: FontWeights.medium,
//   },
//   quickToggleButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: Spacing.xs,
//   },
//   quickToggleAction: {
//     color: Colors.primary,
//     fontWeight: FontWeights.bold,
//     fontSize: FontSizes.sm,
//   },
//   button: {
//     backgroundColor: Colors.primary,
//     borderRadius: BorderRadius.md,
//     paddingVertical: Spacing.md,
//     paddingHorizontal: Spacing.lg,
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   buttonText: {
//     color: Colors.white,
//     fontWeight: FontWeights.bold,
//   },
//   buttonSecondary: {
//     backgroundColor: Colors.white,
//     borderWidth: 1,
//     borderColor: Colors.gray[200],
//   },
//   buttonSecondaryText: {
//     color: Colors.gray[700],
//     fontWeight: FontWeights.medium,
//   },
//   buttonDisabled: {
//     opacity: 0.6,
//   },
//   quickActions: {
//     flexDirection: 'row',
//   },
//   quickActionCard: {
//     flex: 1,
//     backgroundColor: 'rgba(255, 107, 53, 0.1)',
//     padding: Spacing.lg,
//     borderRadius: BorderRadius.xl,
//     borderWidth: 1,
//     borderColor: 'rgba(255, 107, 53, 0.2)',
//   },
//   quickActionCardBlue: {
//     backgroundColor: 'rgba(52, 152, 219, 0.1)',
//     borderColor: 'rgba(52, 152, 219, 0.2)',
//   },
//   quickActionIcon: {
//     width: 48,
//     height: 48,
//     borderRadius: BorderRadius.full,
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginBottom: Spacing.sm,
//   },
//   quickActionTitle: {
//     fontWeight: FontWeights.bold,
//     color: Colors.gray[800],
//     fontSize: FontSizes.base,
//     marginBottom: Spacing.xs,
//   },
//   quickActionTitleb: {
//     fontWeight: FontWeights.bold,
//     color: Colors.white,
//     fontSize: FontSizes.base,
//     marginBottom: Spacing.xs,
//   },
//   quickActionSubtitle: {
//     fontSize: FontSizes.xs,
//     color: Colors.gray[600],
//     marginTop: Spacing.xs,
//   },
//   quickActionSubtitleb: {
//     fontSize: FontSizes.xs,
//     color: Colors.white,
//     marginTop: Spacing.xs,
//   },
//   tripCard: {
//     backgroundColor: Colors.white,
//     borderRadius: BorderRadius.xl,
//     padding: Spacing.lg,
//     marginBottom: Spacing.md,
//     ...CommonStyles.shadowSm,
//   },
//   advancedCard: {
//     backgroundColor: Colors.white,
//     borderRadius: BorderRadius.xl,
//     borderWidth: 1,
//     borderColor: Colors.gray[100],
//     padding: Spacing.lg,
//     marginBottom: Spacing.lg,
//     ...CommonStyles.shadowSm,
//   },
//   advancedTitle: {
//     fontWeight: FontWeights.bold,
//     color: Colors.gray[900],
//     marginBottom: Spacing.md,
//   },
//   advancedLocations: {
//     gap: Spacing.sm,
//     marginBottom: Spacing.md,
//   },
//   advancedLocationButton: {
//     flexDirection: 'row',
//     alignItems: 'flex-start',
//     borderWidth: 1,
//     borderColor: Colors.gray[200],
//     borderRadius: BorderRadius.lg,
//     padding: Spacing.md,
//     gap: Spacing.md,
//   },
//   advancedLocationIcon: {
//     width: 40,
//     height: 40,
//     borderRadius: BorderRadius.full,
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   advancedLocationContent: {
//     flex: 1,
//   },
//   advancedLocationLabel: {
//     fontSize: FontSizes.xs,
//     color: Colors.gray[500],
//     textTransform: 'uppercase',
//   },
//   advancedLocationTitle: {
//     fontSize: FontSizes.base,
//     fontWeight: FontWeights.bold,
//     color: Colors.gray[900],
//   },
//   advancedLocationSubtitle: {
//     fontSize: FontSizes.sm,
//     color: Colors.gray[600],
//   },
//   advancedLocationCoords: {
//     fontSize: FontSizes.xs,
//     color: Colors.gray[500],
//   },
//   advancedInputRow: {
//     flexDirection: 'row',
//     gap: Spacing.md,
//     marginBottom: Spacing.md,
//   },
//   advancedInputGroup: {
//     flex: 1,
//   },
//   advancedInputLabel: {
//     fontSize: FontSizes.xs,
//     color: Colors.gray[600],
//     marginBottom: Spacing.xs,
//     textTransform: 'uppercase',
//   },
//   advancedInput: {
//     borderWidth: 1,
//     borderColor: Colors.gray[200],
//     borderRadius: BorderRadius.md,
//     paddingVertical: Spacing.sm,
//     paddingHorizontal: Spacing.md,
//     fontSize: FontSizes.base,
//     color: Colors.gray[900],
//     backgroundColor: Colors.white,
//   },
//   advancedButtons: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   tripStateCard: {
//     backgroundColor: Colors.white,
//     borderRadius: BorderRadius.xl,
//     padding: Spacing.xl,
//     alignItems: 'center',
//     justifyContent: 'center',
//     borderWidth: 1,
//     borderColor: Colors.gray[100],
//     marginBottom: Spacing.md,
//     gap: Spacing.sm,
//   },
//   tripStateText: {
//     fontWeight: FontWeights.bold,
//     color: Colors.gray[800],
//   },
//   tripStateSubText: {
//     color: Colors.gray[600],
//     fontSize: FontSizes.sm,
//     textAlign: 'center',
//   },
//   retryButton: {
//     marginTop: Spacing.xs,
//     paddingHorizontal: Spacing.lg,
//     paddingVertical: Spacing.sm,
//     borderRadius: BorderRadius.md,
//     backgroundColor: Colors.primary,
//   },
//   retryButtonText: {
//     color: Colors.white,
//     fontWeight: FontWeights.bold,
//   },
//   tripHeader: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'flex-start',
//     marginBottom: Spacing.md,
//   },
//   tripDriverInfo: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     flex: 1,
//   },
//   avatar: {
//     width: 48,
//     height: 48,
//     backgroundColor: Colors.gray[300],
//     borderRadius: BorderRadius.full,
//     marginRight: Spacing.md,
//   },
//   tripDriverDetails: {
//     flex: 1,
//   },
//   driverName: {
//     fontWeight: FontWeights.bold,
//     color: Colors.gray[800],
//     fontSize: FontSizes.base,
//     marginBottom: Spacing.xs,
//   },
//   driverMeta: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   driverRating: {
//     fontSize: FontSizes.sm,
//     color: Colors.gray[600],
//     marginLeft: Spacing.xs,
//   },
//   dot: {
//     width: 4,
//     height: 4,
//     backgroundColor: Colors.gray[400],
//     borderRadius: BorderRadius.full,
//     marginHorizontal: Spacing.sm,
//   },
//   vehicleInfo: {
//     fontSize: FontSizes.sm,
//     color: Colors.gray[600],
//   },
//   headerBadges: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: Spacing.xs,
//   },
//   bookedBadge: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: Colors.primary + '15',
//     borderRadius: BorderRadius.md,
//     paddingHorizontal: Spacing.sm,
//     paddingVertical: Spacing.xs,
//     gap: 4,
//   },
//   bookedBadgeText: {
//     color: Colors.primary,
//     fontWeight: FontWeights.bold,
//     fontSize: FontSizes.xs,
//   },
//   ongoingBadge: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: Colors.success + '15',
//     borderRadius: BorderRadius.md,
//     paddingHorizontal: Spacing.sm,
//     paddingVertical: Spacing.xs,
//     gap: 4,
//   },
//   ongoingBadgeText: {
//     color: Colors.success,
//     fontWeight: FontWeights.bold,
//     fontSize: FontSizes.xs,
//   },
//   priceBadge: {
//     backgroundColor: 'rgba(46, 204, 113, 0.1)',
//     paddingHorizontal: Spacing.md,
//     paddingVertical: Spacing.xs,
//     borderRadius: BorderRadius.full,
//   },
//   priceText: {
//     color: Colors.success,
//     fontWeight: FontWeights.bold,
//     fontSize: FontSizes.sm,
//   },
//   freeBadge: {
//     backgroundColor: Colors.success + '15',
//     borderRadius: BorderRadius.md,
//     paddingHorizontal: Spacing.sm,
//     paddingVertical: Spacing.xs,
//   },
//   freeBadgeText: {
//     color: Colors.success,
//     fontWeight: FontWeights.bold,
//     fontSize: FontSizes.base,
//   },
//   tripRoute: {
//     marginBottom: Spacing.md,
//   },
//   routeRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: Spacing.sm,
//   },
//   routeText: {
//     color: Colors.gray[700],
//     marginLeft: Spacing.sm,
//     flex: 1,
//     fontSize: FontSizes.base,
//   },
//   timeContainer: {
//     alignItems: 'flex-end',
//   },
//   routeDateLabel: {
//     fontSize: FontSizes.xs,
//     color: Colors.primary,
//     fontWeight: FontWeights.medium,
//     marginBottom: 2,
//   },
//   routeTime: {
//     fontSize: FontSizes.sm,
//     color: Colors.gray[500],
//   },
//   tripFooter: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//     paddingTop: Spacing.md,
//     borderTopWidth: 1,
//     borderTopColor: Colors.gray[100],
//   },
//   tripFooterLeft: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   seatsText: {
//     fontSize: FontSizes.sm,
//     color: Colors.gray[600],
//     marginLeft: Spacing.xs,
//   },
//   reserveButton: {
//     backgroundColor: Colors.primary,
//     paddingHorizontal: Spacing.lg,
//     paddingVertical: Spacing.sm,
//     borderRadius: BorderRadius.md,
//   },
//   viewButton: {
//     backgroundColor: Colors.secondary,
//   },
//   reserveButtonText: {
//     color: Colors.white,
//     fontWeight: FontWeights.semibold,
//     fontSize: FontSizes.sm,
//   },
// });
