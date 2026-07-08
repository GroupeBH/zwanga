import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import { trackEvent } from '@/services/analytics';
import {
  TripSearchByPointsPayload,
  TripSearchParams,
  useGetTripsQuery,
  useSearchTripsByCoordinatesMutation,
} from '@/store/api/tripApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useAppSelector } from '@/store/hooks';
import { selectTrips } from '@/store/selectors';
import type { Trip } from '@/types';
import { formatDateTime } from '@/utils/dateHelpers';
import { getTripRequestCreateHref } from '@/utils/requestNavigation';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SortMode = 'cheap' | 'early';
const MIN_SEARCH_SEATS = 1;
const MAX_SEARCH_SEATS = 2;

const SEARCH_COLORS = {
  ink: '#07112A',
  body: '#4B2D28',
  border: '#EAB8A9',
  panel: '#F2F3F5',
  softBlue: '#DDE8FF',
};

const vehicleLabel: Record<Trip['vehicleType'], string> = {
  car: 'Voiture',
  moto: 'Moto',
  tricycle: 'Keke',
};

const SEARCH_STOP_WORDS = new Set([
  'a',
  'au',
  'aux',
  'chez',
  'd',
  'dans',
  'de',
  'des',
  'du',
  'en',
  'et',
  'la',
  'le',
  'les',
  'pour',
  'sur',
  'vers',
]);

function parseNumberParam(value: unknown): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;

  if (typeof raw !== 'string' || raw.length === 0) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampSearchSeats(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MIN_SEARCH_SEATS;
  }

  return Math.min(MAX_SEARCH_SEATS, Math.max(MIN_SEARCH_SEATS, Math.floor(value)));
}

function formatPrice(price?: number | null) {
  const safePrice = Number(price ?? 0);

  if (!Number.isFinite(safePrice) || safePrice <= 0) {
    return 'Gratuit';
  }

  return `${String(Math.round(safePrice)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} FC`;
}

