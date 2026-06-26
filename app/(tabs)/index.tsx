import { getTabBarMetrics } from '@/constants/navigation';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetNotificationsQuery } from '@/store/api/notificationApi';
import {
  type TripSearchByPointsPayload,
  useGetTripsByCoordinatesQuery,
  useGetTripsQuery,
} from '@/store/api/tripApi';
import { useGetMyTripRequestsQuery } from '@/store/api/tripRequestApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectAvailableTrips, selectLocationRadius } from '@/store/selectors';
import { setTrips } from '@/store/slices/tripsSlice';
import type { Trip } from '@/types';
import { formatDateWithRelativeLabel, formatTime } from '@/utils/dateHelpers';
import { getTripRequestCreateHref, getTripRequestDetailHref } from '@/utils/requestNavigation';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const RECENT_TRIPS_LIMIT = 10;
const HOME_MIN_AVAILABLE_SEATS = 1;

const KINSHASA_REGION: Region = {
  latitude: -4.325,
  longitude: 15.3222,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

const HOME_COLORS = {
  ink: '#07112A',
  text: '#111318',
  body: '#4B2D28',
  rust: '#B92A00',
  rustDark: '#982300',
  navy: '#304B77',
  navySoft: '#DCE7FF',
  surface: '#F7F8FA',
  line: '#E8D6CF',
  softLine: '#E8EBEF',
  success: '#0EAD65',
};

const vehicleLabel: Record<Trip['vehicleType'], string> = {
  car: 'Voiture',
  moto: 'Moto',
  tricycle: 'Keke',
};

const vehicleIcon: Record<Trip['vehicleType'], keyof typeof Ionicons.glyphMap> = {
  car: 'car-sport-outline',
  moto: 'bicycle-outline',
  tricycle: 'bus-outline',
};

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type TripPreviewCardProps = {
  cardWidth: number;
  isBooked: boolean;
  isSelected: boolean;
  onOpen: () => void;
  onSelect: () => void;
  trip: Trip;
};

function formatPrice(price?: number | null) {
  const safePrice = Number(price ?? 0);

  if (!Number.isFinite(safePrice) || safePrice <= 0) {
    return 'Gratuit';
  }

  return `${String(Math.round(safePrice)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} FC`;
}

function getInitials(name?: string | null) {
  if (!name) {
    return 'ZW';
  }

  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function placeName(place?: Trip['departure']) {
  return place?.name || place?.address || 'Adresse à préciser';
}

function getLocationCoordinate(location?: Trip['departure']): MapCoordinate | null {
  const latitude = Number(location?.lat);
  const longitude = Number(location?.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude === 0 && longitude === 0) {
    return null;
  }

  return { latitude, longitude };
}

function getGeoPointCoordinate(point?: Trip['currentLocation']): MapCoordinate | null {
  if (!point?.coordinates) {
    return null;
  }

  const [longitude, latitude] = point.coordinates;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude === 0 && longitude === 0) {
    return null;
  }

  return { latitude, longitude };
}

function getTripMapCoordinate(trip: Trip): MapCoordinate | null {
  if (trip.status === 'ongoing') {
    return getGeoPointCoordinate(trip.currentLocation) ?? getLocationCoordinate(trip.departure);
  }

  return getLocationCoordinate(trip.departure);
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(5));
}

