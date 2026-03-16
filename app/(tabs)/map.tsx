import { TutorialOverlay } from '@/components/TutorialOverlay';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import { useUserLocation } from '@/hooks/useUserLocation';
import { TripSearchParams, useLazyGetTripsQuery, useSearchTripsByCoordinatesMutation } from '@/store/api/tripApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectAvailableTrips,
  selectTripSearchQuery,
  selectUserCoordinates,
} from '@/store/selectors';
import { setSearchQuery } from '@/store/slices/locationSlice';
import { setTrips } from '@/store/slices/tripsSlice';
import { formatTime, formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { searchGoogleMapsPlaces, getGoogleMapsPlaceDetails, type GoogleMapsSearchSuggestion } from '@/utils/googleMapsPlaces';

type LatLng = { latitude: number; longitude: number };

const DEFAULT_REGION: Region = {
  latitude: -4.441931,
  longitude: 15.266293,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};
const DEFAULT_SEARCH_RADIUS_KM = 20;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toValidLatLng = (latitude: unknown, longitude: unknown): LatLng | null => {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { latitude: lat, longitude: lng };
};

const isValidRegion = (region: Region | null | undefined): region is Region => {
  if (!region) return false;
  return (
    isFiniteNumber(region.latitude) &&
    isFiniteNumber(region.longitude) &&
    isFiniteNumber(region.latitudeDelta) &&
    isFiniteNumber(region.longitudeDelta) &&
    region.latitude >= -90 &&
    region.latitude <= 90 &&
    region.longitude >= -180 &&
    region.longitude <= 180 &&
    region.latitudeDelta > 0 &&
    region.longitudeDelta > 0
  );
};

const buildRegionFromPoint = (
  point: LatLng,
  latitudeDelta: number = 0.1,
  longitudeDelta: number = 0.1,
): Region => ({
  latitude: point.latitude,
  longitude: point.longitude,
  latitudeDelta,
  longitudeDelta,
});


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
  const { showDialog } = useDialog();
  const { permissionStatus, requestPermission } = useUserLocation({ autoRequest: true });
  const [triggerTripSearch, { isFetching: isApplyingSearch }] = useLazyGetTripsQuery();
  const [searchByCoordinates, { isLoading: isSearchingArea }] = useSearchTripsByCoordinatesMutation();
  const userCoords = useAppSelector(selectUserCoordinates);
  const trips = useAppSelector(selectAvailableTrips);
  const activeSearchQuery = useAppSelector(selectTripSearchQuery);
  const [search, setSearch] = useState(activeSearchQuery);
  const { shouldShow: shouldShowMapGuide, complete: completeMapGuide } =
    useTutorialGuide('map_screen');
  const [mapGuideVisible, setMapGuideVisible] = useState(false);
  const mapRef = useRef<MapView>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const latestRegionRef = useRef<Region | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isMapMoving, setIsMapMoving] = useState(false);
  const [googleMapsSuggestions, setGoogleMapsSuggestions] = useState<GoogleMapsSearchSuggestion[]>([]);
  const [googleMapsLoading, setGoogleMapsLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const safeUserCoords = useMemo(
    () => toValidLatLng(userCoords?.latitude, userCoords?.longitude),
    [userCoords],
  );
  
  // Ajuster la carte automatiquement quand des trajets sont trouvés après une recherche
  useEffect(() => {
    // Ne s'ajuster que si on a une recherche active (pas au chargement initial)
    if (activeSearchQuery && trips.length > 0 && mapRef.current) {
      // Petit délai pour laisser le temps aux marqueurs de se charger
      const timeoutId = setTimeout(() => {
        fitMapToTrips(trips);
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [trips, activeSearchQuery, fitMapToTrips]);

  const toggleMapExpansion = () => {
    LayoutAnimation.configureNext({
      duration: 300,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
    });
    setIsMapExpanded((previous) => {
      const next = !previous;
      if (next && trips.length > 0) {
        setTimeout(() => fitMapToTrips(trips), 250);
      }
      return next;
    });
  };

  const centerOnUser = async () => {
    if (permissionStatus !== 'granted') {
      await requestPermission();
      return;
    }

    if (!safeUserCoords) {
      showDialog({
        variant: 'warning',
        title: 'Position indisponible',
        message: 'Nous recherchons encore votre position actuelle. Réessayez dans un instant.',
      });
      return;
    }

    if (!mapRef.current || !isMapReady) {
      return;
    }

    mapRef.current.animateToRegion(buildRegionFromPoint(safeUserCoords, 0.01, 0.01), 1000);
  };

  // Fonction pour ajuster la carte pour afficher tous les trajets
  const fitMapToTrips = useCallback((tripsToFit: typeof trips) => {
    if (!mapRef.current || !isMapReady || tripsToFit.length === 0) {
      return;
    }

    // Collecter toutes les coordonnées (départ et arrivée)
    const coordinates: LatLng[] = [];
    
    tripsToFit.forEach((trip) => {
      const destination = toValidLatLng(trip.arrival?.lat, trip.arrival?.lng);
      if (destination) {
        coordinates.push(destination);
      }
    });

    if (coordinates.length === 0) {
      return;
    }

    // Calculer les bounds
    const latitudes = coordinates.map((coord) => coord.latitude);
    const longitudes = coordinates.map((coord) => coord.longitude);
    
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) {
      return;
    }

    // Calculer le centre et les deltas avec padding
    const latDelta = maxLat - minLat;
    const lngDelta = maxLng - minLng;
    
    // Ajouter un padding de 20% autour des bounds
    const padding = 0.2;
    const paddedLatDelta = latDelta * (1 + padding * 2) || 0.01;
    const paddedLngDelta = lngDelta * (1 + padding * 2) || 0.01;

    // S'assurer que les deltas ne sont pas trop petits
    const finalLatDelta = Math.max(paddedLatDelta, 0.01);
    const finalLngDelta = Math.max(paddedLngDelta, 0.01);

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const nextRegion: Region = {
      latitude: centerLat,
      longitude: centerLng,
      latitudeDelta: finalLatDelta,
      longitudeDelta: finalLngDelta,
    };
    if (!isValidRegion(nextRegion)) {
      return;
    }

    // Animer vers la nouvelle région
    mapRef.current.animateToRegion(nextRegion, 1000);
  }, [isMapReady]);

  useEffect(() => {
    setSearch(activeSearchQuery);
  }, [activeSearchQuery]);

  useEffect(() => {
    if (shouldShowMapGuide) {
      setMapGuideVisible(true);
    }
  }, [shouldShowMapGuide]);

  // Initialiser mapCenter avec initialRegion
  useEffect(() => {
    if (isValidRegion(initialRegion) && !mapCenter) {
      setMapCenter([initialRegion.longitude, initialRegion.latitude]);
      setMapRegion(initialRegion);
      latestRegionRef.current = initialRegion;
    }
  }, [initialRegion, mapCenter]);

  const dismissMapGuide = () => {
    setMapGuideVisible(false);
    completeMapGuide();
  };

  const initialRegion = useMemo(() => {
    if (safeUserCoords) {
      return buildRegionFromPoint(safeUserCoords, 0.01, 0.01);
    }

    const firstTripDestination = trips
      .map((trip) => toValidLatLng(trip.arrival?.lat, trip.arrival?.lng))
      .find((coords): coords is LatLng => Boolean(coords));

    if (firstTripDestination) {
      return buildRegionFromPoint(firstTripDestination, 0.1, 0.1);
    }

    return DEFAULT_REGION;
  }, [safeUserCoords, trips]);

  // Recherche avec suggestions Mapbox en temps réel
  const searchMapboxSuggestions = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setGoogleMapsSuggestions([]);
      return;
    }

    try {
      setGoogleMapsLoading(true);
      // Valider les coordonnées de proximité avant de les utiliser
      let proximity: { longitude: number; latitude: number } | undefined = undefined;
      
      if (safeUserCoords) {
        proximity = { longitude: safeUserCoords.longitude, latitude: safeUserCoords.latitude };
      } else {
        const validMapCenter =
          mapCenter && mapCenter.length === 2
            ? toValidLatLng(mapCenter[1], mapCenter[0])
            : null;
        if (validMapCenter) {
          proximity = {
            longitude: validMapCenter.longitude,
            latitude: validMapCenter.latitude,
          };
        }
      }
      
      const suggestions = await searchGoogleMapsPlaces(query, proximity, 5);
      setGoogleMapsSuggestions(suggestions);
    } catch {
      // Les erreurs sont déjà gérées dans searchMapboxPlaces
      setGoogleMapsSuggestions([]);
    } finally {
      setGoogleMapsLoading(false);
    }
  }, [safeUserCoords, mapCenter]);

  // Debounce pour les suggestions Mapbox
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (search && search.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        searchMapboxSuggestions(search);
      }, 300);
    } else {
      setGoogleMapsSuggestions([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search, searchMapboxSuggestions]);

  const handleSearchChange = (value: string) => {
    try {
      setSearch(value);
    } catch (error) {
      console.error('Error updating search:', error);
    }
  };

  const handleGoogleMapsSuggestionPress = async (suggestion: GoogleMapsSearchSuggestion) => {
    try {
      setGoogleMapsLoading(true);
      
      // Récupérer les détails complets du lieu pour obtenir l'adresse complète
      const placeDetails = await getGoogleMapsPlaceDetails(suggestion.id);
      
      // Utiliser l'adresse complète si disponible, sinon utiliser le nom
      const addressToUse = placeDetails?.fullAddress || suggestion.fullAddress || suggestion.name;
      const displayName = placeDetails?.name || suggestion.name;
      
      setSearch(displayName);
      setGoogleMapsSuggestions([]);
      
      // Appliquer la recherche avec l'adresse complète pour une meilleure précision
      dispatch(setSearchQuery(addressToUse));
      const params = buildSearchParams(addressToUse);
      triggerTripSearch(params).then((result) => {
        if (result.data) {
          dispatch(setTrips(result.data));
          // Ajuster la carte pour afficher tous les trajets trouvés
          if (result.data.length > 0) {
            setTimeout(() => {
              fitMapToTrips(result.data);
            }, 300);
          }
        }
      }).catch((error: any) => {
        const message =
          error?.data?.message ?? error?.error ?? "Impossible d'appliquer la recherche pour le moment.";
        showDialog({
          variant: 'danger',
          title: 'Erreur de recherche',
          message: Array.isArray(message) ? message.join('\n') : message,
        });
      });
    } catch (error) {
      console.warn('Failed to retrieve place details, using suggestion data:', error);
      // Fallback: utiliser les données de la suggestion directement
      const addressToUse = suggestion.fullAddress || suggestion.name;
      setSearch(suggestion.name);
      setGoogleMapsSuggestions([]);
      dispatch(setSearchQuery(addressToUse));
      const params = buildSearchParams(addressToUse);
      triggerTripSearch(params).then((result) => {
        if (result.data) {
          dispatch(setTrips(result.data));
          // Ajuster la carte pour afficher tous les trajets trouvés
          if (result.data.length > 0) {
            setTimeout(() => {
              fitMapToTrips(result.data);
            }, 300);
          }
        }
      }).catch((error: any) => {
        const message =
          error?.data?.message ?? error?.error ?? "Impossible d'appliquer la recherche pour le moment.";
        showDialog({
          variant: 'danger',
          title: 'Erreur de recherche',
          message: Array.isArray(message) ? message.join('\n') : message,
        });
      });
    } finally {
      setGoogleMapsLoading(false);
    }
  };

  const buildSearchParams = useCallback((query: string): TripSearchParams => {
    const trimmed = query.trim();
    if (!trimmed) {
      return {};
    }

    return { keywords: trimmed };
  }, []);

  const applySearchQuery = async () => {
    const trimmedQuery = (search ?? '').trim();
    dispatch(setSearchQuery(trimmedQuery));

    try {
      const params = buildSearchParams(trimmedQuery);
      const results = await triggerTripSearch(params).unwrap();
      dispatch(setTrips(results));
      
      // Ajuster la carte pour afficher tous les trajets trouvés
      if (results.length > 0) {
        setTimeout(() => {
          fitMapToTrips(results);
        }, 300);
      }
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? "Impossible d'appliquer la recherche pour le moment.";
      showDialog({
        variant: 'danger',
        title: 'Erreur de recherche',
        message: Array.isArray(message) ? message.join('\n') : message,
      });
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
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
      });
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = buildSearchParams(activeSearchQuery || '');
      const results = await triggerTripSearch(params).unwrap();
      dispatch(setTrips(results));
      if (results.length > 0) {
        setTimeout(() => {
          fitMapToTrips(results);
        }, 300);
      }
    } catch (error: any) {
      console.warn('Error refreshing trips:', error);
    } finally {
      setRefreshing(false);
    }
  }, [activeSearchQuery, triggerTripSearch, dispatch, fitMapToTrips, buildSearchParams]);

  const placeholder = 'Rechercher un départ ou une arrivée';
  const isApplyDisabled = useMemo(() => {
    return ((search ?? '').trim() === (activeSearchQuery ?? '').trim()) || isApplyingSearch;
  }, [activeSearchQuery, isApplyingSearch, search]);
  return (
    <SafeAreaView style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={permissionStatus === 'granted'}
        showsCompass={false}
        onMapReady={() => setIsMapReady(true)}
        onRegionChange={(region) => {
          if (!isValidRegion(region)) {
            return;
          }
          latestRegionRef.current = region;
          setIsMapMoving((previous) => (previous ? previous : true));
        }}
        onRegionChangeComplete={(region) => {
          if (isValidRegion(region)) {
            latestRegionRef.current = region;
            setMapRegion(region);
            setMapCenter([region.longitude, region.latitude]);
          }
          setIsMapMoving(false);
        }}
      >

        {trips.map((trip) => {
          const destinationCoords = toValidLatLng(trip.arrival?.lat, trip.arrival?.lng);
          if (!destinationCoords) {
            return null;
          }

          const userDistance =
            safeUserCoords && destinationCoords
              ? distanceInKm(destinationCoords, safeUserCoords)
              : null;
          const showDistanceBadge = userDistance !== null && userDistance < 5;
          const distanceLabel =
            showDistanceBadge && userDistance !== null
              ? userDistance < 1
                ? `${Math.round(userDistance * 1000)}m`
                : `${userDistance.toFixed(1)}km`
              : ' ';

          const driverInitials = trip.driverName
            ? trip.driverName
              .split(' ')
              .map((word) => word[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()
            : 'DR';

          return (
            <Marker
              key={`destination-${trip.id}`}
              coordinate={destinationCoords}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={Platform.OS === 'ios'}
              onPress={() => router.push(`/trip/${trip.id}`)}
            >
              <View style={styles.driverMarkerWrapper}>
                <View
                  style={[
                    styles.distanceBadge,
                    !showDistanceBadge && styles.distanceBadgeHidden,
                  ]}
                >
                  <Text style={styles.distanceBadgeText}>{distanceLabel}</Text>
                </View>
                <View style={styles.driverMarker}>
                  {trip.driverAvatar ? (
                    <Image
                      source={{ uri: trip.driverAvatar }}
                      style={styles.driverMarkerImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.driverMarkerInitials}>{driverInitials}</Text>
                  )}
                </View>
                <View style={styles.driverMarkerHalo} />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Center Pin for Drag-to-Search */}
      {isMapExpanded && (
        <View style={styles.centerPinContainer} pointerEvents="none">
          <View style={styles.centerPinHalo} />
          <Ionicons name="location" size={36} color={Colors.primary} style={styles.centerPinIcon} />
          <View style={styles.centerPinShadow} />
        </View>
      )}

      {!isMapExpanded && (
        <View pointerEvents="box-none" style={styles.topOverlay}>
          <View style={styles.searchCard}>
            <Text style={styles.searchCardTitle}>Trouver un trajet</Text>
            <Text style={styles.searchCardHint}>
              Saisissez un lieu, ou passez en plein écran pour rechercher autour du centre de la carte.
            </Text>
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
              {googleMapsLoading && (
                <ActivityIndicator size="small" color={Colors.primary} />
              )}
            </View>

            {/* Suggestions Mapbox */}
            {googleMapsSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                <FlatList
                  data={googleMapsSuggestions}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.suggestionRow}
                      onPress={() => handleGoogleMapsSuggestionPress(item)}
                    >
                      <Ionicons name="location" size={16} color={Colors.primary} />
                      <View style={styles.suggestionContent}>
                        <Text style={styles.suggestionTitle}>{item.name}</Text>
                        {item.fullAddress && (
                          <Text style={styles.suggestionSubtitle} numberOfLines={1}>
                            {item.fullAddress}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  )}
                  scrollEnabled={false}
                />
              </View>
            )}
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
                    <Ionicons name="search" size={16} color={isApplyDisabled ? Colors.gray[400] : Colors.white} />
                    <Text style={[styles.applyButtonText, isApplyDisabled && styles.applyButtonTextDisabled]}>
                      Rechercher
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
            {/* <View style={styles.searchModeRow}>
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
            </View> */}
            {/* <View style={styles.filtersRow}>
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
            </View> */}
          </View>

          <View style={styles.mapGuideCard}>
            <Ionicons name="information-circle" size={18} color={Colors.primary} />
            <Text style={styles.mapGuideText}>
              Appuyez sur « Agrandir la carte », déplacez la carte puis lancez « Rechercher ici ». Touchez un marqueur conducteur pour ouvrir le détail du trajet.
            </Text>
          </View>
        </View>
      )}

      {/* Map Controls: Expand & Location */}
      <View style={[styles.mapControls, isMapExpanded && styles.mapControlsExpanded]}>
        <TouchableOpacity
          style={[styles.expandButton, isMapExpanded && styles.expandButtonExpanded]}
          onPress={toggleMapExpansion}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isMapExpanded ? "contract" : "expand"}
            size={20}
            color={isMapExpanded ? Colors.white : Colors.gray[800]}
          />
          <Text style={[styles.expandButtonText, isMapExpanded && styles.expandButtonTextExpanded]}>
            {isMapExpanded ? 'Reduire la carte' : 'Agrandir la carte'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.locationButton}
          onPress={centerOnUser}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={18} color={Colors.primary} />
          <Text style={styles.locationButtonText}>Voir ma position</Text>
        </TouchableOpacity>
      </View>

      {/* "Search Here" Button */}
      {isMapExpanded && !isMapMoving && (
        <TouchableOpacity
          style={styles.searchHereButton}
          activeOpacity={0.8}
          onPress={async () => {
            const regionToSearch = latestRegionRef.current ?? mapRegion ?? initialRegion;
            if (!isValidRegion(regionToSearch)) {
              showDialog({
                variant: 'warning',
                title: 'Carte non prête',
                message: 'Attendez un instant puis réessayez la recherche dans cette zone.',
              });
              return;
            }

            try {
              const departureCoordinates: [number, number] = [
                regionToSearch.longitude,
                regionToSearch.latitude,
              ];

              const results = await searchByCoordinates({
                departureCoordinates,
                departureRadiusKm: DEFAULT_SEARCH_RADIUS_KM,
              }).unwrap();
              dispatch(setTrips(results));

              if (results.length > 0) {
                setTimeout(() => {
                  fitMapToTrips(results);
                }, 300);
              }

              showDialog({
                variant: 'success',
                title: 'Recherche effectuée',
                message: `${results.length} trajet(s) trouvé(s) dans cette zone.`,
              });
            } catch (error: any) {
              const message =
                error?.data?.message ?? error?.error ?? "Impossible de rechercher dans cette zone.";
              showDialog({
                variant: 'danger',
                title: 'Erreur',
                message: Array.isArray(message) ? message.join('\n') : message,
              });
            }
          }}
          disabled={isSearchingArea}
        >
          {isSearchingArea ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.searchHereText}>Rechercher ici ({DEFAULT_SEARCH_RADIUS_KM} km)</Text>
          )}
        </TouchableOpacity>
      )}

      {!isMapExpanded && (
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderLeft}>
              <Text style={styles.sheetTitle}>Trajets à proximité</Text>
              <View style={styles.sheetSubtitleRow}>
                <Ionicons name="location" size={14} color={Colors.gray[500]} />
                <Text style={styles.sheetSubtitle}>
                  {trips.length} {trips.length === 1 ? 'trajet trouvé' : 'trajets trouvés'}
                  {activeSearchQuery && ` • "${activeSearchQuery}"`}
                </Text>
              </View>
            </View>
            {activeSearchQuery && (
              <TouchableOpacity
                style={styles.clearSearchButton}
                onPress={clearSearchQuery}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={20} color={Colors.gray[500]} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={Colors.primary}
                colors={[Colors.primary]}
              />
            }
          >
            {trips.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="map-outline" size={48} color={Colors.gray[400]} />
                </View>
                <Text style={styles.emptyTitle}>Aucun trajet trouvé</Text>
                <Text style={styles.emptyText}>
                  {activeSearchQuery
                    ? 'Aucun trajet ne correspond à votre recherche. Essayez de modifier les critères.'
                    : 'Déplacez la carte ou utilisez la recherche pour découvrir davantage d\'options.'}
                </Text>
                <View style={styles.emptyActions}>
                  <TouchableOpacity
                    style={styles.emptyActionButton}
                    onPress={clearSearchQuery}
                  >
                    <Ionicons name="refresh" size={18} color={Colors.primary} />
                    <Text style={styles.emptyActionButtonText}>Réinitialiser</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.emptyActionButton, styles.emptyActionButtonPrimary]}
                    onPress={() => router.push('/request')}
                  >
                    <Ionicons name="add-circle" size={18} color={Colors.white} />
                    <Text style={[styles.emptyActionButtonText, styles.emptyActionButtonTextPrimary]}>
                      Créer une demande
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              trips.map((trip) => {
                const TripCardWithArrival = () => {
                  const calculatedArrivalTime = useTripArrivalTime(trip);
                  const arrivalTimeDisplay = calculatedArrivalTime 
                    ? formatTime(calculatedArrivalTime.toISOString())
                    : formatTime(trip.arrivalTime);

                  return (
                    <TouchableOpacity
                      key={trip.id}
                      style={styles.tripCard}
                      onPress={() => router.push(`/trip/${trip.id}`)}
                    >
                      <View style={styles.tripCardHeader}>
                        <View style={styles.tripCardHeaderLeft}>
                          {trip.driverAvatar ? (
                            <Image
                              source={{ uri: trip.driverAvatar }}
                              style={styles.tripDriverAvatar}
                            />
                          ) : (
                            <View style={styles.tripDriverAvatar}>
                              <Ionicons name="person" size={16} color={Colors.gray[500]} />
                            </View>
                          )}
                          <View>
                            <Text style={styles.tripDriverName}>{trip.driverName}</Text>
                            <Text style={styles.tripVehicle}>
                              {trip.vehicle
                                ? `${trip.vehicle.brand} ${trip.vehicle.model}${trip.vehicle.color ? ` • ${trip.vehicle.color}` : ''}`
                                : trip.vehicleInfo}
                            </Text>
                          </View>
                        </View>
                        {trip.price === 0 ? (
                          <View style={styles.freeBadge}>
                            <Text style={styles.freeBadgeText}>Gratuit</Text>
                          </View>
                        ) : (
                          <Text style={styles.tripPrice}>{trip.price} FC</Text>
                        )}
                      </View>
                      <View style={styles.tripRouteRow}>
                        <Ionicons name="location" size={16} color={Colors.success} />
                        <Text style={styles.tripRouteText}>{trip.departure.name}</Text>
                        <View style={styles.timeContainer}>
                          <Text style={styles.routeDateLabel}>
                            {formatDateWithRelativeLabel(trip.departureTime, false)}
                          </Text>
                          <Text style={styles.tripTime}>{formatTime(trip.departureTime)}</Text>
                        </View>
                      </View>
                      <View style={styles.tripRouteRow}>
                        <Ionicons name="navigate" size={16} color={Colors.primary} />
                        <Text style={styles.tripRouteText}>{trip.arrival.name}</Text>
                        <View style={styles.timeContainer}>
                          {calculatedArrivalTime && (
                            <Text style={styles.routeDateLabel}>
                              {formatDateWithRelativeLabel(calculatedArrivalTime.toISOString(), false)}
                            </Text>
                          )}
                          <Text style={styles.tripTime}>{arrivalTimeDisplay}</Text>
                        </View>
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
                  );
                };

                return <TripCardWithArrival key={trip.id} />;
              })
            )}
          </ScrollView>
        </View>
      )}

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

      {!safeUserCoords && permissionStatus === 'granted' && (
        <View style={styles.loadingIndicator}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>Localisation en cours…</Text>
        </View>
      )}

      {/* Loading overlay when searching */}
      {isApplyingSearch && (
        <View style={styles.searchingOverlay}>
          <View style={styles.searchingCard}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.searchingText}>Recherche en cours...</Text>
          </View>
        </View>
      )}

      <TutorialOverlay
        visible={mapGuideVisible}
        title="Explorez les trajets"
        message="Filtrez par zone, véhicule ou destination puis tapez sur un marqueur pour rejoindre rapidement un trajet."
        onDismiss={dismissMapGuide}
      />
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
    zIndex: 10,
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
  searchCardTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  searchCardHint: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: -Spacing.xs,
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
  suggestionsContainer: {
    maxHeight: 200,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  suggestionContent: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  suggestionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.medium,
    color: Colors.gray[900],
  },
  suggestionSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 2,
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
  mapGuideCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  mapGuideText: {
    flex: 1,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  driverMarkerWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 62,
    minHeight: 80,
    paddingTop: 22,
    paddingBottom: 8,
  },
  distanceBadge: {
    backgroundColor: Colors.success,
    minWidth: 36,
    minHeight: 18,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  distanceBadgeText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  distanceBadgeHidden: {
    opacity: 0,
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
    shadowColor: Colors.black,
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    overflow: 'hidden',
  },
  driverMarkerImage: {
    width: '100%',
    height: '100%',
  },
  driverMarkerInitials: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  driverMarkerHalo: {
    marginTop: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    opacity: 0.5,
  },
  arrivalMarker: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
    shadowColor: Colors.black,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  calloutCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: Spacing.md,
    width: 260,
    gap: Spacing.sm,
    shadowColor: Colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  calloutAvatar: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
  },
  calloutAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutAvatarText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  calloutHeaderText: {
    flex: 1,
  },
  calloutTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 2,
  },
  calloutRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  calloutRatingText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  calloutSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
    marginBottom: Spacing.xs,
  },
  calloutInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  calloutInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.gray[50],
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  calloutDistance: {
    fontSize: FontSizes.xs,
    color: Colors.success,
    fontWeight: FontWeights.semibold,
  },
  calloutSeats: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  calloutPrice: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  calloutDivider: {
    height: 1,
    backgroundColor: Colors.gray[100],
    marginVertical: Spacing.xs,
  },
  calloutFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calloutSchedule: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    flex: 1,
  },
  calloutCta: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calloutCtaText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  centerPinContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -18,
    marginTop: -38,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  centerPinHalo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    opacity: 0.2,
    position: 'absolute',
    bottom: 0,
    transform: [{ scaleX: 1.5 }],
  },
  centerPinIcon: {
    marginBottom: 8,
    zIndex: 21,
  },
  centerPinShadow: {
    width: 10,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 5,
    position: 'absolute',
    bottom: 2,
  },
  mapControls: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: '48%', // Default position
    gap: Spacing.sm,
    alignItems: 'flex-end',
    zIndex: 10,
  },
  mapControlsExpanded: {
    bottom: Spacing.xl,
  },
  expandButton: {
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    shadowColor: Colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  expandButtonExpanded: {
    backgroundColor: Colors.primary,
  },
  expandButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
    fontWeight: FontWeights.semibold,
  },
  expandButtonTextExpanded: {
    color: Colors.white,
  },
  locationButton: {
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    shadowColor: Colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  locationButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
    fontWeight: FontWeights.semibold,
  },
  searchHereButton: {
    position: 'absolute',
    top: Platform.select({ ios: 60, android: 40 }),
    alignSelf: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    shadowColor: Colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 25,
  },
  searchHereText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.sm,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '58%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: Colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 15,
  },
  sheetHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  sheetHeaderLeft: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  sheetSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sheetSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  clearSearchButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  refreshButton: {
    padding: Spacing.sm,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.full,
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
    paddingBottom: Spacing.xl * 2,
  },
  tripCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    gap: Spacing.sm,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tripCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tripDriverAvatar: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[300],
    marginRight: Spacing.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripDriverName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  tripVehicle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  tripPrice: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  freeBadge: {
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  freeBadgeText: {
    color: Colors.success,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
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
  timeContainer: {
    alignItems: 'flex-end',
  },
  routeDateLabel: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
    marginBottom: 2,
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
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  emptyText: {
    color: Colors.gray[600],
    textAlign: 'center',
    fontSize: FontSizes.base,
    paddingHorizontal: Spacing.lg,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    paddingHorizontal: Spacing.lg,
  },
  emptyActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    gap: Spacing.xs,
  },
  emptyActionButtonPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  emptyActionButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
  },
  emptyActionButtonTextPrimary: {
    color: Colors.white,
  },
  createRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  createRequestButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    marginLeft: Spacing.sm,
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
  searchingOverlay: {
    position: 'absolute',
    top: Platform.select({ ios: 100, android: 80 }),
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  searchingCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    shadowColor: Colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  searchingText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
});