function formatDurationMinutes(startIso: string, endIso?: string | null) {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Number.NaN;

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 'Durée à confirmer';
  }

  const totalMinutes = Math.max(1, Math.round((end - start) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes} min`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes} min`;
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

function getPlaceName(place?: Trip['departure']) {
  return place?.name || place?.address || 'Adresse à préciser';
}

function getVehicleName(trip: Trip) {
  if (trip.vehicle?.brand || trip.vehicle?.model) {
    return `${trip.vehicle.brand ?? ''} ${trip.vehicle.model ?? ''}`.trim();
  }

  return trip.vehicleInfo || vehicleLabel[trip.vehicleType || 'car'];
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getSearchTerms(value: string) {
  return Array.from(
    new Set(
      normalizeSearchText(value)
        .split(/[^a-z0-9]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2 && !SEARCH_STOP_WORDS.has(term)),
    ),
  ).slice(0, 8);
}

function matchesSearch(value: string | undefined, query: string) {
  const terms = getSearchTerms(query);

  if (terms.length === 0) {
    return true;
  }

  const normalizedValue = normalizeSearchText(value ?? '');
  return terms.some((term) => normalizedValue.includes(term));
}

type SearchResultCardProps = {
  trip: Trip;
  onPress: () => void;
};

function SearchResultCard({ trip, onPress }: SearchResultCardProps) {
  const calculatedArrivalTime = useTripArrivalTime(trip);
  const arrivalIso = calculatedArrivalTime?.toISOString() ?? trip.arrivalTime;
  const departureDateTime = formatDateTime(trip.departureTime);
  const arrivalDateTime = formatDateTime(arrivalIso);
  const parsedRating = Number(trip.driverRating);
  const hasRating = Number.isFinite(parsedRating) && parsedRating > 0;
  const driverName = trip.driverName || 'Conducteur Zwanga';
  const isVerified = Boolean(trip.driver?.premiumBadge || trip.driver?.premiumBadgeEnabled || trip.driver?.isPremium);
  const vehicleName = getVehicleName(trip);
  const seatsLabel = `${trip.availableSeats} place${trip.availableSeats > 1 ? 's' : ''} libre${trip.availableSeats > 1 ? 's' : ''}`;
  const routeAccent = trip.vehicleType === 'moto' ? Colors.primaryDark : trip.vehicleType === 'tricycle' ? Colors.infoDark : Colors.success;

  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.resultCard} onPress={onPress}>
      <View style={styles.resultTop}>
        <View style={styles.driverAvatarWrap}>
          {trip.driverAvatar ? (
            <Image source={{ uri: trip.driverAvatar }} style={styles.driverAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.driverAvatar, styles.driverAvatarFallback]}>
              <Text style={styles.driverAvatarText}>{getInitials(driverName)}</Text>
            </View>
          )}
          {isVerified && (
            <View style={styles.driverVerifiedBadge}>
              <Ionicons name="checkmark" size={12} color={Colors.white} />
            </View>
          )}
        </View>

        <View style={styles.driverCopy}>
          <Text style={styles.driverName} numberOfLines={1}>
            {driverName}
          </Text>
          <View style={styles.driverMetaRow}>
            <Ionicons name={hasRating ? 'star' : 'star-outline'} size={15} color={Colors.successDark} />
            <Text style={styles.driverMetaText}>
              {hasRating ? parsedRating.toFixed(1) : 'Nouveau'}
            </Text>
            <Text style={styles.driverMetaDot}>•</Text>
            <Text style={styles.driverMetaText}>
              {trip.driver?.totalRatings ? `${trip.driver.totalRatings} trajets` : 'Trajets récents'}
            </Text>
          </View>
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.resultPrice}>{formatPrice(trip.price)}</Text>
          {trip.price > 0 && <Text style={styles.priceUnit}>par personne</Text>}
        </View>
      </View>

      <View style={styles.tripTimingPanel}>
        <View style={[styles.timingAccent, { backgroundColor: routeAccent }]} />
        <View style={styles.departureTimeBlock}>
          <Text style={styles.departureTime}>{departureDateTime}</Text>
          <Text style={[styles.departureLabel, { color: routeAccent }]}>DÉPART</Text>
        </View>
        <View style={styles.durationBlock}>
          <View style={styles.durationLine} />
          <Text style={styles.durationText}>{formatDurationMinutes(trip.departureTime, arrivalIso)}</Text>
          <Ionicons name="car-sport" size={16} color={SEARCH_COLORS.body} />
        </View>
        <View style={styles.vehicleBlock}>
          <View style={styles.vehiclePill}>
            <Text style={styles.vehiclePillText} numberOfLines={1}>
              {vehicleName}
            </Text>
          </View>
          <Text style={styles.vehicleSubtext} numberOfLines={2}>
            {trip.description || `${vehicleLabel[trip.vehicleType || 'car']} • ${seatsLabel}`}
          </Text>
          <Text style={styles.arrivalEstimateText} numberOfLines={1}>
            Arrivee estimee {arrivalDateTime}
          </Text>
        </View>
      </View>

      <View style={styles.routeSummary}>
        <Text style={styles.routeSummaryText} numberOfLines={1}>
          {getPlaceName(trip.departure)} → {getPlaceName(trip.arrival)}
        </Text>
      </View>

      <View style={styles.resultBadges}>
        {isVerified && (
          <View style={styles.greenBadge}>
            <Ionicons name="shield-checkmark-outline" size={14} color={Colors.successDark} />
            <Text style={styles.greenBadgeText}>VÉRIFIÉ</Text>
          </View>
        )}
        {trip.price > 0 ? (
          <View style={styles.instantBadge}>
            <Ionicons name="flash" size={13} color={Colors.primaryDark} />
            <Text style={styles.instantBadgeText}>RÉSERVATION INSTANTANÉE</Text>
          </View>
        ) : (
          <View style={styles.greenBadge}>
            <Ionicons name="cash-outline" size={14} color={Colors.successDark} />
            <Text style={styles.greenBadgeText}>GRATUIT</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{
    arrival?: string;
    arrivalLat?: string;
    arrivalLng?: string;
    arrivalRadiusKm?: string;
    departure?: string;
    departureLat?: string;
    departureLng?: string;
    departureRadiusKm?: string;
    minSeats?: string;
    mode?: string;
    seats?: string;
  }>();
  const storedTrips = useAppSelector(selectTrips);
  const { data: currentUser } = useGetCurrentUserQuery();
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [draftDeparture, setDraftDeparture] = useState('');
  const [draftArrival, setDraftArrival] = useState('');
  const [desiredSeats, setDesiredSeats] = useState(MIN_SEARCH_SEATS);
  const [queryParams, setQueryParams] = useState<TripSearchParams>({});
  const [advancedTrips, setAdvancedTrips] = useState<Trip[] | null>(null);
  const [advancedError, setAdvancedError] = useState<string | null>(null);
  const [lastAdvancedPayload, setLastAdvancedPayload] = useState<TripSearchByPointsPayload | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('cheap');
  const [searchTripsByCoordinates, { isLoading: isAdvancedSearching }] = useSearchTripsByCoordinatesMutation();
  const firstName = currentUser?.firstName || currentUser?.name?.split(' ')[0] || 'Kinshasa';
  const avatarUri = currentUser?.profilePicture || currentUser?.avatar;

  const {
    data: remoteTrips,
    isLoading: queryLoading,
    isFetching: queryFetching,
    refetch,
  } = useGetTripsQuery(queryParams, {
    pollingInterval: 60000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    const departureParam = typeof searchParams.departure === 'string' ? searchParams.departure : '';
    const arrivalParam = typeof searchParams.arrival === 'string' ? searchParams.arrival : '';
    const seatsParam = clampSearchSeats(
      parseNumberParam(searchParams.minSeats) ?? parseNumberParam(searchParams.seats),
    );

    setDeparture(departureParam);
    setArrival(arrivalParam);
    setDraftDeparture(departureParam);
    setDraftArrival(arrivalParam);
    setDesiredSeats(seatsParam);
    setQueryParams({
      departureLocation: departureParam || undefined,
      arrivalLocation: arrivalParam || undefined,
      minSeats: seatsParam,
    });
  }, [searchParams.departure, searchParams.arrival, searchParams.minSeats, searchParams.seats]);

  const runAdvancedSearch = async (payload: TripSearchByPointsPayload) => {
    setAdvancedError(null);
    setAdvancedTrips(null);

    try {
      const results = await searchTripsByCoordinates(payload).unwrap();
      setAdvancedTrips(results);
      void trackEvent('search_results_viewed', {
        search_mode: 'coordinates',
        results_count: results.length,
        departure_radius_km: payload.departureRadiusKm,
        arrival_radius_km: payload.arrivalRadiusKm,
      });
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? 'Impossible de filtrer par carte pour le moment.';
      setAdvancedError(Array.isArray(message) ? message.join('\n') : message);
    }
  };

  useEffect(() => {
    const mode = String(searchParams.mode || '');
    const depLat = parseNumberParam(searchParams.departureLat);
    const depLng = parseNumberParam(searchParams.departureLng);
    const arrLat = parseNumberParam(searchParams.arrivalLat);
    const arrLng = parseNumberParam(searchParams.arrivalLng);
    const depRadius = parseNumberParam(searchParams.departureRadiusKm);
    const arrRadius = parseNumberParam(searchParams.arrivalRadiusKm);
    const hasDepartureCoordinates = depLat !== undefined && depLng !== undefined;
    const hasArrivalCoordinates = arrLat !== undefined && arrLng !== undefined;

    if (mode === 'map' && (hasDepartureCoordinates || hasArrivalCoordinates)) {
      const payload = {
        minSeats: desiredSeats,
        ...(hasDepartureCoordinates
          ? {
              departureCoordinates: [depLng, depLat] as [number, number],
              departureRadiusKm: depRadius ?? 50,
            }
          : {}),
        ...(hasArrivalCoordinates
          ? {
              arrivalCoordinates: [arrLng, arrLat] as [number, number],
              arrivalRadiusKm: arrRadius ?? 50,
            }
          : {}),
      };

      setLastAdvancedPayload(payload);
      runAdvancedSearch(payload);
    } else {
      setAdvancedTrips(null);
      setAdvancedError(null);
      setLastAdvancedPayload(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    searchParams.mode,
    searchParams.departureLat,
    searchParams.departureLng,
    searchParams.arrivalLat,
    searchParams.arrivalLng,
    searchParams.departureRadiusKm,
    searchParams.arrivalRadiusKm,
    desiredSeats,
  ]);

  const baseTrips = useMemo(() => {
    if (advancedTrips) {
      return advancedTrips;
    }

    if (remoteTrips) {
      return remoteTrips;
    }

    return storedTrips;
  }, [advancedTrips, remoteTrips, storedTrips]);

  const filteredTrips = useMemo(() => {
    const visibleTrips = baseTrips.filter((trip) => {
      const departureText = `${trip.departure?.name ?? ''} ${trip.departure?.address ?? ''}`;
      const arrivalText = `${trip.arrival?.name ?? ''} ${trip.arrival?.address ?? ''}`;
      const routeText = `${departureText} ${arrivalText}`;
      const routeQuery = [departure, arrival].filter(Boolean).join(' ');

      return trip.availableSeats >= desiredSeats && matchesSearch(routeText, routeQuery);
    });

    return [...visibleTrips].sort((a, b) => {
      if (sortMode === 'cheap') {
        const priceA = Number(a.price ?? 0);
        const priceB = Number(b.price ?? 0);

        if (priceA !== priceB) {
          return priceA - priceB;
        }
      }

      const departureA = new Date(a.departureTime).getTime();
      const departureB = new Date(b.departureTime).getTime();
      const safeDepartureA = Number.isFinite(departureA) ? departureA : Number.MAX_SAFE_INTEGER;
      const safeDepartureB = Number.isFinite(departureB) ? departureB : Number.MAX_SAFE_INTEGER;

      return safeDepartureA - safeDepartureB;
    });
  }, [arrival, baseTrips, departure, desiredSeats, sortMode]);

  const isLoadingResults = (queryLoading || isAdvancedSearching) && baseTrips.length === 0;
  const isRefreshingResults = queryFetching || isAdvancedSearching;
  useEffect(() => {
    const timeout = setTimeout(() => {
      const nextDeparture = draftDeparture.trim();
      const nextArrival = draftArrival.trim();

      if (nextDeparture === departure && nextArrival === arrival) {
        return;
      }

      setDeparture(nextDeparture);
      setArrival(nextArrival);
      setAdvancedTrips(null);
      setAdvancedError(null);
      setLastAdvancedPayload(null);
      setQueryParams({
        departureLocation: nextDeparture || undefined,
        arrivalLocation: nextArrival || undefined,
        minSeats: desiredSeats,
      });
    }, 450);

    return () => clearTimeout(timeout);
  }, [
    arrival,
    departure,
    desiredSeats,
    draftArrival,
    draftDeparture,
  ]);

  const handleApplySearch = () => {
    const nextDeparture = draftDeparture.trim();
    const nextArrival = draftArrival.trim();
    setDeparture(nextDeparture);
    setArrival(nextArrival);
    setAdvancedTrips(null);
    setAdvancedError(null);
    setLastAdvancedPayload(null);
    setQueryParams({
      departureLocation: nextDeparture || undefined,
      arrivalLocation: nextArrival || undefined,
      minSeats: desiredSeats,
    });
    void trackEvent('search_submitted', {
      search_mode: 'text',
      has_departure: Boolean(nextDeparture),
      has_arrival: Boolean(nextArrival),
      seats: desiredSeats,
    });
  };

  const updateDesiredSeats = (nextSeats: number) => {
    setDesiredSeats(clampSearchSeats(nextSeats));
  };

  const handleRetry = () => {
    if (lastAdvancedPayload) {
      runAdvancedSearch(lastAdvancedPayload);
      return;
    }

    refetch();
  };

  const handleCreateTripRequest = () => {
    router.push(
      getTripRequestCreateHref({
        departure: draftDeparture || departure,
        arrival: draftArrival || arrival,
        seats: desiredSeats,
      }),
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Bonjour, {firstName}
        </Text>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.headerAvatar} resizeMode="cover" />
        ) : (
          <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
            <Text style={styles.headerAvatarText}>{getInitials(firstName)}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.routeSummaryCard}>
          <View style={styles.routeSummaryPlaces}>
            <View style={styles.routeSummaryRow}>
              <View style={[styles.routeDot, styles.routeDotStart]} />
              <TextInput
                style={styles.routeInput}
                value={draftDeparture}
                onChangeText={setDraftDeparture}
                onSubmitEditing={handleApplySearch}
                placeholder="Point de départ"
                placeholderTextColor={Colors.gray[500]}
                returnKeyType="next"
                autoCorrect={false}
              />
              {draftDeparture.length > 0 && (
                <TouchableOpacity
                  style={styles.clearRouteButton}
                  onPress={() => setDraftDeparture('')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.gray[400]} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.routeInputDivider} />
            <View style={styles.routeSummaryRow}>
              <View style={[styles.routeDot, styles.routeDotEnd]} />
              <TextInput
                style={styles.routeInput}
                value={draftArrival}
                onChangeText={setDraftArrival}
                onSubmitEditing={handleApplySearch}
                placeholder="Destination"
                placeholderTextColor={Colors.gray[500]}
                returnKeyType="search"
                autoCorrect={false}
              />
              {draftArrival.length > 0 && (
                <TouchableOpacity
                  style={styles.clearRouteButton}
                  onPress={() => setDraftArrival('')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.gray[400]} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.passengerBlock}>
            <View style={styles.passengerStepper}>
              <TouchableOpacity
                style={[styles.passengerStepButton, desiredSeats <= MIN_SEARCH_SEATS && styles.passengerStepButtonDisabled]}
                onPress={() => updateDesiredSeats(desiredSeats - 1)}
                disabled={desiredSeats <= MIN_SEARCH_SEATS}
                activeOpacity={0.75}
              >
                <Ionicons name="remove" size={16} color={desiredSeats <= MIN_SEARCH_SEATS ? Colors.gray[400] : Colors.primaryDark} />
              </TouchableOpacity>
              <View style={styles.passengerCountBlock}>
                <Text style={styles.passengerCount}>{desiredSeats}</Text>
                <Text style={styles.passengerLabel}>PERS.</Text>
              </View>
              <TouchableOpacity
                style={[styles.passengerStepButton, desiredSeats >= MAX_SEARCH_SEATS && styles.passengerStepButtonDisabled]}
                onPress={() => updateDesiredSeats(desiredSeats + 1)}
                disabled={desiredSeats >= MAX_SEARCH_SEATS}
                activeOpacity={0.75}
              >
                <Ionicons name="add" size={16} color={desiredSeats >= MAX_SEARCH_SEATS ? Colors.gray[400] : Colors.primaryDark} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.resultsToolbar}>
          <View style={styles.resultsCountRow}>
            <Text style={styles.resultsCount}>
              {filteredTrips.length} trajet{filteredTrips.length > 1 ? 's' : ''} trouvé{filteredTrips.length > 1 ? 's' : ''}
            </Text>
            {isRefreshingResults && <ActivityIndicator size="small" color={Colors.primary} />}
          </View>
          <View style={styles.sortSegment}>
            <TouchableOpacity
              style={[styles.sortButton, sortMode === 'cheap' && styles.sortButtonActive]}
              onPress={() => setSortMode('cheap')}
              activeOpacity={0.82}
            >
              <Text style={[styles.sortButtonText, sortMode === 'cheap' && styles.sortButtonTextActive]}>
                Moins cher
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortButton, sortMode === 'early' && styles.sortButtonActive]}
              onPress={() => setSortMode('early')}
              activeOpacity={0.82}
            >
              <Text style={[styles.sortButtonText, sortMode === 'early' && styles.sortButtonTextActive]}>
                Plus tôt
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {isLoadingResults && (
          <View style={styles.loaderCard}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.loaderTitle}>Recherche des trajets</Text>
            <Text style={styles.loaderText}>On prépare les meilleures offres disponibles.</Text>
          </View>
        )}

        {advancedError && !isLoadingResults && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={24} color={Colors.danger} />
            <Text style={styles.errorText}>{advancedError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoadingResults && !advancedError && filteredTrips.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="trail-sign-outline" size={30} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Aucun trajet trouvé</Text>
            <Text style={styles.emptyText}>
              Demandez ce trajet et les conducteurs disponibles pourront vous proposer une course.
            </Text>
            <TouchableOpacity style={styles.emptyActionButton} onPress={handleCreateTripRequest} activeOpacity={0.86}>
              <Ionicons name="paper-plane-outline" size={18} color={Colors.white} />
              <Text style={styles.emptyActionText}>Demander ce trajet</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoadingResults && !advancedError && (
          <View style={styles.resultsList}>
            {filteredTrips.map((trip) => (
              <SearchResultCard key={trip.id} trip={trip} onPress={() => router.push(`/trip/${trip.id}`)} />
            ))}
          </View>
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
    minHeight: 58,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: SEARCH_COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    color: Colors.primaryDark,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '14',
  },
  headerAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: Colors.primary,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  routeSummaryCard: {
    minHeight: 96,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: SEARCH_COLORS.border,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    ...CommonStyles.shadowSm,
  },
  routeSummaryPlaces: {
    flex: 1,
    paddingRight: Spacing.lg,
  },
  routeSummaryRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  routeInputDivider: {
    height: 1,
    marginLeft: 22,
    backgroundColor: Colors.gray[100],
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeDotStart: {
    backgroundColor: Colors.successDark,
  },
  routeDotEnd: {
    backgroundColor: Colors.primaryDark,
  },
  routeInput: {
    flex: 1,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    minHeight: 40,
    paddingVertical: 0,
  },
  clearRouteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerBlock: {
    width: 116,
    minHeight: 58,
    borderLeftWidth: 1,
    borderLeftColor: SEARCH_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  passengerStepButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '12',
  },
  passengerStepButtonDisabled: {
    backgroundColor: Colors.gray[100],
  },
  passengerCountBlock: {
    minWidth: 32,
    alignItems: 'center',
  },
  passengerCount: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    lineHeight: 28,
  },
  passengerLabel: {
    color: SEARCH_COLORS.body,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  resultsToolbar: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  resultsCountRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  resultsCount: {
    color: SEARCH_COLORS.body,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  sortSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sortButton: {
    minHeight: 40,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButtonActive: {
    backgroundColor: Colors.primaryDark,
  },
  sortButtonText: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  sortButtonTextActive: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  loaderCard: {
    minHeight: 220,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: SEARCH_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
    ...CommonStyles.shadowSm,
  },
  loaderTitle: {
    color: SEARCH_COLORS.ink,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  loaderText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  errorCard: {
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.dangerLight,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  errorText: {
    color: Colors.gray[800],
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '14',
  },
  retryText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  emptyCard: {
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: SEARCH_COLORS.border,
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: SEARCH_COLORS.ink,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  emptyText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyActionButton: {
    marginTop: Spacing.md,
    minHeight: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  emptyActionText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  resultsList: {
    gap: Spacing.xl,
  },
  resultCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: SEARCH_COLORS.border,
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  driverAvatarWrap: {
    position: 'relative',
    width: 62,
    height: 62,
  },
  driverAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.gray[100],
  },
  driverAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  driverVerifiedBadge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.successDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  driverCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 4,
  },
  driverName: {
    color: SEARCH_COLORS.ink,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.medium,
  },
  driverMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverMetaText: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginLeft: 4,
  },
  driverMetaDot: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    marginHorizontal: 4,
  },
  priceBlock: {
    alignItems: 'flex-end',
    minWidth: 104,
  },
  resultPrice: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    lineHeight: 32,
  },
  priceUnit: {
    marginTop: 4,
    color: SEARCH_COLORS.body,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  tripTimingPanel: {
    marginTop: Spacing.lg,
    minHeight: 98,
    borderRadius: BorderRadius.lg,
    backgroundColor: SEARCH_COLORS.panel,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  timingAccent: {
    alignSelf: 'stretch',
    width: 4,
  },
  departureTimeBlock: {
    width: 124,
    paddingLeft: Spacing.md,
  },
  departureTime: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    lineHeight: 18,
  },
  departureLabel: {
    marginTop: 5,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  durationBlock: {
    width: 74,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  durationLine: {
    width: 34,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: SEARCH_COLORS.border,
  },
  durationText: {
    color: SEARCH_COLORS.body,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  vehicleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: Spacing.md,
  },
  vehiclePill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    backgroundColor: SEARCH_COLORS.softBlue,
  },
  vehiclePillText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  vehicleSubtext: {
    marginTop: 5,
    color: SEARCH_COLORS.body,
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  arrivalEstimateText: {
    marginTop: 5,
    color: Colors.primary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  routeSummary: {
    marginTop: Spacing.md,
  },
  routeSummaryText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  resultBadges: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  greenBadge: {
    minHeight: 30,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#65F396',
  },
  greenBadgeText: {
    color: '#053B1B',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  instantBadge: {
    minHeight: 30,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F9D8CF',
  },
  instantBadgeText: {
    color: SEARCH_COLORS.body,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
});
