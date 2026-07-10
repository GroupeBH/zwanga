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
import {
  useGetAvailableTripRequestsQuery,
  useGetMyTripRequestsQuery,
} from '@/store/api/tripRequestApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectAvailableTrips, selectLocationRadius } from '@/store/selectors';
import { setTrips } from '@/store/slices/tripsSlice';
import type { Trip, TripRequest } from '@/types';
import { buildCurrentLocationSelection } from '@/utils/currentLocationSelection';
import { formatDateTime, formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { getTripRequestCreateHref, getTripRequestDetailHref } from '@/utils/requestNavigation';
import {
  getGeoPointCoordinate as getSafeGeoPointCoordinate,
  getTripLocationCoordinate,
} from '@/utils/tripCoordinates';
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
const TRIP_MARKER_ANCHOR = { x: 0.5, y: 0.5 };
const USER_LOCATION_MARKER_ANCHOR = { x: 0.5, y: 0.5 };

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

const tripRequestStatusMeta: Record<
  TripRequest['status'],
  { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pending: { label: 'Nouvelle demande', color: Colors.warning, bg: Colors.warning + '16', icon: 'radio-outline' },
  offers_received: { label: 'Offres en cours', color: Colors.info, bg: Colors.info + '16', icon: 'sparkles-outline' },
  driver_selected: { label: 'Attribuée', color: Colors.success, bg: Colors.success + '16', icon: 'checkmark-circle-outline' },
  cancelled: { label: 'Annulée', color: Colors.danger, bg: Colors.danger + '16', icon: 'close-circle-outline' },
  expired: { label: 'Expirée', color: Colors.gray[500], bg: Colors.gray[200], icon: 'time-outline' },
};

const androidTripMarkerImages: Record<Trip['vehicleType'], ImageRequireSource> = {
  car: require('@/assets/images/map-markers/trip-marker-car.png'),
  moto: require('@/assets/images/map-markers/trip-marker-moto.png'),
  tricycle: require('@/assets/images/map-markers/trip-marker-tricycle.png'),
};

const selectedTripMarkerImages: Record<Trip['vehicleType'], ImageRequireSource> = {
  car: require('@/assets/images/map-markers/trip-marker-car-selected.png'),
  moto: require('@/assets/images/map-markers/trip-marker-moto-selected.png'),
  tricycle: require('@/assets/images/map-markers/trip-marker-tricycle-selected.png'),
};

const userLocationMarkerImage: ImageRequireSource = require('@/assets/images/map-markers/user-location-marker.png');

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type TripPreviewCardProps = {
  cardWidth: number;
  isBooked: boolean;
  isSelected: boolean;
  onOpen: () => void;
  trip: Trip;
};

type TripRequestPreviewCardProps = {
  cardWidth: number;
  onOpen: () => void;
  request: TripRequest;
};

type TripMapMarkerProps = {
  isSelected: boolean;
  trip: Trip;
};

type HomeSheetMode = 'trips' | 'requests';

type UserLocationMarkerState = {
  address: string;
  coordinate: MapCoordinate;
  title: string;
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

function placeName(place?: Trip['departure'] | TripRequest['departure']) {
  return place?.name || place?.address || 'Adresse à préciser';
}

function getTripRequestStatusMeta(status: TripRequest['status']) {
  return tripRequestStatusMeta[status] ?? tripRequestStatusMeta.pending;
}

function getLocationCoordinate(location?: Trip['departure']): MapCoordinate | null {
  return getTripLocationCoordinate(location);
}

function getGeoPointCoordinate(point?: Trip['currentLocation']): MapCoordinate | null {
  return getSafeGeoPointCoordinate(point);
}

function getTripMapCoordinate(trip: Trip): MapCoordinate | null {
  if (trip.status === 'ongoing') {
    return getGeoPointCoordinate(trip.currentLocation) ?? getLocationCoordinate(trip.departure);
  }

  return getLocationCoordinate(trip.departure);
}

function hasUpcomingDeparture(trip: Pick<Trip, 'departureTime' | 'status'>) {
  if (trip.status === 'ongoing') {
    return true;
  }

  const departureTs = new Date(trip.departureTime).getTime();

  if (!Number.isFinite(departureTs)) {
    return false;
  }

  return departureTs >= Date.now();
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(5));
}

function getTripMarkerImage(trip: Trip, isSelected: boolean) {
  const tripVehicleType = trip.vehicleType || 'car';

  if (isSelected) {
    return selectedTripMarkerImages[tripVehicleType];
  }

  return androidTripMarkerImages[tripVehicleType];
}

function TripPreviewCard({
  cardWidth,
  isBooked,
  isSelected,
  onOpen,
  trip,
}: TripPreviewCardProps) {
  const calculatedArrivalTime = useTripArrivalTime(trip);
  const parsedRating = Number(trip.driverRating);
  const hasDriverRating = Number.isFinite(parsedRating) && parsedRating > 0;
  const arrivalDateTime = calculatedArrivalTime
    ? formatDateTime(calculatedArrivalTime.toISOString())
    : formatDateTime(trip.arrivalTime);
  const tripVehicleType = trip.vehicleType || 'car';
  const driverName = trip.driverName || 'Conducteur Zwanga';
  const seatsLabel = `${trip.availableSeats} place${trip.availableSeats > 1 ? 's' : ''}`;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`Voir le trajet de ${placeName(trip.departure)} à ${placeName(trip.arrival)}`}
      onPress={onOpen}
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
          <Text
            style={styles.tripPreviewPrice}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {formatPrice(trip.price)}
          </Text>
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
            <Text style={styles.tripPreviewRouteLabel}>DÉPART - {formatDateTime(trip.departureTime)}</Text>
            <Text style={styles.tripPreviewRouteText} numberOfLines={1}>
              {placeName(trip.departure)}
            </Text>
          </View>
          <View>
            <Text style={styles.tripPreviewRouteLabel}>ARRIVÉE ESTIMÉE - {arrivalDateTime}</Text>
            <Text style={styles.tripPreviewRouteText} numberOfLines={1}>
              {placeName(trip.arrival)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.tripPreviewFooter}>
        <View style={styles.tripPreviewChips}>
          <View style={styles.tripPreviewChip}>
            <Text style={styles.tripPreviewChipText} numberOfLines={1}>{seatsLabel}</Text>
          </View>
          <View style={styles.tripPreviewVehicleChip}>
            <Ionicons name={vehicleIcon[tripVehicleType]} size={13} color={HOME_COLORS.navy} />
            <Text style={styles.tripPreviewVehicleText} numberOfLines={1}>{vehicleLabel[tripVehicleType]}</Text>
          </View>
          {isBooked && (
            <View style={styles.tripPreviewBookedChip}>
              <Text style={styles.tripPreviewBookedText}>Réservé</Text>
            </View>
          )}
        </View>
        <View style={styles.tripPreviewOpenButton}>
          <Ionicons name="chevron-forward" size={22} color={Colors.white} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function TripRequestPreviewCard({
  cardWidth,
  onOpen,
  request,
}: TripRequestPreviewCardProps) {
  const passengerName = request.passengerName || 'Passager Zwanga';
  const statusMeta = getTripRequestStatusMeta(request.status);
  const pendingOffersCount = request.offers?.filter((offer) => offer.status === 'pending').length ?? 0;
  const maxPrice = Number(request.maxPricePerSeat ?? 0);
  const hasMaxPrice = Number.isFinite(maxPrice) && maxPrice > 0;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`Voir la demande de ${placeName(request.departure)} à ${placeName(request.arrival)}`}
      onPress={onOpen}
      style={[styles.requestPreviewCard, { width: cardWidth }]}
    >
      <View style={styles.requestPreviewTopRow}>
        <View style={styles.requestPassengerInline}>
          {request.passengerAvatar ? (
            <Image source={{ uri: request.passengerAvatar }} style={styles.requestPreviewAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.requestPreviewAvatar, styles.requestPreviewAvatarFallback]}>
              <Text style={styles.requestPreviewAvatarText}>{getInitials(passengerName)}</Text>
            </View>
          )}
          <View style={styles.requestPreviewPassengerCopy}>
            <Text style={styles.requestPreviewPassengerName} numberOfLines={1}>
              {passengerName}
            </Text>
            <Text style={styles.requestPreviewDate} numberOfLines={1}>
              {formatDateWithRelativeLabel(request.createdAt, false)}
            </Text>
          </View>
        </View>
        <View style={[styles.requestPreviewStatusBadge, { backgroundColor: statusMeta.bg }]}>
          <Ionicons name={statusMeta.icon} size={13} color={statusMeta.color} />
          <Text style={[styles.requestPreviewStatusText, { color: statusMeta.color }]} numberOfLines={1}>
            {statusMeta.label}
          </Text>
        </View>
      </View>

      <View style={styles.requestPreviewRoute}>
        <View style={styles.requestPreviewRail}>
          <View style={[styles.requestPreviewRouteDot, styles.requestPreviewStartDot]} />
          <View style={styles.requestPreviewRouteLine} />
          <View style={[styles.requestPreviewRouteDot, styles.requestPreviewEndDot]} />
        </View>
        <View style={styles.requestPreviewRouteCopy}>
          <View>
            <Text style={styles.requestPreviewRouteLabel}>
              DEPART - {formatDateWithRelativeLabel(request.departureDateMin, true)}
            </Text>
            <Text style={styles.requestPreviewRouteText} numberOfLines={1}>
              {placeName(request.departure)}
            </Text>
          </View>
          <View>
            <Text style={styles.requestPreviewRouteLabel}>
              DESTINATION - limite {formatDateWithRelativeLabel(request.departureDateMax, true)}
            </Text>
            <Text style={styles.requestPreviewRouteText} numberOfLines={1}>
              {placeName(request.arrival)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.requestPreviewFooter}>
        <View style={styles.requestPreviewChips}>
          <View style={styles.requestPreviewChip}>
            <Ionicons name="people-outline" size={13} color={HOME_COLORS.navy} />
            <Text style={styles.requestPreviewChipText} numberOfLines={1}>
              {request.numberOfSeats} place{request.numberOfSeats > 1 ? 's' : ''}
            </Text>
          </View>
          {hasMaxPrice && (
            <View style={styles.requestPreviewBudgetChip}>
              <Text style={styles.requestPreviewBudgetText} numberOfLines={1}>
                Max {formatPrice(maxPrice)}
              </Text>
            </View>
          )}
          {pendingOffersCount > 0 && (
            <View style={styles.requestPreviewOffersChip}>
              <Text style={styles.requestPreviewOffersText} numberOfLines={1}>
                {pendingOffersCount} offre{pendingOffersCount > 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.requestPreviewOpenButton}>
          <Ionicons name="chevron-forward" size={22} color={Colors.white} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function TripMapMarker({ isSelected, trip }: TripMapMarkerProps) {
  const markerImage = getTripMarkerImage(trip, isSelected);

  return (
    <View collapsable={false} style={[styles.tripMapMarkerFrame, isSelected && styles.tripMapMarkerFrameSelected]}>
      <Image
        source={markerImage}
        style={[styles.tripMapMarkerImage, isSelected && styles.tripMapMarkerImageSelected]}
        resizeMode="contain"
      />
    </View>
  );
}

function UserLocationMapMarker() {
  return (
    <View collapsable={false} style={styles.userLocationMarkerFrame}>
      <Image source={userLocationMarkerImage} style={styles.userLocationMarkerImage} resizeMode="contain" />
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
  const userLocationMarkerRef = useRef<MapMarker | null>(null);
  const openingTripRef = useRef(false);
  const openingTripTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const storedTrips = useAppSelector(selectAvailableTrips);
  const locationRadiusKm = useAppSelector(selectLocationRadius);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [tripsSheetOpen, setTripsSheetOpen] = useState(true);
  const [homeSheetMode, setHomeSheetMode] = useState<HomeSheetMode>('trips');
  const [isCenteringOnUser, setIsCenteringOnUser] = useState(false);
  const [mapFocusedOnUser, setMapFocusedOnUser] = useState(false);
  const [userLocationMarker, setUserLocationMarker] = useState<UserLocationMarkerState | null>(null);
  const [openingTripId, setOpeningTripId] = useState<string | null>(null);
  const { getCurrentLocation, lastKnownLocation } = useUserLocation({
    autoRequest: isFocused,
    trackingProfile: 'nearby',
  });
  const { data: currentUser } = useGetCurrentUserQuery();
  const isDriver = useMemo(() => {
    const role = currentUser?.role;
    return role === 'driver' || role === 'both' || Boolean(currentUser?.isDriver);
  }, [currentUser?.isDriver, currentUser?.role]);

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
  const {
    data: availableTripRequests = [],
    isLoading: availableTripRequestsLoading,
    isError: availableTripRequestsError,
    refetch: refetchAvailableTripRequests,
  } = useGetAvailableTripRequestsQuery(undefined, {
    skip: !isDriver,
    pollingInterval: isFocused && homeSheetMode === 'requests' ? 30000 : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: isFocused,
  });

  useEffect(() => {
    if (!isDriver && homeSheetMode === 'requests') {
      setHomeSheetMode('trips');
    }
  }, [homeSheetMode, isDriver]);

  useEffect(() => {
    if (remoteTrips) {
      dispatch(setTrips(remoteTrips.filter(hasUpcomingDeparture).slice(0, 50)));
    }
  }, [remoteTrips, dispatch]);

  const activeBookings = useMemo(() => {
    if (!myBookings || !currentUser?.id) {
      return [];
    }

    return myBookings.filter(
      (booking) =>
        (booking.status === 'pending' || booking.status === 'accepted') && booking.tripId,
    );
  }, [myBookings, currentUser?.id]);

  const bookedTripIds = useMemo(
    () => new Set(activeBookings.map((booking) => booking.tripId)),
    [activeBookings],
  );

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

  const availableDriverRequests = useMemo(() => {
    if (!isDriver || !currentUser?.id) {
      return [];
    }

    const getDepartureTime = (departureDate?: string | null) => {
      if (!departureDate) {
        return Number.MAX_SAFE_INTEGER;
      }

      const timestamp = new Date(departureDate).getTime();
      return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
    };

    return [...availableTripRequests]
      .filter((request) => request.passengerId !== currentUser.id && !request.tripId)
      .sort((a, b) => {
        const departureDelta = getDepartureTime(a.departureDateMin) - getDepartureTime(b.departureDateMin);
        if (departureDelta !== 0) {
          return departureDelta;
        }

        const updatedA = new Date(a.updatedAt || a.createdAt).getTime();
        const updatedB = new Date(b.updatedAt || b.createdAt).getTime();
        return updatedB - updatedA;
      })
      .slice(0, RECENT_TRIPS_LIMIT);
  }, [availableTripRequests, currentUser?.id, isDriver]);

  const latestTrips = useMemo(() => {
    const tripsById = new Map<string, Trip>();
    (remoteTrips ?? storedTrips ?? []).forEach((trip) => tripsById.set(trip.id, trip));
    activeBookings.forEach((booking) => {
      if (booking.trip && !tripsById.has(booking.trip.id)) {
        tripsById.set(booking.trip.id, booking.trip);
      }
    });

    const baseTrips = Array.from(tripsById.values());
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartTs = todayStart.getTime();
    const tomorrowStartTs = todayStartTs + 24 * 60 * 60 * 1000;

    return [...baseTrips]
      .filter((trip) => {
        if (!hasUpcomingDeparture(trip)) {
          return false;
        }

        if (!currentUser?.id) {
          return true;
        }

        if (trip.driverId === currentUser.id) {
          return false;
        }

        return !completedBookingTripIds.has(trip.id);
      })
      .sort((a, b) => {
        const aIsBooked = bookedTripIds.has(a.id);
        const bIsBooked = bookedTripIds.has(b.id);

        if (aIsBooked !== bIsBooked) {
          return aIsBooked ? -1 : 1;
        }

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
  }, [
    remoteTrips,
    storedTrips,
    activeBookings,
    bookedTripIds,
    currentUser?.id,
    completedBookingTripIds,
  ]);

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
  const openSheetHeight = isDriver
    ? Math.min(Math.max(height * 0.38, isCompactScreen ? 328 : 354), 388)
    : Math.min(Math.max(height * 0.34, isCompactScreen ? 296 : 318), 348);
  const retractedSheetHeight = 78;
  const sheetHeight = tripsSheetOpen ? openSheetHeight : retractedSheetHeight;
  const locationButtonBottom = sheetBottomOffset + sheetHeight + Spacing.md;
  const tripCardWidth = Math.min(width - 56, 342);
  const availableTripsLabel = `${latestTrips.length} trajet${latestTrips.length > 1 ? 's' : ''}`;
  const availableRequestsLabel = `${availableDriverRequests.length} demande${availableDriverRequests.length > 1 ? 's' : ''}`;
  const isRequestsSheetMode = homeSheetMode === 'requests' && isDriver;
  const sheetTitle = isRequestsSheetMode ? 'Demandes de trajet' : 'Trajets publiés';
  const sheetSubtitle = isRequestsSheetMode
    ? availableDriverRequests.length > 0
      ? `${availableRequestsLabel} à traiter`
      : 'Aucune demande pour le moment'
    : latestTrips.length > 0
      ? `${availableTripsLabel} à parcourir`
      : 'Aucune offre pour le moment';
  const sheetLoading = isRequestsSheetMode ? availableTripRequestsLoading : tripsLoading;
  const sheetError = isRequestsSheetMode ? availableTripRequestsError : tripsError;
  const sheetEmpty = isRequestsSheetMode ? availableDriverRequests.length === 0 : latestTrips.length === 0;
  const showInitialHomeLoader = tripsLoading && !remoteTrips && storedTrips.length === 0;
  const shouldRenderHomeMap = isFocused;
  const refetchSheetContent = () => {
    if (isRequestsSheetMode) {
      return refetchAvailableTripRequests();
    }

    return refetchTrips();
  };
  const openSheetIndex = () => {
    if (isRequestsSheetMode) {
      router.push('/requests');
      return;
    }

    router.push('/search');
  };
  const openTripDetail = (tripId: string) => {
    if (openingTripRef.current) return;

    openingTripRef.current = true;
    setOpeningTripId(tripId);
    openingTripTimerRef.current = setTimeout(() => {
      router.replace(`/trip/${tripId}`);
      openingTripTimerRef.current = null;
    }, Platform.OS === 'ios' ? 140 : 40);
  };

  useEffect(() => {
    if (isFocused && !openingTripId) openingTripRef.current = false;
  }, [isFocused, openingTripId]);

  useEffect(() => () => {
    if (openingTripTimerRef.current) clearTimeout(openingTripTimerRef.current);
  }, []);

  const selectTripOnMap = (tripId: string) => {
    setMapFocusedOnUser(false);
    setSelectedTripId(tripId);
  };

  const showUserLocationCallout = () => {
    [140, 620].forEach((delay) => {
      setTimeout(() => {
        userLocationMarkerRef.current?.showCallout();
      }, delay);
    });
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
      const currentLocation = await getCurrentLocation();
      const coordinate =
        (currentLocation
          ? {
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
            }
          : null) ?? knownCoordinate;

      if (!coordinate) {
        showDialog({
          variant: 'warning',
          title: 'Localisation indisponible',
          message: 'Activez la localisation pour revenir à votre position sur la carte.',
        });
        return;
      }

      setUserLocationMarker({
        coordinate,
        title: 'Ma position',
        address: "Recherche de l'adresse actuelle...",
      });
      setMapFocusedOnUser(true);
      mapRef.current?.animateToRegion(
        {
          ...coordinate,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        },
        480,
      );
      showUserLocationCallout();

      const selection = await buildCurrentLocationSelection(coordinate);
      setUserLocationMarker({
        coordinate,
        title: selection.title || 'Ma position',
        address: selection.address,
      });
      showUserLocationCallout();
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
      openTripDetail(tripId);
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
      {shouldRenderHomeMap && !openingTripId ? (
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={mapRegion}
        showsCompass={false}
        showsUserLocation={!userLocationMarker && Boolean(lastKnownLocation?.coords)}
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
            ? getTripMarkerImage(trip, isSelected)
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
              key={`${trip.id}:${trip.vehicleType || 'car'}`}
              identifier={trip.id}
              coordinate={coordinate}
              anchor={TRIP_MARKER_ANCHOR}
              image={androidTripMarkerImage}
              title={`${formatPrice(trip.price)} - ${trip.driverName || 'Conducteur Zwanga'}`}
              description={`${formatDateTime(trip.departureTime)} · ${placeName(trip.departure)} vers ${placeName(trip.arrival)} · ${trip.availableSeats} place${trip.availableSeats > 1 ? 's' : ''}`}
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
                    <Text style={styles.tripMapCalloutTime}>{formatDateTime(trip.departureTime)}</Text>
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
        {userLocationMarker && (
          <Marker
            ref={(marker) => {
              userLocationMarkerRef.current = marker;
            }}
            identifier="home-user-location"
            coordinate={userLocationMarker.coordinate}
            anchor={USER_LOCATION_MARKER_ANCHOR}
            image={USE_ANDROID_TRIP_MARKER_IMAGE ? userLocationMarkerImage : undefined}
            title={userLocationMarker.title}
            description={userLocationMarker.address}
            onPress={showUserLocationCallout}
            tracksViewChanges={false}
            zIndex={30}
          >
            {!USE_ANDROID_TRIP_MARKER_IMAGE && <UserLocationMapMarker />}
            <Callout tooltip>
              <View style={styles.userLocationCallout}>
                <View style={styles.userLocationCalloutTop}>
                  <View style={styles.userLocationCalloutIcon}>
                    <Ionicons name="navigate" size={14} color={Colors.white} />
                  </View>
                  <Text style={styles.userLocationCalloutTitle} numberOfLines={1}>
                    {userLocationMarker.title}
                  </Text>
                </View>
                <Text style={styles.userLocationCalloutAddress} numberOfLines={2}>
                  {userLocationMarker.address}
                </Text>
              </View>
            </Callout>
          </Marker>
        )}
      </MapView>
      ) : (
        <View style={styles.map} />
      )}

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
                <Text style={styles.statusText} numberOfLines={1}>
                  {availableTripsLabel} disponible{latestTrips.length > 1 ? 's' : ''}
                </Text>
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
            <Text style={styles.searchTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9}>
              Où allez-vous ?
            </Text>
            <Text style={styles.searchSubtitle} numberOfLines={1}>Départ et destination</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={HOME_COLORS.navy} />
        </TouchableOpacity>

        <View style={styles.actionDock}>
          <TouchableOpacity
            activeOpacity={0.88}
            style={[styles.actionButton, styles.actionPublishButton]}
            onPress={() => router.push('/publish')}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.white} />
            <Text style={[styles.actionButtonText, styles.actionButtonTextStrong]} numberOfLines={1}>Publier</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.88}
            style={[styles.actionButton, styles.actionRequestButton]}
            onPress={() => router.push(getTripRequestCreateHref())}
          >
            <Ionicons name="paper-plane-outline" size={18} color={Colors.white} />
            <Text style={[styles.actionButtonText, styles.actionButtonTextStrong]} numberOfLines={1}>Demander</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.actionSearchButton}
            onPress={() => router.push('/search')}
          >
            <Ionicons name="search" size={17} color={Colors.white} />
            <Text style={styles.actionSearchText} numberOfLines={1}>Chercher</Text>
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
            <Text style={styles.sheetTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              {sheetTitle}
            </Text>
            <Text style={styles.sheetSubtitle} numberOfLines={1}>
              {sheetSubtitle}
            </Text>
          </TouchableOpacity>
          <View style={styles.sheetHeaderActions}>
            <TouchableOpacity activeOpacity={0.75} onPress={openSheetIndex}>
              <Text style={styles.seeAllText} numberOfLines={1}>Voir tout</Text>
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

        {tripsSheetOpen && isDriver && (
          <View style={styles.sheetModeSwitch}>
            <TouchableOpacity
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityState={{ selected: !isRequestsSheetMode }}
              style={[styles.sheetModeOption, !isRequestsSheetMode && styles.sheetModeOptionActive]}
              onPress={() => setHomeSheetMode('trips')}
            >
              <Ionicons
                name="car-outline"
                size={15}
                color={!isRequestsSheetMode ? Colors.white : HOME_COLORS.navy}
              />
              <Text
                style={[styles.sheetModeText, !isRequestsSheetMode && styles.sheetModeTextActive]}
                numberOfLines={1}
              >
                Trajets
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityState={{ selected: isRequestsSheetMode }}
              style={[styles.sheetModeOption, isRequestsSheetMode && styles.sheetModeOptionActive]}
              onPress={() => setHomeSheetMode('requests')}
            >
              <Ionicons
                name="document-text-outline"
                size={15}
                color={isRequestsSheetMode ? Colors.white : HOME_COLORS.navy}
              />
              <Text
                style={[styles.sheetModeText, isRequestsSheetMode && styles.sheetModeTextActive]}
                numberOfLines={1}
              >
                Demandes
              </Text>
              {availableDriverRequests.length > 0 && (
                <View style={[styles.sheetModeCountBadge, isRequestsSheetMode && styles.sheetModeCountBadgeActive]}>
                  <Text style={[styles.sheetModeCountText, isRequestsSheetMode && styles.sheetModeCountTextActive]}>
                    {availableDriverRequests.length > 9 ? '9+' : availableDriverRequests.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {tripsSheetOpen && sheetLoading && (
          <HomeSheetLoadingState />
        )}

        {tripsSheetOpen && sheetError && !sheetLoading && (
          <View style={styles.sheetState}>
            <Ionicons name="alert-circle-outline" size={24} color={Colors.danger} />
            <Text style={styles.sheetStateText}>
              Impossible de charger les {isRequestsSheetMode ? 'demandes' : 'trajets'}.
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={refetchSheetContent}>
              <Text style={styles.retryButtonText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {tripsSheetOpen && !sheetLoading && !sheetError && sheetEmpty && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name={isRequestsSheetMode ? 'document-text-outline' : 'car-outline'}
                size={24}
                color={HOME_COLORS.navy}
              />
            </View>
            <View style={styles.emptyTextBlock}>
              <Text style={styles.emptyTitle}>
                {isRequestsSheetMode ? 'Aucune demande disponible' : 'Aucun trajet disponible'}
              </Text>
              <Text style={styles.emptyText}>
                {isRequestsSheetMode
                  ? 'Revenez plus tard pour accepter une demande passager.'
                  : 'Publiez le vôtre ou revenez plus tard.'}
              </Text>
            </View>
          </View>
        )}

        {tripsSheetOpen && !sheetLoading && !sheetError && isRequestsSheetMode && availableDriverRequests.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tripsHorizontalContent}
          >
            {availableDriverRequests.map((request) => (
              <TripRequestPreviewCard
                key={request.id}
                cardWidth={tripCardWidth}
                request={request}
                onOpen={() => router.push(getTripRequestDetailHref(request.id))}
              />
            ))}
          </ScrollView>
        )}

        {tripsSheetOpen && !sheetLoading && !sheetError && !isRequestsSheetMode && latestTrips.length > 0 && (
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
                onOpen={() => openTripDetail(trip.id)}
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
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  tripMapMarkerFrameSelected: {
    width: 70,
    height: 70,
  },
  tripMapMarkerImage: {
    width: 56,
    height: 56,
  },
  tripMapMarkerImageSelected: {
    width: 62,
    height: 62,
  },
  userLocationMarkerFrame: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  userLocationMarkerImage: {
    width: 58,
    height: 58,
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
  userLocationCallout: {
    width: 236,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    ...CommonStyles.shadowMd,
  },
  userLocationCalloutTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  userLocationCalloutIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HOME_COLORS.navy,
  },
  userLocationCalloutTitle: {
    flex: 1,
    color: HOME_COLORS.ink,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  userLocationCalloutAddress: {
    marginTop: Spacing.sm,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    lineHeight: 19,
    fontWeight: FontWeights.medium,
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
  actionButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: BorderRadius.lg,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  actionPublishButton: {
    backgroundColor: Colors.primary,
  },
  actionRequestButton: {
    backgroundColor: HOME_COLORS.navy,
  },
  actionButtonText: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  actionButtonTextStrong: {
    color: Colors.white,
  },
  actionSearchButton: {
    width: 82,
    minHeight: 48,
    borderRadius: BorderRadius.lg,
    backgroundColor: HOME_COLORS.success,
    borderWidth: 1,
    borderColor: HOME_COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    ...CommonStyles.shadowSm,
  },
  actionSearchText: {
    color: Colors.white,
    fontSize: 11,
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
  sheetModeSwitch: {
    minHeight: 40,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
    padding: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    flexDirection: 'row',
    gap: 4,
  },
  sheetModeOption: {
    flex: 1,
    minHeight: 32,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  sheetModeOptionActive: {
    backgroundColor: HOME_COLORS.navy,
  },
  sheetModeText: {
    color: HOME_COLORS.navy,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  sheetModeTextActive: {
    color: Colors.white,
  },
  sheetModeCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
  },
  sheetModeCountBadgeActive: {
    borderColor: 'rgba(255,255,255,0.42)',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  sheetModeCountText: {
    color: HOME_COLORS.navy,
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  sheetModeCountTextActive: {
    color: Colors.white,
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
  requestPreviewCard: {
    height: 208,
    borderRadius: BorderRadius.xl,
    backgroundColor: '#FBFEFF',
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    padding: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  requestPreviewTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  requestPassengerInline: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestPreviewAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: Spacing.sm,
    backgroundColor: Colors.gray[100],
  },
  requestPreviewAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HOME_COLORS.navySoft,
  },
  requestPreviewAvatarText: {
    color: HOME_COLORS.navy,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  requestPreviewPassengerCopy: {
    flex: 1,
    minWidth: 0,
  },
  requestPreviewPassengerName: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  requestPreviewDate: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  requestPreviewStatusBadge: {
    maxWidth: 132,
    minHeight: 30,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  requestPreviewStatusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  requestPreviewRoute: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
  requestPreviewRail: {
    width: 18,
    alignItems: 'center',
    paddingVertical: 3,
    marginRight: Spacing.md,
  },
  requestPreviewRouteDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 4,
    backgroundColor: Colors.white,
  },
  requestPreviewStartDot: {
    borderColor: HOME_COLORS.success,
  },
  requestPreviewEndDot: {
    borderColor: Colors.primary,
  },
  requestPreviewRouteLine: {
    flex: 1,
    minHeight: 22,
    borderLeftWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: HOME_COLORS.body,
    marginVertical: 3,
  },
  requestPreviewRouteCopy: {
    flex: 1,
    gap: Spacing.sm,
  },
  requestPreviewRouteLabel: {
    color: HOME_COLORS.body,
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  requestPreviewRouteText: {
    marginTop: 2,
    color: HOME_COLORS.text,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  requestPreviewFooter: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  requestPreviewChips: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  requestPreviewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: HOME_COLORS.navySoft,
  },
  requestPreviewChipText: {
    color: HOME_COLORS.navy,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  requestPreviewBudgetChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '14',
  },
  requestPreviewBudgetText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  requestPreviewOffersChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: '#DDF8EA',
  },
  requestPreviewOffersText: {
    color: HOME_COLORS.success,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  requestPreviewOpenButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HOME_COLORS.navy,
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
