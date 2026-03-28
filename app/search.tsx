import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  TripSearchByPointsPayload,
  TripSearchParams,
  useGetTripsQuery,
  useSearchTripsByCoordinatesMutation,
} from '@/store/api/tripApi';
import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import { useGetLandmarksQuery, type LandmarkPlace } from '@/store/api/googleMapsApi';
import { useAppSelector } from '@/store/hooks';
import { selectTrips } from '@/store/selectors';
import type { FavoriteLocation, Trip } from '@/types';
import { formatTime, formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { getTripRequestCreateHref } from '@/utils/requestNavigation';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import { searchMapboxPlaces, type MapboxSearchSuggestion } from '@/utils/mapboxSearch';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const FALLBACK_KINSHASA_LANDMARKS: LandmarkPlace[] = [
  {
    id: 'fallback-victoire',
    name: 'Victoire',
    query: 'Victoire, Kalamu, Kinshasa',
    address: 'Avenue Victoire, Kalamu, Kinshasa',
    commune: 'Kalamu',
    category: 'rond-point',
    keywords: ['victoire', 'kalamu'],
  },
  {
    id: 'fallback-zando',
    name: 'Zando',
    query: 'Marche Central Zando, Gombe, Kinshasa',
    address: 'Marche Central, Gombe, Kinshasa',
    commune: 'Gombe',
    category: 'marche',
    keywords: ['zando', 'marche central'],
  },
  {
    id: 'fallback-upn',
    name: 'UPN',
    query: 'Universite Pedagogique Nationale, Ngaliema, Kinshasa',
    address: 'UPN, Ngaliema, Kinshasa',
    commune: 'Ngaliema',
    category: 'universite',
    keywords: ['upn'],
  },
  {
    id: 'fallback-ngaba',
    name: 'Rond-point Ngaba',
    query: 'Rond-point Ngaba, Ngaba, Kinshasa',
    address: 'Rond-point Ngaba, Kinshasa',
    commune: 'Ngaba',
    category: 'rond-point',
    keywords: ['ngaba'],
  },
  {
    id: 'fallback-matonge',
    name: 'Matonge',
    query: 'Matonge, Kalamu, Kinshasa',
    address: 'Matonge, Kalamu, Kinshasa',
    commune: 'Kalamu',
    category: 'quartier',
    keywords: ['matonge'],
  },
  {
    id: 'fallback-kintambo',
    name: 'Kintambo Magasin',
    query: 'Kintambo Magasin, Kintambo, Kinshasa',
    address: 'Kintambo Magasin, Kinshasa',
    commune: 'Kintambo',
    category: 'quartier',
    keywords: ['kintambo magasin'],
  },
];

export default function SearchScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{
    departure?: string;
    arrival?: string;
    mode?: string;
    departureLat?: string;
    departureLng?: string;
    arrivalLat?: string;
    arrivalLng?: string;
    departureRadiusKm?: string;
    arrivalRadiusKm?: string;
    departureLabel?: string;
    arrivalLabel?: string;
  }>();
  const storedTrips = useAppSelector(selectTrips);
  const { data: favoriteLocations = [] } = useGetFavoriteLocationsQuery();
  const { data: kinshasaLandmarks = [] } = useGetLandmarksQuery({
    city: 'kinshasa',
    limit: 8,
  });
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [departureSuggestions, setDepartureSuggestions] = useState<MapboxSearchSuggestion[]>([]);
  const [arrivalSuggestions, setArrivalSuggestions] = useState<MapboxSearchSuggestion[]>([]);
  const [departureLoading, setDepartureLoading] = useState(false);
  const [arrivalLoading, setArrivalLoading] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState<'departure' | 'arrival' | null>(null);
  const departureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const arrivalTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [queryParams, setQueryParams] = useState<TripSearchParams>({});
  const [advancedTrips, setAdvancedTrips] = useState<Trip[] | null>(null);
  const [advancedError, setAdvancedError] = useState<string | null>(null);
  const [lastAdvancedPayload, setLastAdvancedPayload] =
    useState<TripSearchByPointsPayload | null>(null);
  const [searchTripsByCoordinates, { isLoading: isAdvancedSearching }] =
    useSearchTripsByCoordinatesMutation();
  const landmarkShortcuts =
    kinshasaLandmarks.length > 0 ? kinshasaLandmarks : FALLBACK_KINSHASA_LANDMARKS;

  const {
    data: remoteTrips,
    isLoading: queryLoading,
    isFetching: queryFetching,
  } = useGetTripsQuery(queryParams, {
    // Polling pour les résultats de recherche
    pollingInterval: 60000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  // Recherche avec suggestions Mapbox pour le départ
  const searchDepartureSuggestions = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setDepartureSuggestions([]);
      return;
    }

    try {
      setDepartureLoading(true);
      const suggestions = await searchMapboxPlaces(query, undefined, 5);
      setDepartureSuggestions(suggestions);
    } catch (error) {
      console.warn('Mapbox search failed for departure', error);
      setDepartureSuggestions([]);
    } finally {
      setDepartureLoading(false);
    }
  }, []);

  // Recherche avec suggestions Mapbox pour l'arrivée
  const searchArrivalSuggestions = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setArrivalSuggestions([]);
      return;
    }

    try {
      setArrivalLoading(true);
      const suggestions = await searchMapboxPlaces(query, undefined, 5);
      setArrivalSuggestions(suggestions);
    } catch (error) {
      console.warn('Mapbox search failed for arrival', error);
      setArrivalSuggestions([]);
    } finally {
      setArrivalLoading(false);
    }
  }, []);

  // Debounce pour les suggestions de départ
  useEffect(() => {
    if (departureTimeoutRef.current) {
      clearTimeout(departureTimeoutRef.current);
    }

    if (departure.trim().length >= 2 && activeSearchField === 'departure') {
      departureTimeoutRef.current = setTimeout(() => {
        searchDepartureSuggestions(departure);
      }, 300);
    } else {
      setDepartureSuggestions([]);
    }

    return () => {
      if (departureTimeoutRef.current) {
        clearTimeout(departureTimeoutRef.current);
      }
    };
  }, [departure, activeSearchField, searchDepartureSuggestions]);

  // Debounce pour les suggestions d'arrivée
  useEffect(() => {
    if (arrivalTimeoutRef.current) {
      clearTimeout(arrivalTimeoutRef.current);
    }

    if (arrival.trim().length >= 2 && activeSearchField === 'arrival') {
      arrivalTimeoutRef.current = setTimeout(() => {
        searchArrivalSuggestions(arrival);
      }, 300);
    } else {
      setArrivalSuggestions([]);
    }

    return () => {
      if (arrivalTimeoutRef.current) {
        clearTimeout(arrivalTimeoutRef.current);
      }
    };
  }, [arrival, activeSearchField, searchArrivalSuggestions]);

  const handleDepartureSuggestionSelect = (suggestion: MapboxSearchSuggestion) => {
    setDeparture(suggestion.name);
    setDepartureSuggestions([]);
    setActiveSearchField(null);
  };

  const handleArrivalSuggestionSelect = (suggestion: MapboxSearchSuggestion) => {
    setArrival(suggestion.name);
    setArrivalSuggestions([]);
    setActiveSearchField(null);
  };

  const activeSuggestions = useMemo(
    () => (activeSearchField === 'departure' ? departureSuggestions : arrivalSuggestions),
    [activeSearchField, arrivalSuggestions, departureSuggestions],
  );

  const activeSuggestionQuery = activeSearchField === 'departure' ? departure : arrival;
  const visibleSuggestions = useMemo(() => activeSuggestions.slice(0, 3), [activeSuggestions]);
  const showSuggestionPanel = !!activeSearchField && visibleSuggestions.length > 0;

  // Fonction pour mettre en évidence le texte recherché
  const highlightText = (text: string, query: string) => {
    if (!query || query.trim().length === 0) {
      return <Text>{text}</Text>;
    }

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
      <Text>
        {parts.map((part, index) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <Text key={index} style={{ color: Colors.primary, fontWeight: FontWeights.semibold }}>
              {part}
            </Text>
          ) : (
            <Text key={index}>{part}</Text>
          ),
        )}
      </Text>
    );
  };

  // Fonction pour obtenir l'icône selon le type de lieu
  const getPlaceIcon = (suggestion: MapboxSearchSuggestion) => {
    const placeType = suggestion.placeType?.[0] || '';
    if (placeType.includes('poi') || placeType.includes('category')) {
      return 'search';
    }
    if (placeType.includes('station') || placeType.includes('transit')) {
      return 'train';
    }
    if (placeType.includes('cafe') || placeType.includes('restaurant')) {
      return 'cafe';
    }
    return 'location';
  };

  const handleApplySearch = () => {
    setDepartureSuggestions([]);
    setArrivalSuggestions([]);
    setActiveSearchField(null);
    clearAdvancedFilter();
    setQueryParams({
      departureLocation: departure.trim() || undefined,
      arrivalLocation: arrival.trim() || undefined,
    });
  };

  const handleFavoriteLocationShortcut = (location: FavoriteLocation) => {
    const value = location.address || location.name;

    if (activeSearchField === 'arrival') {
      setArrival(value);
      setArrivalSuggestions([]);
    } else if (activeSearchField === 'departure' || !departure.trim()) {
      setDeparture(value);
      setDepartureSuggestions([]);
    } else {
      setArrival(value);
      setArrivalSuggestions([]);
    }

    setActiveSearchField(null);
  };

  const handleLandmarkShortcut = (landmark: LandmarkPlace) => {
    const value = landmark.query || landmark.name;

    if (activeSearchField === 'arrival') {
      setArrival(value);
      setArrivalSuggestions([]);
    } else if (activeSearchField === 'departure' || !departure.trim()) {
      setDeparture(value);
      setDepartureSuggestions([]);
    } else {
      setArrival(value);
      setArrivalSuggestions([]);
    }

    setActiveSearchField(null);
  };

  const runAdvancedSearch = async (payload: TripSearchByPointsPayload) => {
    setAdvancedError(null);
    setAdvancedTrips(null);
    try {
      const results = await searchTripsByCoordinates(payload).unwrap();
      setAdvancedTrips(results);
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? 'Impossible de filtrer par carte pour le moment.';
      setAdvancedError(Array.isArray(message) ? message.join('\n') : message);
    }
  };

  const clearAdvancedFilter = () => {
    setAdvancedTrips(null);
    setAdvancedError(null);
    setLastAdvancedPayload(null);
  };

  const handleRetryAdvanced = () => {
    if (lastAdvancedPayload) {
      runAdvancedSearch(lastAdvancedPayload);
    }
  };

  useEffect(() => {
    const departureParam = typeof searchParams.departure === 'string' ? searchParams.departure : '';
    const arrivalParam = typeof searchParams.arrival === 'string' ? searchParams.arrival : '';
    setDeparture(departureParam);
    setArrival(arrivalParam);
    setQueryParams((prev) => ({
      ...prev,
      departureLocation: departureParam || undefined,
      arrivalLocation: arrivalParam || undefined,
    }));
  }, [searchParams.departure, searchParams.arrival]);

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
  ]);

  const baseTrips: Trip[] = useMemo(() => {
    if (advancedTrips) {
      return advancedTrips;
    }
    if (remoteTrips) {
      return remoteTrips;
    }
    return storedTrips;
  }, [advancedTrips, remoteTrips, storedTrips]);

  const filteredTrips = useMemo(() => {
    const filtered = baseTrips.filter((trip) => {
      const matchesDeparture = !departure || trip.departure.name.toLowerCase().includes(departure.toLowerCase());
      const matchesArrival = !arrival || trip.arrival.name.toLowerCase().includes(arrival.toLowerCase());
      return matchesDeparture && matchesArrival;
    });
    
    // Trier par date de création (les plus récents en premier)
    return filtered.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA; // dateB - dateA = du plus récent au plus ancien
    });
  }, [baseTrips, departure, arrival]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rechercher un trajet</Text>
        </View>

        {/* Barre de recherche */}
        <View style={styles.searchBox}>
          <View style={styles.searchRowContainer}>
            <View style={styles.searchRow}>
              <Ionicons name="location-outline" size={18} color={Colors.success} />
              <TextInput
                style={styles.searchInput}
                placeholder="Choisissez votre point de départ"
                placeholderTextColor={Colors.gray[500]}
                value={departure}
                onChangeText={setDeparture}
                onFocus={() => setActiveSearchField('departure')}
                onBlur={() => {
                  // Délai pour permettre le clic sur une suggestion
                  setTimeout(() => {
                    if (activeSearchField === 'departure') {
                      setActiveSearchField(null);
                    }
                  }, 200);
                }}
              />
              {departure.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setDeparture('');
                    setDepartureSuggestions([]);
                  }}
                  style={styles.clearButton}
                >
                  <Ionicons name="close-circle" size={20} color={Colors.gray[400]} />
                </TouchableOpacity>
              )}
              {departureLoading && (
                <ActivityIndicator size="small" color={Colors.primary} style={styles.loadingIndicator} />
              )}
            </View>
          </View>
          <View style={styles.searchDivider} />
          <View style={styles.searchRowContainer}>
            <View style={[styles.searchRow, styles.searchRowLast]}>
              <Ionicons name="flag-outline" size={18} color={Colors.primary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Choisissez votre point d'arrivée"
                placeholderTextColor={Colors.gray[500]}
                value={arrival}
                onChangeText={setArrival}
                onFocus={() => setActiveSearchField('arrival')}
                onBlur={() => {
                  // Délai pour permettre le clic sur une suggestion
                  setTimeout(() => {
                    if (activeSearchField === 'arrival') {
                      setActiveSearchField(null);
                    }
                  }, 200);
                }}
              />
              {arrival.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setArrival('');
                    setArrivalSuggestions([]);
                  }}
                  style={styles.clearButton}
                >
                  <Ionicons name="close-circle" size={20} color={Colors.gray[400]} />
                </TouchableOpacity>
              )}
              {arrivalLoading && (
                <ActivityIndicator size="small" color={Colors.primary} style={styles.loadingIndicator} />
              )}
            </View>
          </View>
        </View>
        
        {/* Suggestions affichées dans un panneau compact pour garder l'écran léger */}
        {showSuggestionPanel && (
          <View style={styles.suggestionsContainerAbsolute}>
            <View style={styles.suggestionsPanelHeader}>
              <View style={styles.suggestionsPanelBadge}>
                <Ionicons
                  name={activeSearchField === 'departure' ? 'location-outline' : 'flag-outline'}
                  size={14}
                  color={Colors.primary}
                />
                <Text style={styles.suggestionsPanelBadgeText}>
                  {activeSearchField === 'departure' ? 'Départ' : 'Arrivée'}
                </Text>
              </View>
              <Text style={styles.suggestionsPanelHint}>Touchez une suggestion</Text>
            </View>
            <FlatList
              data={visibleSuggestions}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[
                    styles.suggestionRow,
                    index === visibleSuggestions.length - 1 && styles.suggestionRowLast,
                  ]}
                  onPress={() =>
                    activeSearchField === 'departure'
                      ? handleDepartureSuggestionSelect(item)
                      : handleArrivalSuggestionSelect(item)
                  }
                >
                  <View style={styles.suggestionIconBadge}>
                    <Ionicons
                      name={getPlaceIcon(item) as any}
                      size={17}
                      color={getPlaceIcon(item) === 'search' ? Colors.primary : Colors.gray[700]}
                    />
                  </View>
                  <View style={styles.suggestionContent}>
                    <Text style={styles.suggestionTitle} numberOfLines={1}>
                      {highlightText(item.name, activeSuggestionQuery)}
                    </Text>
                    {item.fullAddress && (
                      <Text style={styles.suggestionSubtitle} numberOfLines={1}>
                        {item.fullAddress}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
                </TouchableOpacity>
              )}
              scrollEnabled={activeSuggestions.length > visibleSuggestions.length}
            />
          </View>
        )}
        <TouchableOpacity style={styles.searchButton} onPress={handleApplySearch}>
          {queryFetching ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.searchButtonText}>Rechercher</Text>
          )}
        </TouchableOpacity>

        <View style={styles.favoriteShortcutsSection}>
          <View style={styles.favoriteShortcutsHeader}>
            <View>
              <Text style={styles.favoriteShortcutsTitle}>Acces rapides</Text>
              <Text style={styles.favoriteShortcutsHint}>Choisissez un repere sans quitter les resultats</Text>
            </View>
            {favoriteLocations.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/favorite-locations')}>
                <Text style={styles.favoriteShortcutsLink}>Gerer</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.favoriteShortcutsScroll}
          >
            {favoriteLocations.slice(0, 4).map((location) => {
              const icon =
                location.type === 'home'
                  ? 'home'
                  : location.type === 'work'
                    ? 'briefcase'
                    : 'location';

              return (
                <TouchableOpacity
                  key={location.id}
                  style={[styles.favoriteShortcutChip, styles.favoriteShortcutChipFavorite]}
                  onPress={() => handleFavoriteLocationShortcut(location)}
                >
                  <Ionicons name={icon} size={14} color={Colors.primary} />
                  <Text style={styles.favoriteShortcutText} numberOfLines={1}>
                    {location.name}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {landmarkShortcuts.slice(0, 6).map((landmark) => (
              <TouchableOpacity
                key={landmark.id}
                style={styles.favoriteShortcutChip}
                onPress={() => handleLandmarkShortcut(landmark)}
              >
                <Ionicons name="navigate" size={14} color={Colors.primary} />
                <Text style={styles.favoriteShortcutText} numberOfLines={1}>
                  {landmark.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Résultats */}
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {(queryLoading || isAdvancedSearching) && !filteredTrips.length ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Recherche des trajets...</Text>
          </View>
        ) : null}

        {advancedError ? (
          <TouchableOpacity style={styles.errorBanner} onPress={handleRetryAdvanced}>
            <Ionicons name="alert-circle" size={18} color={Colors.white} />
            <Text style={styles.errorText}>{advancedError}</Text>
            <Ionicons name="refresh" size={18} color={Colors.white} />
          </TouchableOpacity>
        ) : null}

        <Text style={styles.resultsCount}>
          {filteredTrips.length} trajet{filteredTrips.length > 1 ? 's' : ''} trouvé{filteredTrips.length > 1 ? 's' : ''}
        </Text>

        {!isAdvancedSearching && filteredTrips.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="search-outline" size={48} color={Colors.gray[500]} />
            </View>
            <Text style={styles.emptyTitle}>Aucun trajet trouvé</Text>
            <Text style={styles.emptyText}>
              Essayez de modifier vos critères de recherche ou créez une demande de trajet
            </Text>
            <TouchableOpacity
              style={styles.createRequestButton}
                onPress={() => router.push(getTripRequestCreateHref())}
            >
              <Ionicons name="add-circle" size={20} color={Colors.white} />
              <Text style={styles.createRequestButtonText}>Créer une demande de trajet</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredTrips.map((trip) => {
            const TripCardWithArrival = () => {
              const calculatedArrivalTime = useTripArrivalTime(trip);
              const arrivalTimeDisplay = calculatedArrivalTime 
                ? formatTime(calculatedArrivalTime.toISOString())
                : formatTime(trip.arrivalTime);

              return (
                <View key={trip.id} style={styles.tripCard}>
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
                          <View style={styles.dot} />
                          <Text style={styles.vehicleInfo}>
                            {trip.vehicle
                              ? `${trip.vehicle.brand} ${trip.vehicle.model}${trip.vehicle.color ? ` • ${trip.vehicle.color}` : ''}`
                              : trip.vehicleInfo}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {trip.price === 0 ? (
                      <View style={styles.freeBadge}>
                        <Text style={styles.freeBadgeText}>Gratuit</Text>
                      </View>
                    ) : (
                      <View style={styles.priceBadge}>
                        <Text style={styles.priceText}>{trip.price} FC</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.tripRoute}>
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

                    <View style={styles.routeRow}>
                      <Ionicons name="navigate" size={16} color={Colors.primary} />
                      <Text style={styles.routeText}>{trip.arrival.name}</Text>
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
                        {trip.availableSeats} places disponibles
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.detailsButton}
                      onPress={() => router.push(`/trip/${trip.id}`)}
                    >
                      <Text style={styles.detailsButtonText}>Voir détails</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            };

            return <TripCardWithArrival key={trip.id} />;
          })
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
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  backButton: {
    marginRight: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  searchBox: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  searchButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  favoriteShortcutsSection: {
    marginBottom: Spacing.sm,
  },
  favoriteShortcutsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  favoriteShortcutsTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
  },
  favoriteShortcutsLink: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  favoriteShortcutsHint: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
    marginTop: 2,
  },
  favoriteShortcutsScroll: {
    gap: Spacing.sm,
    paddingRight: Spacing.xl,
  },
  favoriteShortcutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm - 2,
  },
  favoriteShortcutChipFavorite: {
    backgroundColor: Colors.primary + '08',
  },
  favoriteShortcutText: {
    maxWidth: 116,
    color: Colors.gray[800],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  searchRowContainer: {
    position: 'relative',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  searchRowLast: {
    marginBottom: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  searchDivider: {
    height: 1,
    backgroundColor: Colors.gray[200],
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  clearButton: {
    marginLeft: Spacing.sm,
    padding: Spacing.xs,
  },
  loadingIndicator: {
    marginLeft: Spacing.sm,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
    maxHeight: 300,
    zIndex: 1000,
    ...CommonStyles.shadowLg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  suggestionsContainerAbsolute: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.xl,
    maxHeight: 240,
    zIndex: 1000,
    ...CommonStyles.shadowLg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  suggestionsPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    gap: Spacing.sm,
  },
  suggestionsPanelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '10',
  },
  suggestionsPanelBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    textTransform: 'uppercase',
  },
  suggestionsPanelHint: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  suggestionRowLast: {
    borderBottomWidth: 0,
  },
  suggestionIconBadge: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  suggestionContent: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  suggestionTitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
    fontWeight: FontWeights.semibold,
  },
  suggestionSubtitle: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  filterButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.base,
  },
  filterDot: {
    backgroundColor: Colors.primary,
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    marginLeft: Spacing.xs,
  },
  filtersContainer: {
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  filterSection: {
    marginBottom: Spacing.md,
  },
  filterSectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  filterTag: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.gray[200],
  },
  filterTagActive: {
    backgroundColor: Colors.primary,
  },
  filterTagText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
  },
  filterTagTextActive: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.sm,
    color: Colors.gray[500],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.danger,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  errorText: {
    flex: 1,
    color: Colors.white,
  },
  radiusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  radiusIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radiusContent: {
    flex: 1,
    marginHorizontal: Spacing.md,
  },
  radiusTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  radiusSubtitle: {
    color: Colors.gray[600],
    marginTop: Spacing.xs,
    fontSize: FontSizes.sm,
  },
  radiusClear: {
    padding: Spacing.xs,
  },
  resultsCount: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.lg,
  },
  emptyContainer: {
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
    fontSize: FontSizes.base,
    marginBottom: Spacing.md,
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
  tripCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
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
  detailsButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  detailsButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.sm,
  },
});

function parseNumberParam(value?: string | string[]): number | undefined {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}