function TripPreviewCard({
  cardWidth,
  isBooked,
  isSelected,
  onOpen,
  onSelect,
  trip,
}: TripPreviewCardProps) {
  const calculatedArrivalTime = useTripArrivalTime(trip);
  const parsedRating = Number(trip.driverRating);
  const hasDriverRating = Number.isFinite(parsedRating) && parsedRating > 0;
  const arrivalTime = calculatedArrivalTime
    ? formatTime(calculatedArrivalTime.toISOString())
    : formatTime(trip.arrivalTime);
  const tripVehicleType = trip.vehicleType || 'car';
  const driverName = trip.driverName || 'Conducteur Zwanga';
  const seatsLabel = `${trip.availableSeats} place${trip.availableSeats > 1 ? 's' : ''}`;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onSelect}
      style={[styles.tripPreviewCard, isSelected && styles.tripPreviewCardSelected, { width: cardWidth }]}
    >
      <View style={styles.tripPreviewTopRow}>
        <View style={styles.tripDriverInline}>
          {trip.driverAvatar ? (
            <Image source={{ uri: trip.driverAvatar }} style={styles.tripPreviewAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.tripPreviewAvatar, styles.tripPreviewAvatarFallback]}>
              <Text style={styles.tripPreviewAvatarText}>{getInitials(driverName)}</Text>
            </View>
          )}
          <View style={styles.tripPreviewDriverCopy}>
            <Text style={styles.tripPreviewDriverName} numberOfLines={1}>
              {driverName}
            </Text>
            <View style={styles.tripPreviewMetaRow}>
              <Ionicons
                name={hasDriverRating ? 'star' : 'star-outline'}
                size={12}
                color={hasDriverRating ? Colors.secondary : Colors.gray[400]}
              />
              <Text style={styles.tripPreviewRating}>{hasDriverRating ? parsedRating.toFixed(1) : 'Nouveau'}</Text>
            </View>
          </View>
        </View>
        <View style={styles.tripPreviewPriceBlock}>
          <Text style={styles.tripPreviewPrice}>{formatPrice(trip.price)}</Text>
          {trip.price > 0 && <Text style={styles.tripPreviewPriceNote}>par place</Text>}
        </View>
      </View>

      <View style={styles.tripPreviewRoute}>
        <View style={styles.tripPreviewRail}>
          <View style={[styles.tripPreviewRouteDot, styles.tripPreviewStartDot]} />
          <View style={styles.tripPreviewRouteLine} />
          <View style={[styles.tripPreviewRouteDot, styles.tripPreviewEndDot]} />
        </View>
        <View style={styles.tripPreviewRouteCopy}>
          <View>
            <Text style={styles.tripPreviewRouteLabel}>DÉPART - {formatTime(trip.departureTime)}</Text>
            <Text style={styles.tripPreviewRouteText} numberOfLines={1}>
              {placeName(trip.departure)}
            </Text>
          </View>
          <View>
            <Text style={styles.tripPreviewRouteLabel}>ARRIVÉE - {arrivalTime}</Text>
            <Text style={styles.tripPreviewRouteText} numberOfLines={1}>
              {placeName(trip.arrival)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.tripPreviewFooter}>
        <View style={styles.tripPreviewChips}>
          <View style={styles.tripPreviewChip}>
            <Text style={styles.tripPreviewChipText}>{seatsLabel}</Text>
          </View>
          <View style={styles.tripPreviewVehicleChip}>
            <Ionicons name={vehicleIcon[tripVehicleType]} size={13} color={HOME_COLORS.navy} />
            <Text style={styles.tripPreviewVehicleText}>{vehicleLabel[tripVehicleType]}</Text>
          </View>
          {isBooked && (
            <View style={styles.tripPreviewBookedChip}>
              <Text style={styles.tripPreviewBookedText}>Réservé</Text>
            </View>
          )}
        </View>
        <TouchableOpacity activeOpacity={0.85} style={styles.tripPreviewOpenButton} onPress={onOpen}>
          <Ionicons name="chevron-forward" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const storedTrips = useAppSelector(selectAvailableTrips);
  const locationRadiusKm = useAppSelector(selectLocationRadius);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [tripsSheetExpanded, setTripsSheetExpanded] = useState(false);
  const { lastKnownLocation } = useUserLocation({ autoRequest: true });
  const { data: currentUser } = useGetCurrentUserQuery();

  const nearbyTripsPayload = useMemo<TripSearchByPointsPayload | null>(() => {
    const latitude = lastKnownLocation?.coords?.latitude;
    const longitude = lastKnownLocation?.coords?.longitude;

    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null;
    }

    return {
      departureCoordinates: [
        roundCoordinate(longitude),
        roundCoordinate(latitude),
      ],
      departureRadiusKm: locationRadiusKm,
      minSeats: HOME_MIN_AVAILABLE_SEATS,
    };
  }, [
    lastKnownLocation?.coords?.latitude,
    lastKnownLocation?.coords?.longitude,
    locationRadiusKm,
  ]);

  const {
    data: generalTrips,
    isLoading: generalTripsLoading,
    isError: generalTripsError,
    refetch: refetchGeneralTrips,
  } = useGetTripsQuery(
    { minSeats: HOME_MIN_AVAILABLE_SEATS },
    {
      skip: Boolean(nearbyTripsPayload),
      pollingInterval: 60000,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );

  const {
    data: nearbyTrips,
    isLoading: nearbyTripsLoading,
    isError: nearbyTripsError,
    refetch: refetchNearbyTrips,
  } = useGetTripsByCoordinatesQuery(
    nearbyTripsPayload ?? {
      departureCoordinates: [0, 0] as [number, number],
      minSeats: HOME_MIN_AVAILABLE_SEATS,
    },
    {
      skip: !nearbyTripsPayload,
      pollingInterval: 60000,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );

  const remoteTrips = nearbyTripsPayload ? nearbyTrips : generalTrips;
  const tripsLoading = nearbyTripsPayload ? nearbyTripsLoading : generalTripsLoading;
  const tripsError = nearbyTripsPayload ? nearbyTripsError : generalTripsError;
  const refetchTrips = nearbyTripsPayload ? refetchNearbyTrips : refetchGeneralTrips;

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
      dispatch(setTrips(remoteTrips.slice(0, 50)));
    }
  }, [remoteTrips, dispatch]);

  const bookedTripIds = useMemo(() => {
    if (!myBookings || !currentUser?.id) {
      return new Set<string>();
    }

    return new Set(
      myBookings
        .filter((booking) => (booking.status === 'pending' || booking.status === 'accepted') && booking.tripId)
        .map((booking) => booking.tripId),
    );
  }, [myBookings, currentUser?.id]);

  const completedBookingTripIds = useMemo(() => {
    if (!myBookings || !currentUser?.id) {
      return new Set<string>();
    }

    return new Set(
      myBookings
        .filter(
          (booking) =>
            booking.status === 'completed' &&
            booking.droppedOffConfirmedByPassenger === true &&
            booking.tripId,
        )
        .map((booking) => booking.tripId),
    );
  }, [myBookings, currentUser?.id]);

  const activeTripRequest = useMemo(() => {
    const statusPriority = {
      driver_selected: 0,
      offers_received: 1,
      pending: 2,
    } as const;

    const getDepartureTime = (departureDate?: string | null) => {
      if (!departureDate) {
        return null;
      }

      const timestamp = new Date(departureDate).getTime();
      return Number.isFinite(timestamp) ? timestamp : null;
    };

    return (
      [...myTripRequests]
        .filter(
          (request) =>
            (request.status === 'pending' ||
              request.status === 'offers_received' ||
              request.status === 'driver_selected') &&
            !request.tripId,
        )
        .sort((a, b) => {
          const departureA = getDepartureTime(a.departureDateMin);
          const departureB = getDepartureTime(b.departureDateMin);

          if (departureA !== null && departureB === null) return -1;
          if (departureA === null && departureB !== null) return 1;
          if (departureA !== null && departureB !== null && departureA !== departureB) {
            return departureA - departureB;
          }

          const priorityA = statusPriority[a.status as keyof typeof statusPriority] ?? 99;
          const priorityB = statusPriority[b.status as keyof typeof statusPriority] ?? 99;

          if (priorityA !== priorityB) {
            return priorityA - priorityB;
          }

          const updatedA = new Date(a.updatedAt || a.createdAt).getTime();
          const updatedB = new Date(b.updatedAt || b.createdAt).getTime();
          return updatedB - updatedA;
        })[0] ?? null
    );
  }, [myTripRequests]);

  const activeTripRequestPendingOffers = useMemo(
    () => activeTripRequest?.offers?.filter((offer) => offer.status === 'pending').length ?? 0,
    [activeTripRequest],
  );

  const activeRequestStatus = useMemo(() => {
    if (!activeTripRequest) {
      return null;
    }

    if (activeTripRequest.status === 'driver_selected') {
      return { label: 'Conducteur confirmé', icon: 'checkmark-circle-outline' as const };
    }

    if (activeTripRequest.status === 'offers_received' || activeTripRequestPendingOffers > 0) {
      return {
        label: `${activeTripRequestPendingOffers || 1} offre${(activeTripRequestPendingOffers || 1) > 1 ? 's' : ''}`,
        icon: 'sparkles-outline' as const,
      };
    }

    return { label: 'Recherche en cours', icon: 'radio-outline' as const };
  }, [activeTripRequest, activeTripRequestPendingOffers]);

  const latestTrips = useMemo(() => {
    const baseTrips = remoteTrips ?? storedTrips ?? [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartTs = todayStart.getTime();
    const tomorrowStartTs = todayStartTs + 24 * 60 * 60 * 1000;

    return [...baseTrips]
      .filter((trip) => {
        if (!currentUser?.id) {
          return true;
        }

        if (trip.driverId === currentUser.id) {
          return false;
        }

        return !completedBookingTripIds.has(trip.id);
      })
      .sort((a, b) => {
        const departureA = new Date(a.departureTime).getTime();
        const departureB = new Date(b.departureTime).getTime();
        const safeDepartureA = Number.isFinite(departureA) ? departureA : Number.MAX_SAFE_INTEGER;
        const safeDepartureB = Number.isFinite(departureB) ? departureB : Number.MAX_SAFE_INTEGER;
        const aIsToday = safeDepartureA >= todayStartTs && safeDepartureA < tomorrowStartTs;
        const bIsToday = safeDepartureB >= todayStartTs && safeDepartureB < tomorrowStartTs;

        if (aIsToday !== bIsToday) {
          return aIsToday ? -1 : 1;
        }

        if (safeDepartureA !== safeDepartureB) {
          return safeDepartureA - safeDepartureB;
        }

        return a.id.localeCompare(b.id);
      })
      .slice(0, RECENT_TRIPS_LIMIT);
  }, [remoteTrips, storedTrips, currentUser?.id, completedBookingTripIds]);

  const tripsWithMapCoordinates = useMemo(
    () => latestTrips.filter((trip) => Boolean(getTripMapCoordinate(trip))),
    [latestTrips],
  );

  useEffect(() => {
    if (latestTrips.length === 0) {
      setSelectedTripId(null);
      return;
    }

    if (selectedTripId && latestTrips.some((trip) => trip.id === selectedTripId)) {
      return;
    }

    setSelectedTripId(tripsWithMapCoordinates[0]?.id ?? latestTrips[0].id);
  }, [latestTrips, selectedTripId, tripsWithMapCoordinates]);

  const selectedTrip = useMemo(
    () => latestTrips.find((trip) => trip.id === selectedTripId) ?? latestTrips[0] ?? null,
    [latestTrips, selectedTripId],
  );

  const mapRegion = useMemo<Region>(() => {
    const selectedDeparture = selectedTrip ? getLocationCoordinate(selectedTrip.departure) : null;
    const selectedMapCoordinate = selectedTrip ? getTripMapCoordinate(selectedTrip) : null;
    const fallbackDeparture = tripsWithMapCoordinates[0]
      ? getTripMapCoordinate(tripsWithMapCoordinates[0])
      : null;
    const coordinate = selectedMapCoordinate ?? selectedDeparture ?? fallbackDeparture;

    if (!coordinate) {
      return KINSHASA_REGION;
    }

    return {
      ...coordinate,
      latitudeDelta: 0.065,
      longitudeDelta: 0.065,
    };
  }, [selectedTrip, tripsWithMapCoordinates]);

  useEffect(() => {
    mapRef.current?.animateToRegion(mapRegion, 420);
  }, [mapRegion]);

  const firstName = currentUser?.firstName || currentUser?.name?.split(' ')[0] || 'Kinshasa';
  const avatarUri = currentUser?.profilePicture || currentUser?.avatar;
  const unreadNotifications = notificationsData?.unreadCount ?? 0;
  const isCompactScreen = width <= 360;
  const tabBarMetrics = getTabBarMetrics(insets.bottom);
  const sheetBottomOffset = Platform.OS === 'ios' ? Math.max(tabBarMetrics.height - 2, 0) : 0;
  const collapsedSheetHeight = Math.min(Math.max(height * 0.34, isCompactScreen ? 296 : 318), 348);
  const sheetHeight = tripsSheetExpanded ? Math.min(height * 0.68, 540) : collapsedSheetHeight;
  const tripCardWidth = Math.min(width - 56, 342);
  const availableTripsLabel = `${latestTrips.length} trajet${latestTrips.length > 1 ? 's' : ''}`;
  const showInitialHomeLoader = tripsLoading && !remoteTrips && storedTrips.length === 0;

  if (showInitialHomeLoader) {
    return (
      <SafeAreaView style={styles.homeLoaderContainer}>
        <View style={styles.homeLoaderCard}>
          <View style={styles.homeLoaderLogo}>
            <Text style={styles.homeLoaderLogoText}>Z</Text>
          </View>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.homeLoaderTitle}>Chargement des trajets</Text>
          <Text style={styles.homeLoaderText}>Préparation des offres disponibles autour de vous.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={mapRegion}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {tripsWithMapCoordinates.map((trip) => {
          const coordinate = getTripMapCoordinate(trip);
          const isSelected = trip.id === selectedTrip?.id;

          if (!coordinate) {
            return null;
          }

          return (
            <Marker
              key={trip.id}
              coordinate={coordinate}
              pinColor={Colors.primary}
              title={`${formatPrice(trip.price)} - ${trip.driverName || 'Conducteur Zwanga'}`}
              description={`${formatTime(trip.departureTime)} · ${placeName(trip.departure)} vers ${placeName(trip.arrival)} · ${trip.availableSeats} place${trip.availableSeats > 1 ? 's' : ''}`}
              onPress={() => setSelectedTripId(trip.id)}
              onCalloutPress={() => router.push(`/trip/${trip.id}`)}
              zIndex={isSelected ? 10 : 1}
            />
          );
        })}
      </MapView>

      <View style={styles.mapVeil} pointerEvents="none" />

      <View style={[styles.topOverlay, { top: insets.top + Spacing.sm }]}>
        <View style={styles.headerCard}>
          <View style={styles.identityBlock}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.userAvatar} resizeMode="cover" />
            ) : (
              <View style={[styles.userAvatar, styles.userAvatarFallback]}>
                <Text style={styles.userAvatarText}>{getInitials(firstName)}</Text>
              </View>
            )}
            <View style={styles.identityText}>
              <Text style={styles.greeting} numberOfLines={1}>
                Bonjour, {firstName}
              </Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>{availableTripsLabel} disponible{latestTrips.length > 1 ? 's' : ''}</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.notificationButton}
            onPress={() => router.push('/notifications')}
          >
            <Ionicons name="notifications-outline" size={23} color={Colors.primary} />
            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity activeOpacity={0.9} style={styles.searchCard} onPress={() => router.push('/search')}>
          <View style={styles.searchIconSurface}>
            <Ionicons name="navigate-outline" size={22} color={Colors.white} />
          </View>
          <View style={styles.searchCopy}>
            <Text style={styles.searchTitle}>Où allez-vous ?</Text>
            <Text style={styles.searchSubtitle}>Départ et destination</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={HOME_COLORS.navy} />
        </TouchableOpacity>

        <View style={styles.actionDock}>
          <TouchableOpacity activeOpacity={0.88} style={styles.actionPrimary} onPress={() => router.push('/search')}>
            <Ionicons name="search" size={18} color={Colors.white} />
            <Text style={styles.actionPrimaryText}>Chercher</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.88} style={styles.actionButton} onPress={() => router.push('/publish')}>
              <Ionicons name="add" size={19} color={Colors.primary} />
            <Text style={styles.actionButtonText}>Publier</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.actionButton}
            onPress={() => router.push(getTripRequestCreateHref())}
          >
            <Ionicons name="paper-plane-outline" size={17} color={HOME_COLORS.navy} />
            <Text style={styles.actionButtonText}>Demander</Text>
          </TouchableOpacity>
        </View>

        {activeTripRequest && activeRequestStatus && (
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.activeRequestCard}
            onPress={() => router.push(getTripRequestDetailHref(activeTripRequest.id))}
          >
            <View style={styles.activeRequestIcon}>
              <Ionicons name={activeRequestStatus.icon} size={17} color={Colors.primary} />
            </View>
            <View style={styles.activeRequestText}>
              <Text style={styles.activeRequestLabel}>{activeRequestStatus.label}</Text>
              <Text style={styles.activeRequestRoute} numberOfLines={1}>
                {activeTripRequest.departure.name} vers {activeTripRequest.arrival.name}
              </Text>
            </View>
            <Text style={styles.activeRequestTime}>
              {formatDateWithRelativeLabel(activeTripRequest.departureDateMin, true)}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.tripsSheet, { bottom: sheetBottomOffset, height: sheetHeight }]}>
        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.sheetHeader}
          onPress={() => setTripsSheetExpanded((current) => !current)}
        >
          <View>
            <Text style={styles.sheetTitle}>Trajets autour de vous</Text>
            <Text style={styles.sheetSubtitle}>
              {latestTrips.length > 0 ? `${availableTripsLabel} à parcourir` : 'Aucune offre pour le moment'}
            </Text>
          </View>
          <View style={styles.sheetHeaderActions}>
            <TouchableOpacity activeOpacity={0.75} onPress={() => router.push('/search')}>
              <Text style={styles.seeAllText}>Voir tout</Text>
            </TouchableOpacity>
            <View style={styles.sheetToggle}>
              <Ionicons
                name={tripsSheetExpanded ? 'chevron-down' : 'chevron-up'}
                size={18}
                color={HOME_COLORS.ink}
              />
            </View>
          </View>
        </TouchableOpacity>

        {tripsLoading && (
          <View style={styles.sheetState}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.sheetStateText}>Chargement des trajets...</Text>
          </View>
        )}

        {tripsError && !tripsLoading && (
          <View style={styles.sheetState}>
            <Ionicons name="alert-circle-outline" size={24} color={Colors.danger} />
            <Text style={styles.sheetStateText}>Impossible de charger les trajets.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={refetchTrips}>
              <Text style={styles.retryButtonText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {!tripsLoading && !tripsError && latestTrips.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="car-outline" size={24} color={HOME_COLORS.navy} />
            </View>
            <View style={styles.emptyTextBlock}>
              <Text style={styles.emptyTitle}>Aucun trajet disponible</Text>
              <Text style={styles.emptyText}>Publiez le vôtre ou revenez plus tard.</Text>
            </View>
          </View>
        )}

        {!tripsLoading && !tripsError && latestTrips.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tripsHorizontalContent}
          >
            {latestTrips.map((trip) => (
              <TripPreviewCard
                key={trip.id}
                cardWidth={tripCardWidth}
                trip={trip}
                isBooked={bookedTripIds.has(trip.id)}
                isSelected={trip.id === selectedTrip?.id}
                onSelect={() => setSelectedTripId(trip.id)}
                onOpen={() => router.push(`/trip/${trip.id}`)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  homeLoaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HOME_COLORS.surface,
    paddingHorizontal: Spacing.xl,
  },
  homeLoaderCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: BorderRadius.xxl,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
    ...CommonStyles.shadowMd,
  },
  homeLoaderLogo: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '14',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  homeLoaderLogoText: {
    color: Colors.primary,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
  },
  homeLoaderTitle: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  homeLoaderText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: HOME_COLORS.surface,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248,249,250,0.12)',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  headerCard: {
    minHeight: 64,
    borderRadius: BorderRadius.xl,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(232,214,207,0.8)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...CommonStyles.shadowSm,
  },
  identityBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: Colors.primary,
    marginRight: Spacing.md,
    backgroundColor: Colors.white,
  },
  userAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '14',
  },
  userAvatarText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    color: Colors.primary,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    lineHeight: 22,
  },
  statusRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: HOME_COLORS.success,
    marginRight: 6,
  },
  statusText: {
    color: HOME_COLORS.body,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  notificationButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginLeft: Spacing.sm,
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.danger,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  notificationBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: FontWeights.bold,
    lineHeight: 12,
  },
  searchCard: {
    minHeight: 66,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    ...CommonStyles.shadowMd,
  },
  searchIconSurface: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  searchCopy: {
    flex: 1,
    minWidth: 0,
  },
  searchTitle: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  searchSubtitle: {
    marginTop: 2,
    color: HOME_COLORS.body,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  actionDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  actionPrimaryText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  actionButton: {
    width: 94,
    minHeight: 48,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    ...CommonStyles.shadowSm,
  },
  actionButtonText: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  activeRequestCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    ...CommonStyles.shadowSm,
  },
  activeRequestIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '14',
    marginRight: Spacing.sm,
  },
  activeRequestText: {
    flex: 1,
    minWidth: 0,
  },
  activeRequestLabel: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  activeRequestRoute: {
    marginTop: 2,
    color: HOME_COLORS.ink,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  activeRequestTime: {
    marginLeft: Spacing.sm,
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    maxWidth: 88,
    textAlign: 'right',
  },
  tripsSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: Colors.white,
    paddingTop: Spacing.sm,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  sheetHeader: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: HOME_COLORS.text,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  sheetSubtitle: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  sheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  seeAllText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  sheetToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  tripsHorizontalContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  tripPreviewCard: {
    height: 208,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    padding: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  tripPreviewCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#FFFDFC',
  },
  tripPreviewTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  tripDriverInline: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripPreviewAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: Spacing.sm,
    backgroundColor: Colors.gray[100],
  },
  tripPreviewAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF0FF',
  },
  tripPreviewAvatarText: {
    color: HOME_COLORS.navy,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  tripPreviewDriverCopy: {
    flex: 1,
    minWidth: 0,
  },
  tripPreviewDriverName: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  tripPreviewMetaRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripPreviewRating: {
    marginLeft: 4,
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  tripPreviewPriceBlock: {
    alignItems: 'flex-end',
  },
  tripPreviewPrice: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  tripPreviewPriceNote: {
    marginTop: 1,
    color: HOME_COLORS.body,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
  },
  tripPreviewRoute: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
  tripPreviewRail: {
    width: 18,
    alignItems: 'center',
    paddingVertical: 3,
    marginRight: Spacing.md,
  },
  tripPreviewRouteDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 4,
    backgroundColor: Colors.white,
  },
  tripPreviewStartDot: {
    borderColor: HOME_COLORS.success,
  },
  tripPreviewEndDot: {
    borderColor: Colors.primary,
  },
  tripPreviewRouteLine: {
    flex: 1,
    minHeight: 22,
    borderLeftWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: HOME_COLORS.body,
    marginVertical: 3,
  },
  tripPreviewRouteCopy: {
    flex: 1,
    gap: Spacing.sm,
  },
  tripPreviewRouteLabel: {
    color: HOME_COLORS.body,
    fontSize: 10,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.8,
  },
  tripPreviewRouteText: {
    marginTop: 2,
    color: HOME_COLORS.text,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  tripPreviewFooter: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  tripPreviewChips: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tripPreviewChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
  },
  tripPreviewChipText: {
    color: HOME_COLORS.navy,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  tripPreviewVehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: HOME_COLORS.navySoft,
  },
  tripPreviewVehicleText: {
    color: HOME_COLORS.navy,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  tripPreviewBookedChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: '#DDF8EA',
  },
  tripPreviewBookedText: {
    color: HOME_COLORS.success,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  tripPreviewOpenButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  sheetState: {
    marginHorizontal: Spacing.xl,
    minHeight: 132,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  sheetStateText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '14',
  },
  retryButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  emptyCard: {
    marginHorizontal: Spacing.xl,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: HOME_COLORS.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  emptyTextBlock: {
    flex: 1,
  },
  emptyTitle: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  emptyText: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
});
