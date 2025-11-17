import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '@/constants/styles';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectLocationRadius,
  selectTripsMatchingMapFilters,
  selectUserCoordinates,
  selectVehicleFilter,
} from '@/store/selectors';
import { setRadiusKm, setSearchQuery, setVehicleFilter } from '@/store/slices/locationSlice';
import { formatTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import React, { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function MapScreen() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { permissionStatus, requestPermission } = useUserLocation({ autoRequest: true });
  const userCoords = useAppSelector(selectUserCoordinates);
  const trips = useAppSelector(selectTripsMatchingMapFilters);
  const radiusKm = useAppSelector(selectLocationRadius);
  const vehicleFilter = useAppSelector(selectVehicleFilter);
  const [search, setSearch] = useState('');

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
    dispatch(setSearchQuery(value));
  };

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

          return (
            <React.Fragment key={trip.id}>
              {departureCoords && (
                <Marker
                  coordinate={departureCoords}
                  title={`Départ: ${trip.departure.name}`}
                  description={`Vers ${trip.arrival.name}`}
                  pinColor={Colors.primary}
                />
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
              placeholder="Rechercher un départ ou une arrivée"
              placeholderTextColor={Colors.gray[500]}
              value={search}
              onChangeText={handleSearchChange}
            />
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
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
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

