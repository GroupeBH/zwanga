import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
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
import { searchMapboxPlaces, type MapboxSearchSuggestion } from '@/utils/mapboxSearch';

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
    // Mapbox returns coordinates as [longitude, latitude]
    const [longitude, latitude] = event.geometry.coordinates;
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

    // Si on a des suggestions Mapbox, utiliser la première
    if (mapboxSuggestions.length > 0) {
      const firstSuggestion = mapboxSuggestions[0];
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

  const handleMapboxSuggestionPress = (suggestion: MapboxSearchSuggestion) => {
    const result: SearchResult = {
      title: suggestion.name,
      address: suggestion.fullAddress || suggestion.name,
      latitude: suggestion.coordinates.latitude,
      longitude: suggestion.coordinates.longitude,
    };
    setSelectedLocation(result);
    animateToCoordinate(result.latitude, result.longitude);
    setMapboxSuggestions([]);
    setSearchQuery(suggestion.name);
  };

  const handleConfirm = () => {
    if (!selectedLocation) {
      return;
    }
    const hasAddress = selectedLocation.address && selectedLocation.address.length > 0;
    const selection: MapLocationSelection = {
      ...selectedLocation,
      address: hasAddress ? selectedLocation.address : selectedLocation.title,
    };
    onSelect(selection);
  };

  const coordinateDisplay = useMemo(() => {
    if (!selectedLocation) {
      return null;
    }
    return `${selectedLocation.latitude.toFixed(5)}, ${selectedLocation.longitude.toFixed(5)}`;
  }, [selectedLocation]);

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={Colors.gray[900]} />
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerButton: {
    padding: Spacing.sm,
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
  map: {
    flex: 1,
    marginTop: Spacing.md,
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
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
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
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

