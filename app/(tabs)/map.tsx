import { TutorialOverlay } from '@/components/TutorialOverlay';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import { useUserLocation } from '@/hooks/useUserLocation';
import { TripSearchParams, useLazyGetTripsQuery, useSearchTripsByCoordinatesMutation } from '@/store/api/tripApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectLocationRadius,
  selectTripSearchMode,
  selectTripSearchQuery,
  selectTripsMatchingMapFilters,
  selectUserCoordinates,
  selectVehicleFilter,
} from '@/store/selectors';
import { setRadiusKm, setSearchQuery, TripSearchMode } from '@/store/slices/locationSlice';
import { setTrips } from '@/store/slices/tripsSlice';
import { formatTime, formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, Callout, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { searchGoogleMapsPlaces, getGoogleMapsPlaceDetails, type GoogleMapsSearchSuggestion } from '@/utils/googleMapsPlaces';
import { getCachedRouteCoordinates, type RouteCoordinates } from '@/utils/googleMapsDirections';

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
  const { showDialog } = useDialog();
  const { permissionStatus, requestPermission } = useUserLocation({ autoRequest: true });
  const [triggerTripSearch, { isFetching: isApplyingSearch }] = useLazyGetTripsQuery();
  const [searchByCoordinates, { isLoading: isSearchingArea }] = useSearchTripsByCoordinatesMutation();
  const userCoords = useAppSelector(selectUserCoordinates);
  const trips = useAppSelector(selectTripsMatchingMapFilters);
  const radiusKm = useAppSelector(selectLocationRadius);
  const vehicleFilter = useAppSelector(selectVehicleFilter);
  const searchMode = useAppSelector(selectTripSearchMode);
  const activeSearchQuery = useAppSelector(selectTripSearchQuery);
  const [search, setSearch] = useState(activeSearchQuery);
  const { shouldShow: shouldShowMapGuide, complete: completeMapGuide } =
    useTutorialGuide('map_screen');
  const [mapGuideVisible, setMapGuideVisible] = useState(false);
  const mapRef = useRef<MapView>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [isMapMoving, setIsMapMoving] = useState(false);
  const [googleMapsSuggestions, setGoogleMapsSuggestions] = useState<GoogleMapsSearchSuggestion[]>([]);
  const [googleMapsLoading, setGoogleMapsLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [routeCoordinatesCache, setRouteCoordinatesCache] = useState<Map<string, RouteCoordinates[]>>(new Map());
  const [loadingRoutes, setLoadingRoutes] = useState<Set<string>>(new Set());

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
  }, [trips.length, activeSearchQuery, fitMapToTrips]);

  // Charger les itinéraires pour tous les trajets
  useEffect(() => {
    const loadRoutes = async () => {
      const tripsToLoad: Array<{
        tripId: string;
        start: RouteCoordinates;
        end: RouteCoordinates;
      }> = [];

      // Identifier les trajets qui ont besoin d'un itinéraire
      for (const trip of trips) {
        const departureCoords =
          trip.departure?.lat && trip.departure?.lng
            ? { latitude: trip.departure.lat, longitude: trip.departure.lng }
            : null;
        const arrivalCoords =
          trip.arrival?.lat && trip.arrival?.lng
            ? { latitude: trip.arrival.lat, longitude: trip.arrival.lng }
            : null;

        if (!departureCoords || !arrivalCoords) continue;

        const cacheKey = `${trip.id}-route`;
        
        // Ne pas recharger si déjà en cache ou en cours de chargement
        if (routeCoordinatesCache.has(cacheKey) || loadingRoutes.has(cacheKey)) {
          continue;
        }

        tripsToLoad.push({
          tripId: trip.id,
          start: departureCoords,
          end: arrivalCoords,
        });
      }

      // Charger les itinéraires en parallèle (mais avec un délai pour éviter trop de requêtes simultanées)
      for (const { tripId, start, end } of tripsToLoad) {
        const cacheKey = `${tripId}-route`;
        
        setLoadingRoutes(prev => new Set(prev).add(cacheKey));

        try {
          const route = await getCachedRouteCoordinates(start, end);
          
          if (route && route.length > 0) {
            setRouteCoordinatesCache(prev => {
              const newCache = new Map(prev);
              newCache.set(cacheKey, route);
              return newCache;
            });
          } else {
            // Fallback sur ligne droite si l'API échoue
            setRouteCoordinatesCache(prev => {
              const newCache = new Map(prev);
              newCache.set(cacheKey, [start, end]);
              return newCache;
            });
          }
        } catch (error) {
          console.warn(`Error loading route for trip ${tripId}:`, error);
          // Fallback sur ligne droite
          setRouteCoordinatesCache(prev => {
            const newCache = new Map(prev);
            newCache.set(cacheKey, [start, end]);
            return newCache;
          });
        } finally {
          setLoadingRoutes(prev => {
            const newSet = new Set(prev);
            newSet.delete(cacheKey);
            return newSet;
          });
        }

        // Petit délai entre les requêtes pour éviter de surcharger l'API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };

    loadRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips.map(t => t.id).join(',')]); // Seulement recharger si les IDs des trajets changent

  const toggleMapExpansion = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsMapExpanded(!isMapExpanded);
  };

  const centerOnUser = async () => {
    if (permissionStatus !== 'granted') {
      await requestPermission();
      return;
    }

    if (userCoords && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userCoords.latitude,
        longitude: userCoords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  };

  // Fonction pour ajuster la carte pour afficher tous les trajets
  const fitMapToTrips = useCallback((tripsToFit: typeof trips) => {
    if (!mapRef.current || tripsToFit.length === 0) {
      return;
    }

    // Collecter toutes les coordonnées (départ et arrivée)
    const coordinates: LatLng[] = [];
    
    tripsToFit.forEach((trip) => {
      if (trip.departure?.lat && trip.departure?.lng) {
        coordinates.push({
          latitude: trip.departure.lat,
          longitude: trip.departure.lng,
        });
      }
      if (trip.arrival?.lat && trip.arrival?.lng) {
        coordinates.push({
          latitude: trip.arrival.lat,
          longitude: trip.arrival.lng,
        });
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

    // Animer vers la nouvelle région
    mapRef.current.animateToRegion(
      {
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: finalLatDelta,
        longitudeDelta: finalLngDelta,
      },
      1000
    );
  }, []);

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
    if (initialRegion && !mapCenter) {
      setMapCenter([initialRegion.longitude, initialRegion.latitude]);
    }
  }, [initialRegion, mapCenter]);

  const dismissMapGuide = () => {
    setMapGuideVisible(false);
    completeMapGuide();
  };

  const initialRegion = useMemo(() => {
    if (userCoords) {
      return {
        latitude: userCoords.latitude,
        longitude: userCoords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }

    if (trips.length > 0 && trips[0].departure?.lat && trips[0].departure?.lng) {
      return {
        latitude: trips[0].departure.lat,
        longitude: trips[0].departure.lng,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
    }

    return {
      latitude: -4.441931,
      longitude: 15.266293,
      latitudeDelta: 0.2,
      longitudeDelta: 0.2,
    };
  }, [userCoords, trips]);

  const renderPolyline = (
    tripId: string,
    color: string,
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number },
  ) => {
    const cacheKey = `${tripId}-route`;
    const cachedRoute = routeCoordinatesCache.get(cacheKey);
    const isLoading = loadingRoutes.has(cacheKey);

    // Utiliser l'itinéraire depuis le cache s'il est disponible
    const coordinatesToUse = cachedRoute && cachedRoute.length > 0 
      ? cachedRoute 
      : [start, end]; // Fallback sur ligne droite

    const lineCoordinates = coordinatesToUse.map(coord => [coord.longitude, coord.latitude] as [number, number]);

    return (
      <Polyline
        key={`${tripId}-polyline`}
        coordinates={coordinatesToUse}
        strokeColor={color}
        strokeWidth={3}
        lineDashPattern={isLoading || !cachedRoute || cachedRoute.length === 2 ? [2, 2] : undefined}
        lineCap="round"
        lineJoin="round"
      />
    );
  };

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
      
      if (userCoords && 
          typeof userCoords.longitude === 'number' && 
          typeof userCoords.latitude === 'number' &&
          !isNaN(userCoords.longitude) && 
          !isNaN(userCoords.latitude) &&
          isFinite(userCoords.longitude) && 
          isFinite(userCoords.latitude)) {
        proximity = { longitude: userCoords.longitude, latitude: userCoords.latitude };
      } else if (mapCenter && 
                 Array.isArray(mapCenter) && 
                 mapCenter.length === 2 &&
                 typeof mapCenter[0] === 'number' && 
                 typeof mapCenter[1] === 'number' &&
                 !isNaN(mapCenter[0]) && 
                 !isNaN(mapCenter[1]) &&
                 isFinite(mapCenter[0]) && 
                 isFinite(mapCenter[1])) {
        proximity = { longitude: mapCenter[0], latitude: mapCenter[1] };
      }
      
      const suggestions = await searchGoogleMapsPlaces(query, proximity, 5);
      setGoogleMapsSuggestions(suggestions);
    } catch (error) {
      // Les erreurs sont déjà gérées dans searchMapboxPlaces
      setGoogleMapsSuggestions([]);
    } finally {
      setGoogleMapsLoading(false);
    }
  }, [userCoords, mapCenter]);

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
          error?.data?.message ?? error?.error ?? "Impossible d'appliquer le filtre pour le moment.";
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
          error?.data?.message ?? error?.error ?? "Impossible d'appliquer le filtre pour le moment.";
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

    return { departureLocation: trimmed };
  };

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
        error?.data?.message ?? error?.error ?? "Impossible d'appliquer le filtre pour le moment.";
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

  const getCoordinates = (center: any): [number, number] | null => {
    if (!center) return null;
    if (Array.isArray(center) && center.length === 2 && typeof center[0] === 'number' && typeof center[1] === 'number') {
      return center as [number, number];
    }
    if (typeof center === 'object') {
      const lng = center.lng ?? center.longitude ?? center[0];
      const lat = center.lat ?? center.latitude ?? center[1];
      if (typeof lng === 'number' && typeof lat === 'number') {
        return [lng, lat];
      }
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={!!userCoords}
        showsCompass={false}
        onRegionChange={(region) => {
          setMapRegion(region);
          setMapCenter([region.longitude, region.latitude]);
          setIsMapMoving(true);
        }}
        onRegionChangeComplete={() => setIsMapMoving(false)}
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
                >
                  <TouchableOpacity
                    onPress={() => router.push(`/trip/${trip.id}`)}
                    activeOpacity={0.7}
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
                  </TouchableOpacity>
                  <Callout>
                    <TouchableOpacity
                      style={styles.calloutCard}
                      onPress={() => router.push(`/trip/${trip.id}`)}
                      activeOpacity={0.8}
                    >
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
                    </TouchableOpacity>
                  </Callout>
                </Marker>
              )}
              {arrivalCoords && (
                <Marker
                  coordinate={arrivalCoords}
                >
                  <View
                    style={[
                      styles.arrivalMarker,
                      { backgroundColor: Colors.secondary },
                    ]}
                  >
                    <Ionicons name="navigate" size={16} color={Colors.white} />
                  </View>
                  <Callout>
                    <View>
                      <Text style={{ fontWeight: 'bold' }}>Arrivée: {trip.arrival.name}</Text>
                    </View>
                  </Callout>
                </Marker>
              )}
              {departureCoords &&
                arrivalCoords &&
                renderPolyline(trip.id, Colors.primary, departureCoords, arrivalCoords)}
            </React.Fragment>
          );
        })}
      </MapView>

      {/* Center Pin for Drag-to-Search */}
      <View style={styles.centerPinContainer} pointerEvents="none">
        <View style={styles.centerPinHalo} />
        <Ionicons name="location" size={36} color={Colors.primary} style={styles.centerPinIcon} />
        <View style={styles.centerPinShadow} />
      </View>

      {!isMapExpanded && (
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
      )}

      {/* Map Controls: Expand & Location */}
      <View style={[styles.mapControls, isMapExpanded && styles.mapControlsExpanded]}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={toggleMapExpansion}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isMapExpanded ? "contract" : "expand"}
            size={20}
            color={Colors.gray[800]}
          />
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
            if (mapCenter && mapRegion) {
              try {
                // Convertir les coordonnées en format attendu par l'API: [longitude, latitude]
                const departureCoordinates: [number, number] = [
                  mapRegion.longitude,
                  mapRegion.latitude,
                ];
                
                const results = await searchByCoordinates({
                  departureCoordinates,
                  departureRadiusKm: radiusKm,
                }).unwrap();
                dispatch(setTrips(results));

                // Ajuster la carte pour afficher tous les trajets trouvés
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
            }
          }}
          disabled={isSearchingArea}
        >
          {isSearchingArea ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.searchHereText}>Rechercher dans cette zone</Text>
          )}
        </TouchableOpacity>
      )}

      {!isMapExpanded && (
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Trajets à proximité</Text>
              <Text style={styles.sheetSubtitle}>{trips.length} itinéraire(s) trouvé(s)</Text>
            </View>
            {/* <TouchableOpacity style={styles.refreshButton} onPress={requestPermission}>
              <Ionicons name="locate" size={20} color={Colors.primary} />
            </TouchableOpacity> */}
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
                  Ajustez le rayon ou la recherche pour découvrir davantage d'options.
                </Text>
                <TouchableOpacity
                  style={styles.createRequestButton}
                  onPress={() => router.push('/request')}
                >
                  <Ionicons name="add-circle" size={20} color={Colors.white} />
                  <Text style={styles.createRequestButtonText}>Créer une demande de trajet</Text>
                </TouchableOpacity>
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
                            <Text style={styles.tripVehicle}>{trip.vehicleInfo}</Text>
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

      {!userCoords && permissionStatus === 'granted' && (
        <View style={styles.loadingIndicator}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>Localisation en cours…</Text>
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
    position: 'absolute',
    bottom: -4,
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
    borderRadius: 12,
    padding: Spacing.sm,
    width: 220,
    gap: 4,
  },
  calloutTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  calloutSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  calloutDistance: {
    fontSize: FontSizes.xs,
    color: Colors.success,
    fontWeight: FontWeights.medium,
  },
  calloutDivider: {
    height: 1,
    backgroundColor: Colors.gray[100],
    marginVertical: 4,
  },
  calloutFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calloutSchedule: {
    fontSize: 10,
    color: Colors.gray[500],
  },
  calloutCta: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  calloutCtaText: {
    color: Colors.white,
    fontSize: 10,
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
    gap: Spacing.md,
    alignItems: 'center',
    zIndex: 10,
  },
  mapControlsExpanded: {
    bottom: Spacing.xl,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
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
    height: '45%',
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
  sheetTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  sheetSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginTop: 2,
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
    marginBottom: Spacing.sm,
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
});
