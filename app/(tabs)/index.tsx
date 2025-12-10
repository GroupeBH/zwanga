import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useGetNotificationsQuery } from '@/store/api/notificationApi';
import {
  TripSearchParams,
  useGetTripsQuery,
  useSearchTripsByCoordinatesMutation,
} from '@/store/api/tripApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectAvailableTrips, selectSavedLocations } from '@/store/selectors';
import { addSavedLocation } from '@/store/slices/locationSlice';
import { setTrips } from '@/store/slices/tripsSlice';
import { formatTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const RECENT_TRIPS_LIMIT = 5;

export default function HomeScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { showDialog } = useDialog();
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
  const [departureRadius, setDepartureRadius] = useState('10');
  const [arrivalRadius, setArrivalRadius] = useState('10');
  const [minSeatsFilter, setMinSeatsFilter] = useState('');
  const [maxPriceFilter, setMaxPriceFilter] = useState('');
  const [showQuickFields, setShowQuickFields] = useState(false);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(true);
  const {
    data: remoteTrips,
    isLoading: tripsLoading,
    isError: tripsError,
    refetch: refetchTrips,
  } = useGetTripsQuery(queryParams);
  const { data: notifications } = useGetNotificationsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  useEffect(() => {
    if (remoteTrips) {
      dispatch(setTrips(remoteTrips));
    }
  }, [remoteTrips, dispatch]);

  const baseTrips = remoteTrips ?? storedTrips ?? [];
  const latestTrips = useMemo(() => {
    return [...baseTrips]
      .sort((a, b) => {
        const dateA = new Date(a.departureTime).getTime();
        const dateB = new Date(b.departureTime).getTime();
        return dateB - dateA;
      })
      .slice(0, RECENT_TRIPS_LIMIT);
  }, [baseTrips]);
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
    if (!filterDepartureLocation || !filterArrivalLocation) {
      showDialog({
        variant: 'warning',
        title: 'Sélection requise',
        message: 'Veuillez choisir les points de départ et d’arrivée.',
      });
      return;
    }

    const payload = {
      departureCoordinates: [
        filterDepartureLocation.longitude,
        filterDepartureLocation.latitude,
      ] as [number, number],
      arrivalCoordinates: [filterArrivalLocation.longitude, filterArrivalLocation.latitude] as [
        number,
        number,
      ],
      departureRadiusKm: parseNumberInput(departureRadius) ?? 10,
      arrivalRadiusKm: parseNumberInput(arrivalRadius) ?? 10,
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
          departureLat: filterDepartureLocation.latitude.toString(),
          departureLng: filterDepartureLocation.longitude.toString(),
          arrivalLat: filterArrivalLocation.latitude.toString(),
          arrivalLng: filterArrivalLocation.longitude.toString(),
          departureRadiusKm: String(payload.departureRadiusKm ?? 10),
          arrivalRadiusKm: String(payload.arrivalRadiusKm ?? 10),
          departureLabel: filterDepartureLocation.title,
          arrivalLabel: filterArrivalLocation.title,
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
    setDepartureRadius('10');
    setArrivalRadius('10');
    setMinSeatsFilter('');
    setMaxPriceFilter('');
  };

  const popularLocations = [
    { id: 'gombe', label: 'Gombe', address: 'Gombe, Kinshasa', coords: { latitude: -4.3206, longitude: 15.3115 } },
    { id: 'lemba', label: 'Lemba', address: 'Lemba, Kinshasa', coords: { latitude: -4.419, longitude: 15.317 } },
    { id: 'kintambo', label: 'Kintambo', address: 'Kintambo, Kinshasa', coords: { latitude: -4.334, longitude: 15.263 } },
    { id: 'ngaliema', label: 'Ngaliema', address: 'Ngaliema, Kinshasa', coords: { latitude: -4.347, longitude: 15.244 } },
    { id: 'bandal', label: 'Bandalungwa', address: 'Bandalungwa, Kinshasa', coords: { latitude: -4.375, longitude: 15.298 } },
    { id: 'kalamu', label: 'Kalamu', address: 'Kalamu, Kinshasa', coords: { latitude: -4.360, longitude: 15.305 } },
  ];

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

  const unreadNotifications =
    notifications?.filter((notification) => !notification.read && !notification.readAt).length ?? 0;
  const hasLocationSelections = Boolean(filterDepartureLocation && filterArrivalLocation);

  const openNotifications = () => {
    router.push('/notifications');
  };

  const animatedSearchCardStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isHeaderExpanded ? 1 : 0, { duration: 200 }),
    maxHeight: withTiming(isHeaderExpanded ? 1000 : 0, { duration: 300 }),
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Bonjour 👋</Text>
            <Text style={styles.headerTitle}>Trouvez votre trajet</Text>
          </View>
          <View style={styles.headerTopRight}>
            <TouchableOpacity 
              style={styles.expandButton} 
              onPress={() => setIsHeaderExpanded(!isHeaderExpanded)}
            >
              <Ionicons 
                name={isHeaderExpanded ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={Colors.white} 
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.notificationButton} onPress={openNotifications}>
              <Ionicons name="notifications" size={24} color={Colors.white} />
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

        {/* Recherche intelligente */}
        <Animated.View 
          style={[
            styles.searchCardContainer,
            animatedSearchCardStyle,
          ]}
        >
          <View style={styles.searchCard}>
            <View style={styles.advancedCard}>
              {/* <Text style={styles.advancedTitle}>Recherche par carte</Text> */}
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
                    <Text style={styles.advancedLocationTitle}>{advancedDepartureSummary.title}</Text>
                    <Text style={styles.advancedLocationSubtitle}>{advancedDepartureSummary.address}</Text>
                    <Text style={styles.advancedLocationCoords}>{advancedDepartureSummary.coords}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.advancedLocationButton}
                  onPress={() => setActivePicker('arrival')}
                >
                  <View style={[styles.advancedLocationIcon, { backgroundColor: Colors.primary + '15' }]}>
                    <Ionicons name="navigate" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.advancedLocationContent}>
                    <Text style={styles.advancedLocationLabel}>Arrivée</Text>
                    <Text style={styles.advancedLocationTitle}>{advancedArrivalSummary.title}</Text>
                    <Text style={styles.advancedLocationSubtitle}>{advancedArrivalSummary.address}</Text>
                    <Text style={styles.advancedLocationCoords}>{advancedArrivalSummary.coords}</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {hasLocationSelections && (
                <View style={styles.advancedButtons}>
                  <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={handleClearAdvancedFilters}>
                    <Text style={styles.buttonSecondaryText}>Réinitialiser</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.button,
                      { flex: 1, marginLeft: Spacing.md },
                      (advancedSearching || !hasLocationSelections) && styles.buttonDisabled,
                    ]}
                    onPress={handleAdvancedSearch}
                    disabled={advancedSearching}
                  >
                    {advancedSearching ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={styles.buttonText}>Appliquer</Text>
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
        {/* Lieux populaires */}
        {/* <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Lieux populaires</Text>
            <TouchableOpacity onPress={() => setAddMode((prev) => !prev)}>
              <Text style={styles.seeAllText}>{addMode ? 'Annuler' : 'Ajouter'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.popularLocations}>
            {popularLocations.map((location) => (
              <TouchableOpacity
                key={location.id}
                style={styles.locationChip}
                onPress={() => handleLocationPress(location)}
                activeOpacity={0.85}
              >
                <Ionicons name="location" size={16} color={Colors.primary} />
                <Text style={styles.locationChipText}>{location.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {savedLocations.length > 0 && (
            <View style={styles.savedSection}>
              <Text style={styles.savedTitle}>Vos lieux favoris</Text>
              {savedLocations.map((location) => (
                <TouchableOpacity
                  key={location.id}
                  style={styles.locationCard}
                  onPress={() => handleLocationPress(location)}
                >
                  <View style={[styles.locationIcon, { backgroundColor: Colors.secondary + '15' }]}>
                    <Ionicons name="star" size={18} color={Colors.secondary} />
                  </View>
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationName}>{location.label}</Text>
                    <Text style={styles.locationAddress}>{location.address}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {addMode && (
            <View style={styles.addLocationCard}>
              <Text style={styles.addLocationTitle}>Ajouter un lieu habituel</Text>
              <View style={styles.addInputRow}>
                <Ionicons name="bookmark" size={18} color={Colors.primary} />
                <TextInput
                  style={styles.addInput}
                  placeholder="Nom (Maison, Bureau...)"
                  placeholderTextColor={Colors.gray[500]}
                  value={customLabel}
                  onChangeText={setCustomLabel}
                />
              </View>
              <View style={styles.addInputRow}>
                <Ionicons name="location" size={18} color={Colors.primary} />
                <TextInput
                  style={styles.addInput}
                  placeholder="Adresse"
                  placeholderTextColor={Colors.gray[500]}
                  value={customAddress}
                  onChangeText={setCustomAddress}
                />
              </View>
              <View style={styles.coordsRow}>
                <View style={[styles.addInputRow, styles.coordInput]}>
                  <Ionicons name="navigate" size={18} color={Colors.primary} />
                  <TextInput
                    style={styles.addInput}
                    placeholder="Latitude"
                    placeholderTextColor={Colors.gray[500]}
                    keyboardType="numeric"
                    value={customLat}
                    onChangeText={setCustomLat}
                  />
                </View>
                <View style={[styles.addInputRow, styles.coordInput]}>
                  <Ionicons name="navigate" size={18} color={Colors.primary} />
                  <TextInput
                    style={styles.addInput}
                    placeholder="Longitude"
                    placeholderTextColor={Colors.gray[500]}
                    keyboardType="numeric"
                    value={customLng}
                    onChangeText={setCustomLng}
                  />
                </View>
              </View>
              <TouchableOpacity style={styles.addButton} onPress={handleAddLocation}>
                <Text style={styles.addButtonText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          )}
        </View> */}

        {/* Actions rapides */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions rapides</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickActionCard, { marginRight: Spacing.md }]}
              onPress={() => router.push('/publish')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: Colors.primary }]}>
                <Ionicons name="add-circle" size={24} color={Colors.white} />
              </View>
              <Text style={styles.quickActionTitle}>Publier un trajet</Text>
              <Text style={styles.quickActionSubtitle}>En 3 clics</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionCard, styles.quickActionCardBlue, { overflow: 'hidden', padding: 0 }]}
              onPress={() => router.push('/search')}
            >
              <LinearGradient
                colors={['#0052D4', '#4364F7', '#6FB1FC']} // Gradient Bleu (Deep Blue to Light Blue)
                style={{ flex: 1, padding: Spacing.md, justifyContent: 'center' }}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Ionicons name="search" size={24} color={Colors.white} />
                </View>
                <Text style={styles.quickActionTitleb}>Chercher un trajet</Text>
                <Text style={styles.quickActionSubtitleb}>Trouvez votre route</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
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

          {!tripsLoading && !tripsError && baseTrips.length === 0 && (
            <View style={styles.tripStateCard}>
              <Ionicons name="car-outline" size={24} color={Colors.gray[500]} />
              <Text style={styles.tripStateText}>Aucun trajet pour le moment.</Text>
              <Text style={styles.tripStateSubText}>Publiez le vôtre ou revenez plus tard.</Text>
            </View>
          )}

          {latestTrips.map((trip, index) => {
            const ratingValue =
              typeof trip.driverRating === 'number'
                ? trip.driverRating
                : Number(trip.driverRating) || 4.9;
            return (
              <Animated.View
                key={trip.id}
                entering={FadeInDown.delay(index * 100)}
                style={styles.tripCard}
              >
                <View style={styles.tripHeader}>
                  <View style={styles.tripDriverInfo}>
                    <View style={styles.avatar} />
                    <View style={styles.tripDriverDetails}>
                      <Text style={styles.driverName}>{trip?.driverName ?? ''}</Text>
                      <View style={styles.driverMeta}>
                        <Ionicons name="star" size={14} color={Colors.secondary} />
                        <Text style={styles.driverRating}>{ratingValue.toFixed(1)}</Text>
                        <View style={styles.dot} />
                        <Text style={styles.vehicleInfo}>{trip?.vehicleInfo ?? ''}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.priceBadge}>
                    <Text style={styles.priceText}>{trip?.price ?? 0} FC</Text>
                  </View>
                </View>

                <View style={styles.tripRoute}>
                  <View style={styles.routeRow}>
                    <Ionicons name="location" size={16} color={Colors.success} />
                    <Text style={styles.routeText}>{trip?.departure?.name ?? ''}</Text>
                    <Text style={styles.routeTime}>
                      {formatTime(trip.departureTime)}
                    </Text>
                  </View>

                  <View style={styles.routeRow}>
                    <Ionicons name="navigate" size={16} color={Colors.primary} />
                    <Text style={styles.routeText}>{trip?.arrival?.name ?? ''}</Text>
                    <Text style={styles.routeTime}>
                      {formatTime(trip.arrivalTime)}
                    </Text>
                  </View>
                </View>

                <View style={styles.tripFooter}>
                  <View style={styles.tripFooterLeft}>
                    <Ionicons name="people" size={16} color={Colors.gray[600]} />
                    <Text style={styles.seatsText}>
                      {trip.availableSeats} places disponibles
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.reserveButton}
                    onPress={() => router.push(`/trip/${trip.id}`)}
                  >
                    <Text style={styles.reserveButtonText}>Réserver</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            );
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
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomLeftRadius: BorderRadius.xxl,
    borderBottomRightRadius: BorderRadius.xxl,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  headerTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  expandButton: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {
    color: Colors.white,
    opacity: 0.8,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.xs,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
  },
  notificationButton: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs / 2,
  },
  notificationBadgeText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  searchCardContainer: {
    marginTop: Spacing.md,
    overflow: 'hidden',
  },
  searchCard: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowLg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  searchDivider: {
    height: 1,
    backgroundColor: Colors.gray[100],
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  searchButton: {
    backgroundColor: Colors.primary,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: 120, // Increased to ensure content is not hidden behind the tab bar
  },
  section: {
    marginBottom: Spacing.xl,
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
    color: Colors.gray[800],
    marginBottom: Spacing.md,
  },
  seeAllText: {
    color: Colors.primary,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
  },
  popularLocations: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.md,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
    ...CommonStyles.shadowSm,
  },
  locationChipText: {
    marginLeft: Spacing.xs,
    fontSize: FontSizes.sm,
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    marginBottom: Spacing.sm,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  locationAddress: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  savedSection: {
    marginTop: Spacing.md,
  },
  savedTitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginBottom: Spacing.sm,
  },
  addLocationCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    gap: Spacing.sm,
  },
  addLocationTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.sm,
  },
  addInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  addInput: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    paddingVertical: Spacing.sm,
  },
  coordsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  coordInput: {
    flex: 1,
  },
  addButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  addButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  quickToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[50],
  },
  quickToggleLabel: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  quickToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  quickToggleAction: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  buttonSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  buttonSecondaryText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  quickActions: {
    flexDirection: 'row',
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.2)',
  },
  quickActionCardBlue: {
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    borderColor: 'rgba(52, 152, 219, 0.2)',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  quickActionTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
    marginBottom: Spacing.xs,
  },
  quickActionTitleb: {
    fontWeight: FontWeights.bold,
    color: Colors.white,
    fontSize: FontSizes.base,
    marginBottom: Spacing.xs,
  },
  quickActionSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
  quickActionSubtitleb: {
    fontSize: FontSizes.xs,
    color: Colors.white,
    marginTop: Spacing.xs,
  },
  tripCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  advancedCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  advancedTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.md,
  },
  advancedLocations: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  advancedLocationButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  advancedLocationIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  advancedLocationContent: {
    flex: 1,
  },
  advancedLocationLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
  },
  advancedLocationTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  advancedLocationSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  advancedLocationCoords: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  advancedInputRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  advancedInputGroup: {
    flex: 1,
  },
  advancedInputLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  advancedInput: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    backgroundColor: Colors.white,
  },
  advancedButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripStateCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[100],
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tripStateText: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  tripStateSubText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
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
  priceBadge: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  priceText: {
    color: Colors.success,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
  },
  tripRoute: {
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
  routeTime: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
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
  seatsText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginLeft: Spacing.xs,
  },
  reserveButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  reserveButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.sm,
  },
});
