import { getTabBarMetrics } from '@/constants/navigation';
import { useDialog } from '@/components/ui/DialogProvider';
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
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  type ImageRequireSource,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Callout, Marker, PROVIDER_GOOGLE, type MapMarker, type Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const RECENT_TRIPS_LIMIT = 10;
const HOME_MIN_AVAILABLE_SEATS = 1;
const USE_ANDROID_TRIP_MARKER_IMAGE = Platform.OS === 'android';
const ANDROID_TRIP_MARKER_ANCHOR = { x: 0.5, y: 0.84 };

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

const androidTripMarkerImages: Record<Trip['vehicleType'], ImageRequireSource> = {
  car: require('@/assets/images/map-markers/trip-marker-car.png'),
  moto: require('@/assets/images/map-markers/trip-marker-moto.png'),
  tricycle: require('@/assets/images/map-markers/trip-marker-tricycle.png'),
};

const androidSelectedTripMarkerImage: ImageRequireSource = require('@/assets/images/map-markers/trip-marker-selected.png');

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

type TripMapMarkerProps = {
  isSelected: boolean;
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

function getAndroidTripMarkerImage(trip: Trip, isSelected: boolean) {
  if (isSelected) {
    return androidSelectedTripMarkerImage;
  }

  return androidTripMarkerImages[trip.vehicleType || 'car'];
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

function TripMapMarker({ isSelected, trip }: TripMapMarkerProps) {
  const tripVehicleType = trip.vehicleType || 'car';
  const markerIcon = isSelected ? 'car' : vehicleIcon[tripVehicleType];

  return (
    <View collapsable={false} style={styles.tripMapMarkerFrame}>
      <View collapsable={false} style={[styles.tripMapMarkerBubble, isSelected && styles.tripMapMarkerBubbleSelected]}>
        <View style={[styles.tripMapMarkerIconDisc, isSelected && styles.tripMapMarkerIconDiscSelected]}>
          <Ionicons
            name={markerIcon}
            size={isSelected ? 18 : 17}
            color={isSelected ? Colors.white : Colors.primary}
          />
        </View>
        {isSelected ? <Text style={styles.tripMapMarkerLabel}>Trajet</Text> : null}
      </View>
      <View style={[styles.tripMapMarkerPointer, isSelected && styles.tripMapMarkerPointerSelected]} />
      <View style={styles.tripMapMarkerGround} />
    </View>
  );
}

function HomeTripsLoadingScreen() {
  const pulse = useRef(new Animated.Value(0)).current;
  const vehicleProgress = useRef(new Animated.Value(0)).current;
  const shimmerProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const vehicleAnimation = Animated.loop(
      Animated.timing(vehicleProgress, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    const shimmerAnimation = Animated.loop(
      Animated.timing(shimmerProgress, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    pulseAnimation.start();
    vehicleAnimation.start();
    shimmerAnimation.start();

    return () => {
      pulseAnimation.stop();
      vehicleAnimation.stop();
      shimmerAnimation.stop();
    };
  }, [pulse, shimmerProgress, vehicleProgress]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.28],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });
  const vehicleTranslateX = vehicleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 172],
  });
  const shimmerTranslateX = shimmerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 260],
  });

  return (
    <SafeAreaView style={styles.homeLoaderContainer}>
      <View style={styles.homeLoaderShell}>
        <View style={styles.homeLoaderMapPane}>
          <View style={[styles.homeLoaderRoad, styles.homeLoaderRoadVertical]} />
          <View style={[styles.homeLoaderRoad, styles.homeLoaderRoadDiagonal]} />
          <View style={[styles.homeLoaderRoad, styles.homeLoaderRoadSoft]} />

          <View style={styles.homeLoaderPulseAnchor}>
            <Animated.View
              style={[
                styles.homeLoaderPulseRing,
                {
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <View style={styles.homeLoaderGpsDot}>
              <Ionicons name="navigate" size={15} color={Colors.white} />
            </View>
          </View>

          <View style={styles.homeLoaderRouteTrack}>
            <View style={styles.homeLoaderRouteLine} />
            <View style={[styles.homeLoaderRoutePoint, styles.homeLoaderRouteStartPoint]} />
            <Animated.View style={[styles.homeLoaderVehicle, { transform: [{ translateX: vehicleTranslateX }] }]}>
              <Ionicons name="car-sport-outline" size={17} color={Colors.white} />
            </Animated.View>
            <View style={[styles.homeLoaderRoutePoint, styles.homeLoaderRouteEndPoint]} />
          </View>
        </View>

        <View style={styles.homeLoaderCopy}>
          <View style={styles.homeLoaderLogoRow}>
            <View style={styles.homeLoaderLogo}>
              <Text style={styles.homeLoaderLogoText}>Z</Text>
            </View>
            <View style={styles.homeLoaderTitleBlock}>
              <Text style={styles.homeLoaderTitle}>Recherche des trajets proches</Text>
              <Text style={styles.homeLoaderText}>Places, horaires et conducteurs autour de vous.</Text>
            </View>
          </View>

          <View style={styles.homeLoaderStatusRow}>
            <View style={styles.homeLoaderStatusPill}>
              <Ionicons name="location-outline" size={14} color={HOME_COLORS.success} />
              <Text style={styles.homeLoaderStatusText}>Départ détecté</Text>
            </View>
            <View style={styles.homeLoaderStatusPill}>
              <Ionicons name="car-sport-outline" size={14} color={Colors.primary} />
              <Text style={styles.homeLoaderStatusText}>Trajets actifs</Text>
            </View>
          </View>

          <View style={styles.homeLoaderTripPreview}>
            <Animated.View
              pointerEvents="none"
              style={[styles.homeLoaderShimmer, { transform: [{ translateX: shimmerTranslateX }] }]}
            />
            <View style={styles.homeLoaderTripTopRow}>
              <View style={styles.homeLoaderAvatarSkeleton} />
              <View style={styles.homeLoaderTripCopy}>
                <View style={styles.homeLoaderLineStrong} />
                <View style={styles.homeLoaderLineShort} />
              </View>
              <View style={styles.homeLoaderPriceSkeleton} />
            </View>
            <View style={styles.homeLoaderRoutePreview}>
              <View style={styles.homeLoaderRoutePreviewRail}>
                <View style={[styles.homeLoaderMiniDot, styles.homeLoaderMiniStart]} />
                <View style={styles.homeLoaderMiniLine} />
                <View style={[styles.homeLoaderMiniDot, styles.homeLoaderMiniEnd]} />
              </View>
              <View style={styles.homeLoaderTripCopy}>
                <View style={styles.homeLoaderWideLine} />
                <View style={styles.homeLoaderMediumLine} />
              </View>
            </View>
            <View style={styles.homeLoaderChipRow}>
              <View style={styles.homeLoaderChipSkeleton} />
              <View style={styles.homeLoaderChipSkeletonWide} />
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function HomeSheetLoadingState() {
  const shimmerProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmerAnimation = Animated.loop(
      Animated.timing(shimmerProgress, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    shimmerAnimation.start();

    return () => {
      shimmerAnimation.stop();
    };
  }, [shimmerProgress]);

  const shimmerTranslateX = shimmerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-90, 230],
  });

  return (
    <View style={styles.sheetLoadingState}>
      <View style={styles.sheetLoadingHeader}>
        <View style={styles.sheetLoadingIcon}>
          <Ionicons name="car-sport-outline" size={20} color={Colors.primary} />
        </View>
        <View style={styles.sheetLoadingCopy}>
          <Text style={styles.sheetLoadingTitle}>Recherche des meilleurs départs</Text>
          <Text style={styles.sheetLoadingText}>On actualise les trajets disponibles.</Text>
        </View>
      </View>
      <View style={styles.sheetLoadingPreview}>
        <Animated.View
          pointerEvents="none"
          style={[styles.sheetLoadingShimmer, { transform: [{ translateX: shimmerTranslateX }] }]}
        />
        <View style={styles.sheetLoadingPreviewTop}>
          <View style={styles.sheetLoadingAvatar} />
          <View style={styles.sheetLoadingLines}>
            <View style={styles.sheetLoadingLineStrong} />
            <View style={styles.sheetLoadingLineSoft} />
          </View>
        </View>
        <View style={styles.sheetLoadingRouteRow}>
          <View style={styles.sheetLoadingRouteDot} />
          <View style={styles.sheetLoadingRouteLine} />
          <View style={[styles.sheetLoadingRouteDot, styles.sheetLoadingRouteDotEnd]} />
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const isFocused = useIsFocused();
  const dispatch = useAppDispatch();
  const mapRef = useRef<MapView>(null);
  const tripMarkerRefs = useRef<Record<string, MapMarker | null>>({});
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const storedTrips = useAppSelector(selectAvailableTrips);
  const locationRadiusKm = useAppSelector(selectLocationRadius);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [tripsSheetOpen, setTripsSheetOpen] = useState(true);
  const [isCenteringOnUser, setIsCenteringOnUser] = useState(false);
  const [mapFocusedOnUser, setMapFocusedOnUser] = useState(false);
  const { getCurrentLocation, lastKnownLocation } = useUserLocation({
    autoRequest: isFocused,
    trackingProfile: 'nearby',
  });
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
      pollingInterval: isFocused ? 60000 : 0,
      skipPollingIfUnfocused: true,
      refetchOnFocus: isFocused,
      refetchOnReconnect: isFocused,
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
      pollingInterval: isFocused ? 60000 : 0,
      skipPollingIfUnfocused: true,
      refetchOnFocus: isFocused,
      refetchOnReconnect: isFocused,
    },
  );

  const remoteTrips = useMemo(() => {
    if (!nearbyTripsPayload) {
      return generalTrips;
    }

    if (!nearbyTrips?.length && !generalTrips) {
      return undefined;
    }

    const tripsById = new Map<string, Trip>();

    (nearbyTrips ?? []).forEach((trip) => {
      tripsById.set(trip.id, trip);
    });

    (generalTrips ?? []).forEach((trip) => {
      if (!tripsById.has(trip.id)) {
        tripsById.set(trip.id, trip);
      }
    });

    return Array.from(tripsById.values());
  }, [nearbyTripsPayload, nearbyTrips, generalTrips]);

  const tripsLoading = nearbyTripsPayload
    ? (nearbyTripsLoading || generalTripsLoading) && !remoteTrips?.length && storedTrips.length === 0
    : generalTripsLoading && !generalTrips && storedTrips.length === 0;
  const tripsError = nearbyTripsPayload
    ? nearbyTripsError && generalTripsError && !remoteTrips?.length && storedTrips.length === 0
    : generalTripsError && !generalTrips && storedTrips.length === 0;
  const refetchTrips = () => {
    if (nearbyTripsPayload) {
      void refetchNearbyTrips();
    }

    return refetchGeneralTrips();
  };

  const { data: notificationsData } = useGetNotificationsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const { data: myBookings } = useGetMyBookingsQuery();
  const { data: myTripRequests = [] } = useGetMyTripRequestsQuery(undefined, {
    skip: !currentUser?.id,
    pollingInterval: isFocused ? 30000 : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: isFocused,
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
    if (isFocused && !mapFocusedOnUser) {
      mapRef.current?.animateToRegion(mapRegion, 420);
    }
  }, [isFocused, mapFocusedOnUser, mapRegion]);

  const firstName = currentUser?.firstName || currentUser?.name?.split(' ')[0] || 'Kinshasa';
  const avatarUri = currentUser?.profilePicture || currentUser?.avatar;
  const unreadNotifications = notificationsData?.unreadCount ?? 0;
  const isCompactScreen = width <= 360;
  const tabBarMetrics = getTabBarMetrics(insets.bottom);
  const sheetBottomOffset = Platform.OS === 'ios' ? Math.max(tabBarMetrics.height - 2, 0) : 0;
  const openSheetHeight = Math.min(Math.max(height * 0.34, isCompactScreen ? 296 : 318), 348);
  const retractedSheetHeight = 78;
  const sheetHeight = tripsSheetOpen ? openSheetHeight : retractedSheetHeight;
  const locationButtonBottom = sheetBottomOffset + sheetHeight + Spacing.md;
  const tripCardWidth = Math.min(width - 56, 342);
  const availableTripsLabel = `${latestTrips.length} trajet${latestTrips.length > 1 ? 's' : ''}`;
  const showInitialHomeLoader = tripsLoading && !remoteTrips && storedTrips.length === 0;
  const openTripDetail = (tripId: string) => {
    router.push(`/trip/${tripId}`);
  };

  const selectTripOnMap = (tripId: string) => {
    setMapFocusedOnUser(false);
    setSelectedTripId(tripId);
  };

  const handleReturnToUserLocation = async () => {
    if (isCenteringOnUser) {
      return;
    }

    setIsCenteringOnUser(true);

    try {
      const knownLatitude = Number(lastKnownLocation?.coords?.latitude);
      const knownLongitude = Number(lastKnownLocation?.coords?.longitude);
      const knownCoordinate =
        Number.isFinite(knownLatitude) && Number.isFinite(knownLongitude)
          ? { latitude: knownLatitude, longitude: knownLongitude }
          : null;
      const currentLocation = knownCoordinate ? null : await getCurrentLocation();
      const coordinate = knownCoordinate ??
        (currentLocation
          ? {
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
            }
          : null);

      if (!coordinate) {
        showDialog({
          variant: 'warning',
          title: 'Localisation indisponible',
          message: 'Activez la localisation pour revenir à votre position sur la carte.',
        });
        return;
      }

      setMapFocusedOnUser(true);
      mapRef.current?.animateToRegion(
        {
          ...coordinate,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        },
        480,
      );
    } finally {
      setIsCenteringOnUser(false);
    }
  };

  const showTripMarkerCallout = (tripId: string) => {
    [90, 520].forEach((delay) => {
      setTimeout(() => {
        tripMarkerRefs.current[tripId]?.showCallout();
      }, delay);
    });
  };

  const handleTripMarkerPress = (tripId: string, isSelected: boolean) => {
    if (!USE_ANDROID_TRIP_MARKER_IMAGE) {
      selectTripOnMap(tripId);
      return;
    }

    if (isSelected) {
      openTripDetail(tripId);
      return;
    }

    selectTripOnMap(tripId);
    showTripMarkerCallout(tripId);
  };

  if (showInitialHomeLoader) {
    return <HomeTripsLoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={mapRegion}
        showsCompass={false}
        showsUserLocation={Boolean(lastKnownLocation?.coords)}
        showsMyLocationButton={false}
        moveOnMarkerPress={!USE_ANDROID_TRIP_MARKER_IMAGE}
        toolbarEnabled={false}
      >
        {tripsWithMapCoordinates.map((trip) => {
          const coordinate = getTripMapCoordinate(trip);
          const isSelected = trip.id === selectedTrip?.id;

          if (!coordinate) {
            return null;
          }

          const androidTripMarkerImage = USE_ANDROID_TRIP_MARKER_IMAGE
            ? getAndroidTripMarkerImage(trip, isSelected)
            : undefined;

          return (
            <Marker
              ref={(marker) => {
                if (marker) {
                  tripMarkerRefs.current[trip.id] = marker;
                } else {
                  delete tripMarkerRefs.current[trip.id];
                }
              }}
              key={`${trip.id}:${trip.vehicleType || 'car'}:${isSelected ? 'selected' : 'default'}`}
              identifier={trip.id}
              coordinate={coordinate}
              anchor={USE_ANDROID_TRIP_MARKER_IMAGE ? ANDROID_TRIP_MARKER_ANCHOR : { x: 0.5, y: 0.9 }}
              image={androidTripMarkerImage}
              title={`${formatPrice(trip.price)} - ${trip.driverName || 'Conducteur Zwanga'}`}
              description={`${formatTime(trip.departureTime)} · ${placeName(trip.departure)} vers ${placeName(trip.arrival)} · ${trip.availableSeats} place${trip.availableSeats > 1 ? 's' : ''}`}
              onPress={() => handleTripMarkerPress(trip.id, isSelected)}
              onCalloutPress={() => openTripDetail(trip.id)}
              tappable
              tracksViewChanges={false}
              zIndex={isSelected ? 10 : 1}
            >
              {!USE_ANDROID_TRIP_MARKER_IMAGE && <TripMapMarker trip={trip} isSelected={isSelected} />}
              <Callout tooltip onPress={() => openTripDetail(trip.id)}>
                <View style={styles.tripMapCallout}>
                  <View style={styles.tripMapCalloutTop}>
                    <Text style={styles.tripMapCalloutTitle} numberOfLines={1}>
                      {formatPrice(trip.price)}
                    </Text>
                    <Text style={styles.tripMapCalloutTime}>{formatTime(trip.departureTime)}</Text>
                  </View>
                  <Text style={styles.tripMapCalloutRoute} numberOfLines={1}>
                    {placeName(trip.departure)} vers {placeName(trip.arrival)}
                  </Text>
                  <View style={styles.tripMapCalloutFooter}>
                    <Ionicons name="people-outline" size={13} color={HOME_COLORS.navy} />
                    <Text style={styles.tripMapCalloutMeta}>
                      {trip.availableSeats} place{trip.availableSeats > 1 ? 's' : ''} libre{trip.availableSeats > 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      <View style={styles.mapVeil} pointerEvents="none" />

      <TouchableOpacity
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel="Revenir à ma position"
        style={[styles.locationButton, { bottom: locationButtonBottom }]}
        onPress={handleReturnToUserLocation}
        disabled={isCenteringOnUser}
      >
        {isCenteringOnUser ? (
          <ActivityIndicator size="small" color={HOME_COLORS.navy} />
        ) : (
          <Ionicons name="locate" size={22} color={HOME_COLORS.navy} />
        )}
      </TouchableOpacity>

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
        <View style={styles.sheetHeader}>
          <TouchableOpacity
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel={tripsSheetOpen ? 'Rétracter la liste des trajets' : 'Afficher la liste des trajets'}
            style={styles.sheetHeaderCopy}
            onPress={() => setTripsSheetOpen((current) => !current)}
          >
            <Text style={styles.sheetTitle}>Trajets autour de vous</Text>
            <Text style={styles.sheetSubtitle}>
              {latestTrips.length > 0 ? `${availableTripsLabel} à parcourir` : 'Aucune offre pour le moment'}
            </Text>
          </TouchableOpacity>
          <View style={styles.sheetHeaderActions}>
            <TouchableOpacity activeOpacity={0.75} onPress={() => router.push('/search')}>
              <Text style={styles.seeAllText}>Voir tout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={tripsSheetOpen ? 'Rétracter la liste des trajets' : 'Afficher la liste des trajets'}
              style={styles.sheetToggle}
              onPress={() => setTripsSheetOpen((current) => !current)}
            >
              <Ionicons
                name={tripsSheetOpen ? 'chevron-down' : 'chevron-up'}
                size={18}
                color={HOME_COLORS.ink}
              />
            </TouchableOpacity>
          </View>
        </View>

        {tripsSheetOpen && tripsLoading && (
          <HomeSheetLoadingState />
        )}

        {tripsSheetOpen && tripsError && !tripsLoading && (
          <View style={styles.sheetState}>
            <Ionicons name="alert-circle-outline" size={24} color={Colors.danger} />
            <Text style={styles.sheetStateText}>Impossible de charger les trajets.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={refetchTrips}>
              <Text style={styles.retryButtonText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {tripsSheetOpen && !tripsLoading && !tripsError && latestTrips.length === 0 && (
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

        {tripsSheetOpen && !tripsLoading && !tripsError && latestTrips.length > 0 && (
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
                onSelect={() => selectTripOnMap(trip.id)}
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
    textAlign: 'left',
  },
  homeLoaderText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    lineHeight: 20,
    textAlign: 'left',
  },
  homeLoaderShell: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    ...CommonStyles.shadowMd,
  },
  homeLoaderMapPane: {
    height: 190,
    overflow: 'hidden',
    backgroundColor: '#EEF4F3',
  },
  homeLoaderRoad: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#D8E4E9',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  homeLoaderRoadVertical: {
    width: 58,
    height: 240,
    left: 42,
    top: -22,
    transform: [{ rotate: '8deg' }],
  },
  homeLoaderRoadDiagonal: {
    width: 52,
    height: 260,
    right: 74,
    top: -36,
    transform: [{ rotate: '-33deg' }],
  },
  homeLoaderRoadSoft: {
    width: 42,
    height: 180,
    right: -8,
    bottom: -18,
    opacity: 0.7,
    transform: [{ rotate: '20deg' }],
  },
  homeLoaderPulseAnchor: {
    position: 'absolute',
    left: 52,
    top: 44,
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeLoaderPulseRing: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
  },
  homeLoaderGpsDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderWidth: 3,
    borderColor: Colors.white,
    ...CommonStyles.shadowSm,
  },
  homeLoaderRouteTrack: {
    position: 'absolute',
    left: 86,
    right: 70,
    bottom: 44,
    height: 54,
    justifyContent: 'center',
  },
  homeLoaderRouteLine: {
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(48,75,119,0.22)',
  },
  homeLoaderRoutePoint: {
    position: 'absolute',
    top: 18,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 4,
    backgroundColor: Colors.white,
  },
  homeLoaderRouteStartPoint: {
    left: -4,
    borderColor: HOME_COLORS.success,
  },
  homeLoaderRouteEndPoint: {
    right: -4,
    borderColor: Colors.primary,
  },
  homeLoaderVehicle: {
    position: 'absolute',
    left: 0,
    top: 7,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderWidth: 3,
    borderColor: Colors.white,
    ...CommonStyles.shadowSm,
  },
  homeLoaderCopy: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  homeLoaderLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  homeLoaderTitleBlock: {
    flex: 1,
    minWidth: 0,
    marginLeft: Spacing.md,
  },
  homeLoaderStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  homeLoaderStatusPill: {
    minHeight: 34,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
  },
  homeLoaderStatusText: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  homeLoaderTripPreview: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    backgroundColor: '#FFFDFC',
    borderWidth: 1,
    borderColor: HOME_COLORS.line,
  },
  homeLoaderShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 74,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  homeLoaderTripTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  homeLoaderAvatarSkeleton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.gray[100],
  },
  homeLoaderTripCopy: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  homeLoaderLineStrong: {
    width: '68%',
    height: 12,
    borderRadius: 999,
    backgroundColor: '#DDE5EA',
  },
  homeLoaderLineShort: {
    width: '46%',
    height: 9,
    borderRadius: 999,
    backgroundColor: '#E9EEF2',
  },
  homeLoaderPriceSkeleton: {
    width: 58,
    height: 18,
    borderRadius: 999,
    backgroundColor: Colors.primary + '22',
  },
  homeLoaderRoutePreview: {
    marginTop: Spacing.md,
    flexDirection: 'row',
  },
  homeLoaderRoutePreviewRail: {
    width: 18,
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  homeLoaderMiniDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 4,
    backgroundColor: Colors.white,
  },
  homeLoaderMiniStart: {
    borderColor: HOME_COLORS.success,
  },
  homeLoaderMiniEnd: {
    borderColor: Colors.primary,
  },
  homeLoaderMiniLine: {
    height: 28,
    borderLeftWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: HOME_COLORS.body,
    marginVertical: 4,
  },
  homeLoaderWideLine: {
    width: '88%',
    height: 13,
    borderRadius: 999,
    backgroundColor: '#DDE5EA',
  },
  homeLoaderMediumLine: {
    width: '62%',
    height: 13,
    borderRadius: 999,
    backgroundColor: '#E9EEF2',
  },
  homeLoaderChipRow: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  homeLoaderChipSkeleton: {
    width: 92,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
  },
  homeLoaderChipSkeletonWide: {
    width: 116,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: HOME_COLORS.navySoft,
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
  locationButton: {
    position: 'absolute',
    right: Spacing.lg,
    zIndex: 8,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    ...Platform.select({
      ios: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  tripMapMarkerFrame: {
    width: 118,
    height: 70,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'visible',
  },
  tripMapMarkerBubble: {
    minWidth: 44,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 6,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.16,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  tripMapMarkerBubbleSelected: {
    minWidth: 88,
    backgroundColor: Colors.primary,
    borderColor: Colors.white,
  },
  tripMapMarkerIconDisc: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '14',
  },
  tripMapMarkerIconDiscSelected: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  tripMapMarkerLabel: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    paddingRight: 3,
  },
  tripMapMarkerPointer: {
    width: 13,
    height: 13,
    marginTop: -7,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    transform: [{ rotate: '45deg' }],
  },
  tripMapMarkerPointerSelected: {
    borderColor: Colors.white,
    backgroundColor: Colors.primary,
  },
  tripMapMarkerGround: {
    width: 18,
    height: 5,
    borderRadius: 9,
    marginTop: 2,
    backgroundColor: 'rgba(7,17,42,0.16)',
  },
  tripMapCallout: {
    width: 226,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    ...CommonStyles.shadowMd,
  },
  tripMapCalloutTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  tripMapCalloutTitle: {
    flex: 1,
    color: Colors.primary,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  tripMapCalloutTime: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  tripMapCalloutRoute: {
    marginTop: 4,
    color: HOME_COLORS.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  tripMapCalloutFooter: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tripMapCalloutMeta: {
    color: HOME_COLORS.navy,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
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
  sheetHeaderCopy: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 2,
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
  sheetLoadingState: {
    marginHorizontal: Spacing.xl,
    minHeight: 148,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    backgroundColor: '#FFFDFC',
    borderWidth: 1,
    borderColor: HOME_COLORS.line,
    gap: Spacing.md,
    overflow: 'hidden',
  },
  sheetLoadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetLoadingIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '14',
    marginRight: Spacing.sm,
  },
  sheetLoadingCopy: {
    flex: 1,
    minWidth: 0,
  },
  sheetLoadingTitle: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  sheetLoadingText: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
  },
  sheetLoadingPreview: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
  },
  sheetLoadingShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 68,
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
  sheetLoadingPreviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetLoadingAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.gray[100],
    marginRight: Spacing.sm,
  },
  sheetLoadingLines: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  sheetLoadingLineStrong: {
    width: '72%',
    height: 11,
    borderRadius: 999,
    backgroundColor: '#DDE5EA',
  },
  sheetLoadingLineSoft: {
    width: '44%',
    height: 9,
    borderRadius: 999,
    backgroundColor: '#E9EEF2',
  },
  sheetLoadingRouteRow: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetLoadingRouteDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 4,
    borderColor: HOME_COLORS.success,
    backgroundColor: Colors.white,
  },
  sheetLoadingRouteDotEnd: {
    borderColor: Colors.primary,
  },
  sheetLoadingRouteLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(75,45,40,0.24)',
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
