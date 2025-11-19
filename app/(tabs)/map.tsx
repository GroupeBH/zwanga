import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useUserLocation } from '@/hooks/useUserLocation';
import { TripSearchParams, useLazyGetTripsQuery } from '@/store/api/tripApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectLocationRadius,
  selectTripSearchMode,
  selectTripSearchQuery,
  selectTripsMatchingMapFilters,
  selectUserCoordinates,
  selectVehicleFilter,
} from '@/store/selectors';
import { setRadiusKm, setSearchMode, setSearchQuery, setVehicleFilter, TripSearchMode } from '@/store/slices/locationSlice';
import { setTrips } from '@/store/slices/tripsSlice';
import { formatTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

type LatLng = { latitude: number; longitude: number };

const toRadians = (value: number) => (value * Math.PI) / 180;

const distanceInKm = (a: LatLng, b: LatLng) => {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return 6371 * c;
};

export default function MapScreen() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { permissionStatus, requestPermission } = useUserLocation({ autoRequest: true });
  const [triggerTripSearch, { isFetching: isApplyingSearch }] = useLazyGetTripsQuery();
  const userCoords = useAppSelector(selectUserCoordinates);
  const trips = useAppSelector(selectTripsMatchingMapFilters);
  const radiusKm = useAppSelector(selectLocationRadius);
  const vehicleFilter = useAppSelector(selectVehicleFilter);
  const searchMode = useAppSelector(selectTripSearchMode);
  const activeSearchQuery = useAppSelector(selectTripSearchQuery);
  const [search, setSearch] = useState(activeSearchQuery);

  useEffect(() => {
    setSearch(activeSearchQuery);
  }, [activeSearchQuery]);

  const initialRegion = useMemo(() => {
    if (userCoords) {
      return {
        latitude: userCoords.latitude,
        longitude: userCoords.longitude,
        latitudeDelta: 0.2,
        longitudeDelta: 0.2,
      };
    }

    if (trips.length > 0 && trips[0].departure?.lat && trips[0].departure?.lng) {
      return {
        latitude: trips[0].departure.lat,
        longitude: trips[0].departure.lng,
        latitudeDelta: 1,
        longitudeDelta: 1,
      };
    }

    return {
      latitude: -4.441931,
      longitude: 15.266293,
      latitudeDelta: 2,
      longitudeDelta: 2,
    };
  }, [userCoords, trips]);

  const renderPolyline = (tripId: string, color: string, coordinates: { latitude: number; longitude: number }[]) =>
    coordinates.length >= 2 ? (
      <Polyline
        key={`${tripId}-polyline`}
        coordinates={coordinates}
        strokeWidth={3}
        strokeColor={color}
      />
    ) : null;

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const buildSearchParams = (query: string): TripSearchParams => {
    const trimmed = query.trim();
    if (!trimmed) {
      return {};
    }

    if (searchMode === 'departure') {
      return { departureLocation: trimmed };
    }

    if (searchMode === 'arrival') {
      return { arrivalLocation: trimmed };
    }

    // Mode "tous" : on reste large côté backend et on laisse la recherche locale
    return { departureLocation: trimmed };
  };

  const applySearchQuery = async () => {
    const trimmedQuery = (search ?? '').trim();
    dispatch(setSearchQuery(trimmedQuery));

    try {
      const params = buildSearchParams(trimmedQuery);
      const results = await triggerTripSearch(params).unwrap();
      dispatch(setTrips(results));
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? "Impossible d'appliquer le filtre pour le moment.";
      Alert.alert('Erreur de recherche', Array.isArray(message) ? message.join('\n') : message);
    }
  };

  const clearSearchQuery = async () => {
    setSearch('');
    dispatch(setSearchQuery(''));
    try {
      const params = buildSearchParams('');
      const results = await triggerTripSearch(params).unwrap();
      dispatch(setTrips(results));
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? "Impossible de réinitialiser la recherche.";
      Alert.alert('Erreur', Array.isArray(message) ? message.join('\n') : message);
    }
  };

  const placeholder = useMemo(() => {
    if (searchMode === 'departure') {
      return 'Rechercher un point de départ';
    }
    if (searchMode === 'arrival') {
      return 'Rechercher un point d’arrivée';
    }
    return 'Rechercher un départ ou une arrivée';
  }, [searchMode]);

  const searchModes: { key: TripSearchMode; label: string }[] = useMemo(
    () => [
      { key: 'all', label: 'Tous' },
      { key: 'departure', label: 'Départ' },
      { key: 'arrival', label: 'Arrivée' },
    ],
    [],
  );

  const isApplyDisabled = useMemo(() => {
    return ((search ?? '').trim() === (activeSearchQuery ?? '').trim()) || isApplyingSearch;
  }, [activeSearchQuery, isApplyingSearch, search]);

  return (
    <SafeAreaView style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsCompass={false}
        showsUserLocation={!!userCoords}
        initialRegion={initialRegion}
      >
        {trips.map((trip) => {
          const departureCoords =
            trip.departure?.lat && trip.departure?.lng
              ? { latitude: trip.departure.lat, longitude: trip.departure.lng }
              : null;
          const arrivalCoords =
            trip.arrival?.lat && trip.arrival?.lng
              ? { latitude: trip.arrival.lat, longitude: trip.arrival.lng }
              : null;

          const userDistance =
            userCoords && departureCoords
              ? distanceInKm(
                  { latitude: departureCoords.latitude, longitude: departureCoords.longitude },
                  { latitude: userCoords.latitude, longitude: userCoords.longitude },
                )
              : null;

          const driverInitials = trip.driverName
            ? trip.driverName
                .split(' ')
                .map((word) => word[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
            : 'DR';

          return (
            <React.Fragment key={trip.id}>
              {departureCoords && (
                <Marker
                  coordinate={departureCoords}
                  anchor={{ x: 0.5, y: 1 }}
                  onCalloutPress={() => router.push(`/trip/${trip.id}`)}
                >
                  <View style={styles.driverMarkerWrapper}>
                    <View style={styles.driverMarker}>
                      {trip.driverAvatar ? (
                        <Image source={{ uri: trip.driverAvatar }} style={styles.driverMarkerImage} />
                      ) : (
                        <Text style={styles.driverMarkerInitials}>{driverInitials}</Text>
                      )}
                    </View>
                    <View style={styles.driverMarkerHalo} />
                  </View>
                  <Callout tooltip onPress={() => router.push(`/trip/${trip.id}`)}>
                    <View style={styles.calloutCard}>
                      <Text style={styles.calloutTitle}>{trip.driverName}</Text>
                      <Text style={styles.calloutSubtitle}>
                        {trip.departure.name} ➜ {trip.arrival.name}
                      </Text>
                      {userDistance !== null && (
                        <Text style={styles.calloutDistance}>
                          À{' '}
                          {userDistance < 1
                            ? `${Math.round(userDistance * 1000)} m`
                            : `${userDistance.toFixed(1)} km`}{' '}
                          du départ
                        </Text>
                      )}
                      <View style={styles.calloutDivider} />
                      <View style={styles.calloutFooter}>
                        <Text style={styles.calloutSchedule}>
                          {formatTime(trip.departureTime)} • {trip.availableSeats} place(s)
                        </Text>
                        <View style={styles.calloutCta}>
                          <Text style={styles.calloutCtaText}>Voir trajet</Text>
                          <Ionicons name="chevron-forward" size={14} color={Colors.white} />
                        </View>
                      </View>
                    </View>
                  </Callout>
                </Marker>
              )}
              {arrivalCoords && (
                <Marker
                  coordinate={arrivalCoords}
                  title={`Arrivée: ${trip.arrival.name}`}
                  pinColor={Colors.secondary}
                />
              )}
              {departureCoords &&
                arrivalCoords &&
                renderPolyline(trip.id, Colors.primary, [departureCoords, arrivalCoords])}
            </React.Fragment>
          );
        })}
      </MapView>

      <View pointerEvents="box-none" style={styles.topOverlay}>
        <View style={styles.searchCard}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={Colors.gray[500]} />
            <TextInput
              style={styles.searchInput}
              placeholder={placeholder}
              placeholderTextColor={Colors.gray[500]}
              value={search}
              onChangeText={handleSearchChange}
              returnKeyType="search"
              onSubmitEditing={applySearchQuery}
            />
          </View>
          <View style={styles.searchActions}>
            <TouchableOpacity
              style={[styles.applyButton, isApplyDisabled && styles.applyButtonDisabled]}
              onPress={applySearchQuery}
              disabled={isApplyDisabled}
            >
              {isApplyingSearch ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="funnel" size={16} color={isApplyDisabled ? Colors.gray[400] : Colors.white} />
                  <Text style={[styles.applyButtonText, isApplyDisabled && styles.applyButtonTextDisabled]}>
                    Appliquer
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {Boolean(activeSearchQuery) && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearSearchQuery}
                disabled={isApplyingSearch}
              >
                <Ionicons name="close-circle" size={16} color={Colors.primary} />
                <Text style={styles.clearButtonText}>Effacer</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.searchModeRow}>
            {searchModes.map((mode) => (
              <TouchableOpacity
                key={mode.key}
                style={[
                  styles.searchModeChip,
                  searchMode === mode.key && styles.searchModeChipActive,
                ]}
                onPress={() => dispatch(setSearchMode(mode.key))}
              >
                <Text
                  style={[
                    styles.searchModeChipText,
                    searchMode === mode.key && styles.searchModeChipTextActive,
                  ]}
                >
                  {mode.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.filtersRow}>
            {['all', 'car', 'moto', 'tricycle'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterChip,
                  vehicleFilter === type && styles.filterChipActive,
                ]}
                onPress={() => dispatch(setVehicleFilter(type as any))}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    vehicleFilter === type && styles.filterChipTextActive,
                  ]}
                >
                  {type === 'all' ? 'Tous' : type.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.radiusCard}>
          <Text style={styles.radiusLabel}>Rayon de recherche: {radiusKm} km</Text>
          <View style={styles.radiusButtons}>
            {[5, 10, 20, 50].map((value) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.radiusButton,
                  radiusKm === value && styles.radiusButtonActive,
                ]}
                onPress={() => dispatch(setRadiusKm(value))}
              >
                <Text
                  style={[
                    styles.radiusButtonText,
                    radiusKm === value && styles.radiusButtonTextActive,
                  ]}
                >
                  {value} km
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.bottomSheet}>
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>Trajets à proximité</Text>
            <Text style={styles.sheetSubtitle}>{trips.length} itinéraire(s) trouvé(s)</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={requestPermission}>
            <Ionicons name="locate" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          {trips.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="map-outline" size={36} color={Colors.gray[400]} />
              <Text style={styles.emptyTitle}>Aucun trajet autour de vous</Text>
              <Text style={styles.emptyText}>
                Ajustez le rayon ou la recherche pour découvrir davantage d’options.
              </Text>
            </View>
          ) : (
            trips.map((trip) => (
              <TouchableOpacity
                key={trip.id}
                style={styles.tripCard}
                onPress={() => router.push(`/trip/${trip.id}`)}
              >
                <View style={styles.tripCardHeader}>
                  <View>
                    <Text style={styles.tripDriverName}>{trip.driverName}</Text>
                    <Text style={styles.tripVehicle}>{trip.vehicleInfo}</Text>
                  </View>
                  <Text style={styles.tripPrice}>{trip.price} FC</Text>
                </View>
                <View style={styles.tripRouteRow}>
                  <Ionicons name="location" size={16} color={Colors.success} />
                  <Text style={styles.tripRouteText}>{trip.departure.name}</Text>
                  <Text style={styles.tripTime}>{formatTime(trip.departureTime)}</Text>
                </View>
                <View style={styles.tripRouteRow}>
                  <Ionicons name="navigate" size={16} color={Colors.primary} />
                  <Text style={styles.tripRouteText}>{trip.arrival.name}</Text>
                  <Text style={styles.tripTime}>{formatTime(trip.arrivalTime)}</Text>
                </View>
                <View style={styles.tripFooter}>
                  <View style={styles.tripFooterLeft}>
                    <Ionicons name="people" size={15} color={Colors.gray[600]} />
                    <Text style={styles.tripSeats}>{trip.availableSeats} places</Text>
                  </View>
                  <View style={styles.tripFooterRight}>
                    <Text style={styles.tripDetailsText}>Voir détails</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>

      {permissionStatus === 'denied' && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            Vous devez autoriser la géolocalisation pour afficher les trajets proches.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Autoriser</Text>
          </TouchableOpacity>
        </View>
      )}

      {!userCoords && permissionStatus === 'granted' && (
        <View style={styles.loadingIndicator}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>Localisation en cours…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  topOverlay: {
    position: 'absolute',
    top: Platform.select({ ios: 20, android: 10 }),
    left: Spacing.lg,
    right: Spacing.lg,
    gap: Spacing.md,
  },
  searchCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: Spacing.lg,
    shadowColor: Colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
    gap: Spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    paddingVertical: Spacing.sm,
  },
  searchActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  applyButtonDisabled: {
    backgroundColor: Colors.gray[200],
  },
  applyButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  applyButtonTextDisabled: {
    color: Colors.gray[500],
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  clearButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  searchModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  searchModeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 999,
    backgroundColor: Colors.gray[100],
  },
  searchModeChipActive: {
    backgroundColor: Colors.gray[900],
  },
  searchModeChipText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  searchModeChipTextActive: {
    color: Colors.white,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.gray[300],
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  filterChipTextActive: {
    color: Colors.white,
  },
  radiusCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: Spacing.lg,
    shadowColor: Colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    gap: Spacing.sm,
  },
  radiusLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  radiusButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  radiusButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  radiusButtonActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  radiusButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  radiusButtonTextActive: {
    color: Colors.black,
    fontWeight: FontWeights.bold,
  },
  driverMarkerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverMarker: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
    overflow: 'hidden',
  },
  driverMarkerImage: {
    width: '100%',
    height: '100%',
  },
  driverMarkerInitials: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  driverMarkerHalo: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '33',
  },
  calloutCard: {
    width: 220,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    shadowColor: Colors.black,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  calloutTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
  },
  calloutSubtitle: {
    color: Colors.gray[600],
    marginTop: 2,
    fontSize: FontSizes.sm,
  },
  calloutDistance: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  calloutDivider: {
    height: 1,
    backgroundColor: Colors.gray[200],
    marginVertical: Spacing.sm,
  },
  calloutFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  calloutSchedule: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    flex: 1,
  },
  calloutCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  calloutCtaText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.lg,
    paddingBottom: Platform.select({ ios: Spacing.xl + 20, android: Spacing.xl }),
    paddingHorizontal: Spacing.lg,
    shadowColor: Colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 15,
    maxHeight: '45%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  sheetSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 2,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  tripCard: {
    backgroundColor: Colors.gray[50],
    borderRadius: 18,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    gap: Spacing.sm,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripDriverName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  tripVehicle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 2,
  },
  tripPrice: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  tripRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tripRouteText: {
    flex: 1,
    color: Colors.gray[700],
    fontSize: FontSizes.base,
  },
  tripTime: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  tripFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tripSeats: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  tripFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tripDetailsText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  emptyText: {
    color: Colors.gray[600],
    textAlign: 'center',
    fontSize: FontSizes.sm,
  },
  permissionBanner: {
    position: 'absolute',
    bottom: 20,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.danger,
    borderRadius: 16,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  permissionText: {
    color: Colors.white,
    fontSize: FontSizes.base,
  },
  permissionButton: {
    backgroundColor: Colors.white,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
    alignItems: 'center',
  },
  permissionButtonText: {
    color: Colors.danger,
    fontWeight: FontWeights.bold,
  },
  loadingIndicator: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    shadowColor: Colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  loadingText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
});

