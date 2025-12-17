import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { getMapboxPlaceDetails, searchMapboxPlaces, type MapboxSearchSuggestion } from '@/utils/mapboxSearch';
import { Ionicons } from '@expo/vector-icons';
import Mapbox from '@rnmapbox/maps';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// Initialize Mapbox with access token from config
const mapboxToken =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (mapboxToken) {
  Mapbox.setAccessToken(mapboxToken);
}

export type MapLocationSelection = {
  title: string;
  address: string;
  latitude: number;
  longitude: number;
};

type LocationPickerModalProps = {
  visible: boolean;
  title?: string;
  initialLocation?: MapLocationSelection | null;
  onClose: () => void;
  onSelect: (location: MapLocationSelection) => void;
};

type SearchResult = MapLocationSelection;

const DEFAULT_CAMERA = {
  centerCoordinate: [15.266293, -4.441931] as [number, number],
  zoomLevel: 11,
};

function formatAddressFromGeocode(
  data?: Partial<Location.LocationGeocodedAddress> | Location.LocationGeocodedLocation,
) {
  if (!data) return '';

  // Check if it's LocationGeocodedAddress (has address fields) or LocationGeocodedLocation (only coordinates)
  const isAddress = 'street' in data || 'streetNumber' in data || 'city' in data;

  if (!isAddress) {
    // It's LocationGeocodedLocation, return empty or coordinates
    return '';
  }

  // It's LocationGeocodedAddress, format the address
  const addressData = data as Partial<Location.LocationGeocodedAddress>;
  const streetLine = [addressData.streetNumber, addressData.street].filter(Boolean).join(' ').trim();
  const parts = [
    (addressData as any)?.name,
    streetLine,
    addressData.district,
    addressData.city || addressData.subregion,
    addressData.region,
    addressData.country,
  ]
    .map((value) => value?.toString().trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join(', ');
}

function buildSelectionFromCoordinate(
  coordinate: { latitude: number; longitude: number },
  address?: Partial<Location.LocationGeocodedAddress>,
  fallbackTitle: string = 'Point sélectionné',
): MapLocationSelection {
  const formattedAddress = formatAddressFromGeocode(address);
  const fallbackAddress = `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
  return {
    title: address?.street || address?.name || fallbackTitle,
    address: formattedAddress || fallbackAddress,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
}

export default function LocationPickerModal({
  visible,
  onClose,
  onSelect,
  title = 'Choisir un lieu',
  initialLocation,
}: LocationPickerModalProps) {
  const mapRef = useRef<Mapbox.MapView | null>(null);
  const cameraRef = useRef<Mapbox.Camera | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mapboxSuggestions, setMapboxSuggestions] = useState<MapboxSearchSuggestion[]>([]);
  const [mapboxLoading, setMapboxLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  const [selectedLocation, setSelectedLocation] = useState<MapLocationSelection | null>(
    initialLocation ?? null,
  );
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSearchQuery('');
    setSearchResults([]);
    if (initialLocation) {
      setSelectedLocation(initialLocation);
      animateToCoordinate(initialLocation.latitude, initialLocation.longitude);
      return;
    }

    requestUserLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (initialLocation && visible) {
      setSelectedLocation(initialLocation);
      animateToCoordinate(initialLocation.latitude, initialLocation.longitude);
    }
  }, [initialLocation, visible]);

  const animateToCoordinate = (latitude: number, longitude: number) => {
    try {
      // Valider les coordonnées avant d'animer
      if (
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        isNaN(latitude) ||
        isNaN(longitude) ||
        !isFinite(latitude) ||
        !isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        console.warn('Invalid coordinates for animation:', { latitude, longitude });
        return;
      }

      const nextCamera = {
        centerCoordinate: [longitude, latitude] as [number, number],
        zoomLevel: 14,
      };
      setCamera(nextCamera);
      cameraRef.current?.setCamera({
        centerCoordinate: nextCamera.centerCoordinate,
        zoomLevel: nextCamera.zoomLevel,
        animationDuration: 350,
      });
    } catch (error) {
      console.error('Error animating to coordinate:', error);
    }
  };

  const requestUserLocation = async () => {
    try {
      setIsLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);
      if (status !== Location.PermissionStatus.GRANTED) {
        setIsLocating(false);
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      animateToCoordinate(position.coords.latitude, position.coords.longitude);
      const [address] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setSelectedLocation(
        buildSelectionFromCoordinate(
          { latitude: position.coords.latitude, longitude: position.coords.longitude },
          address,
          'Ma position',
        ),
      );
    } catch (error) {
      console.warn('Impossible de récupérer la localisation utilisateur', error);
    } finally {
      setIsLocating(false);
    }
  };

  const handleMapPress = async (event: any) => {
    try {
      // Vérifier que l'événement contient les coordonnées
      if (!event?.geometry?.coordinates || !Array.isArray(event.geometry.coordinates)) {
        console.warn('Invalid map press event:', event);
        return;
      }

      // Mapbox returns coordinates as [longitude, latitude]
      const [longitude, latitude] = event.geometry.coordinates;
      
      // Valider les coordonnées
      if (
        typeof longitude !== 'number' ||
        typeof latitude !== 'number' ||
        isNaN(longitude) ||
        isNaN(latitude) ||
        !isFinite(longitude) ||
        !isFinite(latitude)
      ) {
        console.warn('Invalid coordinates:', { longitude, latitude });
        return;
      }

      const coordinate = { latitude, longitude };
      setSelectedLocation({
        title: 'Point sélectionné',
        address: 'Détermination de l\'adresse…',
        latitude,
        longitude,
      });
      
      try {
        const [address] = await Location.reverseGeocodeAsync(coordinate);
        setSelectedLocation(buildSelectionFromCoordinate(coordinate, address));
      } catch (error) {
        console.warn('Reverse geocoding failed', error);
        // Garder la sélection même si le reverse geocoding échoue
        setSelectedLocation({
          title: 'Point sélectionné',
          address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          latitude,
          longitude,
        });
      }
    } catch (error) {
      console.error('Error handling map press:', error);
    }
  };

  // Recherche avec suggestions Mapbox en temps réel
  const searchMapboxSuggestions = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setMapboxSuggestions([]);
      return;
    }

    try {
      setMapboxLoading(true);
      const proximity = selectedLocation
        ? { longitude: selectedLocation.longitude, latitude: selectedLocation.latitude }
        : undefined;
      const suggestions = await searchMapboxPlaces(query, proximity, 5);
      setMapboxSuggestions(suggestions);
    } catch (error) {
      console.warn('Mapbox search failed', error);
      setMapboxSuggestions([]);
    } finally {
      setMapboxLoading(false);
    }
  }, [selectedLocation]);

  // Debounce pour les suggestions Mapbox
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        searchMapboxSuggestions(searchQuery);
      }, 300);
    } else {
      setMapboxSuggestions([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, searchMapboxSuggestions]);

  const handleSearchSubmit = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setMapboxSuggestions([]);
      return;
    }

    // Si on a des suggestions Mapbox, utiliser la première et récupérer les détails complets
    if (mapboxSuggestions.length > 0) {
      try {
        setSearchLoading(true);
        const firstSuggestion = mapboxSuggestions[0];
        
        // Utiliser getMapboxPlaceDetails pour obtenir les coordonnées complètes
        const placeDetails = await getMapboxPlaceDetails(firstSuggestion.id);
        
        if (placeDetails && placeDetails.coordinates.latitude && placeDetails.coordinates.longitude) {
          const result: SearchResult = {
            title: placeDetails.name || firstSuggestion.name,
            address: placeDetails.fullAddress || firstSuggestion.fullAddress || firstSuggestion.name,
            latitude: placeDetails.coordinates.latitude,
            longitude: placeDetails.coordinates.longitude,
          };
          setSelectedLocation(result);
          animateToCoordinate(result.latitude, result.longitude);
          setMapboxSuggestions([]);
          setSearchQuery(placeDetails.name || firstSuggestion.name);
          return;
        } else {
          // Fallback si retrieve échoue mais qu'on a des coordonnées dans la suggestion
          if (firstSuggestion.coordinates.latitude && firstSuggestion.coordinates.longitude) {
            const result: SearchResult = {
              title: firstSuggestion.name,
              address: firstSuggestion.fullAddress || firstSuggestion.name,
              latitude: firstSuggestion.coordinates.latitude,
              longitude: firstSuggestion.coordinates.longitude,
            };
            setSelectedLocation(result);
            animateToCoordinate(result.latitude, result.longitude);
            setMapboxSuggestions([]);
            return;
          }
        }
      } catch (error) {
        console.warn('Failed to retrieve place details, falling back to expo-location', error);
        // Continue avec expo-location comme fallback
      } finally {
        setSearchLoading(false);
      }
    }

    // Sinon, utiliser expo-location comme fallback
    try {
      setSearchLoading(true);
      const query = searchQuery.trim();
      const results = await Location.geocodeAsync(query);
      if (!results || results.length === 0) {
        setSearchResults([]);
        return;
      }
      const mappedResults: SearchResult[] = results.slice(0, 5).map((result, index) => {
        const fallbackTitle = query || `Résultat ${index + 1}`;
        const title =
          (typeof result === 'object' && result !== null && 'name' in result && typeof (result as any).name === 'string' && (result as any).name) ||
          (typeof result === 'object' && result !== null && 'street' in result && typeof (result as any).street === 'string' && (result as any).street) ||
          (typeof result === 'object' && result !== null && 'city' in result && typeof (result as any).city === 'string' && (result as any).city) ||
          fallbackTitle;
        const address = formatAddressFromGeocode(result) || fallbackTitle;
        return {
          title,
          address,
          latitude: result.latitude,
          longitude: result.longitude,
        };
      });
      setSearchResults(mappedResults);
      const first = mappedResults[0];
      if (first) {
        setSelectedLocation(first);
        animateToCoordinate(first.latitude, first.longitude);
      }
    } catch (error) {
      console.warn('Geocoding failed', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleResultPress = (result: SearchResult) => {
    setSelectedLocation(result);
    animateToCoordinate(result.latitude, result.longitude);
    setSearchResults([]);
    setMapboxSuggestions([]);
  };

  const handleMapboxSuggestionPress = async (suggestion: MapboxSearchSuggestion) => {
    try {
      setMapboxLoading(true);
      
      // Essayer d'abord d'utiliser les coordonnées de la suggestion si elles sont valides
      let finalLatitude: number | null = null;
      let finalLongitude: number | null = null;
      let finalName = suggestion.name || 'Lieu sélectionné';
      let finalAddress = suggestion.fullAddress || suggestion.name || 'Adresse non disponible';
      
      // Vérifier si les coordonnées de la suggestion sont valides
      if (
        suggestion?.coordinates &&
        suggestion.coordinates.latitude &&
        suggestion.coordinates.longitude &&
        typeof suggestion.coordinates.latitude === 'number' &&
        typeof suggestion.coordinates.longitude === 'number' &&
        !isNaN(suggestion.coordinates.latitude) &&
        !isNaN(suggestion.coordinates.longitude) &&
        isFinite(suggestion.coordinates.latitude) &&
        isFinite(suggestion.coordinates.longitude)
      ) {
        finalLatitude = suggestion.coordinates.latitude;
        finalLongitude = suggestion.coordinates.longitude;
      }
      
      // Essayer de récupérer les détails complets pour obtenir une adresse plus précise
      try {
        const placeDetails = await getMapboxPlaceDetails(suggestion.id);
        
        if (placeDetails) {
          // Utiliser les coordonnées des détails si disponibles et valides
          if (
            placeDetails.coordinates.latitude &&
            placeDetails.coordinates.longitude &&
            typeof placeDetails.coordinates.latitude === 'number' &&
            typeof placeDetails.coordinates.longitude === 'number' &&
            !isNaN(placeDetails.coordinates.latitude) &&
            !isNaN(placeDetails.coordinates.longitude) &&
            isFinite(placeDetails.coordinates.latitude) &&
            isFinite(placeDetails.coordinates.longitude)
          ) {
            finalLatitude = placeDetails.coordinates.latitude;
            finalLongitude = placeDetails.coordinates.longitude;
          }
          
          // Utiliser les informations des détails si disponibles
          if (placeDetails.name) {
            finalName = placeDetails.name;
          }
          if (placeDetails.fullAddress) {
            finalAddress = placeDetails.fullAddress;
          }
        }
      } catch (error) {
        console.warn('Failed to retrieve place details, using suggestion data:', error);
        // Continuer avec les données de la suggestion
      }
      
      // Si on a des coordonnées valides, créer le résultat et mettre à jour l'UI
      if (finalLatitude !== null && finalLongitude !== null) {
        const result: SearchResult = {
          title: finalName,
          address: finalAddress,
          latitude: finalLatitude,
          longitude: finalLongitude,
        };
        
        setSelectedLocation(result);
        animateToCoordinate(result.latitude, result.longitude);
        setMapboxSuggestions([]);
        setSearchQuery(finalName);
      } else {
        // Si aucune coordonnée valide n'est disponible, essayer de géocoder le nom
        console.warn('No valid coordinates found for suggestion, attempting geocoding:', suggestion);
        try {
          const geocodeResults = await Location.geocodeAsync(suggestion.name);
          if (geocodeResults && geocodeResults.length > 0) {
            const firstResult = geocodeResults[0];
            const result: SearchResult = {
              title: suggestion.name || 'Lieu sélectionné',
              address: formatAddressFromGeocode(firstResult) || suggestion.fullAddress || suggestion.name || 'Adresse non disponible',
              latitude: firstResult.latitude,
              longitude: firstResult.longitude,
            };
            setSelectedLocation(result);
            animateToCoordinate(result.latitude, result.longitude);
            setMapboxSuggestions([]);
            setSearchQuery(suggestion.name || '');
          } else {
            console.error('Geocoding failed for suggestion:', suggestion);
          }
        } catch (geocodeError) {
          console.error('Error geocoding suggestion:', geocodeError);
        }
      }
    } catch (error) {
      console.error('Error handling Mapbox suggestion press:', error);
    } finally {
      setMapboxLoading(false);
    }
  };

  const handleClose = useCallback(() => {
    console.log('[LocationPickerModal] handleClose called, visible:', visible);
    if (typeof onClose === 'function') {
      onClose();
    } else {
      console.warn('[LocationPickerModal] onClose is not a function:', onClose);
    }
  }, [onClose, visible]);

  const handleConfirm = useCallback(() => {
    if (!selectedLocation) {
      return;
    }
    const hasAddress = selectedLocation.address && selectedLocation.address.length > 0;
    const selection: MapLocationSelection = {
      ...selectedLocation,
      address: hasAddress ? selectedLocation.address : selectedLocation.title,
    };
    onSelect(selection);
    handleClose(); // Fermer le modal après la sélection
  }, [selectedLocation, onSelect, handleClose]);

  const coordinateDisplay = useMemo(() => {
    if (!selectedLocation) {
      return null;
    }
    return `${selectedLocation.latitude.toFixed(5)}, ${selectedLocation.longitude.toFixed(5)}`;
  }, [selectedLocation]);

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={handleClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity 
            onPress={handleClose} 
            style={styles.headerButton}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            activeOpacity={0.6}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.gray[500]} />
          <TextInput
            style={styles.searchInput}
            placeholder="Recherchez une adresse ou un lieu"
            placeholderTextColor={Colors.gray[500]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={handleSearchSubmit}
          />
          {(mapboxLoading || searchLoading) ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <TouchableOpacity onPress={handleSearchSubmit} disabled={searchLoading}>
              <Ionicons name="arrow-forward" size={20} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Suggestions Mapbox en temps réel */}
        {mapboxSuggestions.length > 0 && (
          <View style={styles.resultsContainer}>
            <FlatList
              data={mapboxSuggestions}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultRow}
                  onPress={() => handleMapboxSuggestionPress(item)}
                >
                  <Ionicons name="location" size={18} color={Colors.primary} />
                  <View style={styles.resultContent}>
                    <Text style={styles.resultTitle}>{item.name}</Text>
                    {item.fullAddress && (
                      <Text style={styles.resultSubtitle} numberOfLines={1}>
                        {item.fullAddress}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Résultats expo-location (fallback) */}
        {mapboxSuggestions.length === 0 && searchResults.length > 0 && (
          <View style={styles.resultsContainer}>
            <FlatList
              data={searchResults}
              keyExtractor={(_, index) => `result-${index}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultRow}
                  onPress={() => handleResultPress(item)}
                >
                  <Ionicons name="location" size={18} color={Colors.primary} />
                  <View style={styles.resultContent}>
                    <Text style={styles.resultTitle}>{item.title}</Text>
                    <Text style={styles.resultSubtitle} numberOfLines={1}>
                      {item.address}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        <View style={styles.mapContainer}>
          {/* Zone de protection pour le header - bloque les touches du MapView */}
          <View style={styles.headerProtection} />
          <Mapbox.MapView
            ref={mapRef}
            style={styles.map}
            styleURL={Mapbox.StyleURL.Street}
            onPress={handleMapPress}
          >
            <Mapbox.Camera
              ref={cameraRef}
              defaultSettings={camera}
              animationMode="flyTo"
              animationDuration={0}
            />

            {selectedLocation && (
              <Mapbox.PointAnnotation
                id="selected-location"
                coordinate={[selectedLocation.longitude, selectedLocation.latitude]}
              >
                <View
                  style={[
                    styles.selectedMarker,
                    { backgroundColor: Colors.primary },
                  ]}
                >
                  <Ionicons name="pin" size={20} color={Colors.white} />
                </View>
              </Mapbox.PointAnnotation>
            )}
          </Mapbox.MapView>
        </View>

        <View style={styles.locationDetails}>
          <Ionicons name="pin" size={20} color={Colors.primary} />
          <View style={styles.locationDetailsContent}>
            <Text style={styles.locationDetailsTitle}>
              {selectedLocation?.title ?? 'Touchez la carte pour définir un point'}
            </Text>
            {selectedLocation?.address ? (
              <Text style={styles.locationDetailsSubtitle} numberOfLines={2}>
                {selectedLocation.address}
              </Text>
            ) : null}
            {coordinateDisplay && (
              <Text style={styles.locationCoords}>{coordinateDisplay}</Text>
            )}
          </View>
        </View>

        <View style={styles.modalActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={requestUserLocation}
            disabled={isLocating}
          >
            {isLocating ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <>
                <Ionicons name="locate" size={18} color={Colors.primary} />
                <Text style={styles.actionButtonText}>Ma position</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.confirmButton,
              !selectedLocation && styles.confirmButtonDisabled,
            ]}
            onPress={handleConfirm}
            disabled={!selectedLocation}
          >
            <Text style={styles.confirmButtonText}>Confirmer</Text>
          </TouchableOpacity>
        </View>

        {permissionStatus === Location.PermissionStatus.DENIED && (
          <View style={styles.permissionBanner}>
            <Ionicons name="warning" size={18} color={Colors.danger} />
            <Text style={styles.permissionText}>
              Autorisez l’accès à votre localisation pour améliorer la précision.
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl + Spacing.lg,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.white,
    zIndex: 1000,
    elevation: 5,
  },
  headerButton: {
    padding: Spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
  },
  resultsContainer: {
    maxHeight: 160,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    backgroundColor: Colors.gray[50],
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  resultContent: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  resultTitle: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  resultSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 2,
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  headerProtection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100, // Hauteur approximative du header
    zIndex: 1001,
    elevation: 6,
    backgroundColor: 'transparent',
  },
  map: {
    flex: 1,
    marginTop: 0,
  },
  selectedMarker: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
    shadowColor: Colors.black,
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  locationDetails: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderColor: Colors.gray[100],
    gap: Spacing.md,
  },
  locationDetailsContent: {
    flex: 1,
  },
  locationDetailsTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  locationDetailsSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 2,
  },
  locationCoords: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl + Spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  actionButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.medium,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  confirmButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  permissionText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    flex: 1,
  },
});

