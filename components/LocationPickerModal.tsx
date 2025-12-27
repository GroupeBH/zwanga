import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { getGoogleMapsPlaceDetails, searchGoogleMapsPlaces, type GoogleMapsSearchSuggestion } from '@/utils/googleMapsPlaces';
import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
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

const DEFAULT_REGION: Region = {
  latitude: -4.441931,
  longitude: 15.266293,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
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
  const mapRef = useRef<MapView>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [googleMapsSuggestions, setGoogleMapsSuggestions] = useState<GoogleMapsSearchSuggestion[]>([]);
  const [googleMapsLoading, setGoogleMapsLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [selectedLocation, setSelectedLocation] = useState<MapLocationSelection | null>(
    initialLocation ?? null,
  );
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const geocodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserInteractionRef = useRef(false);
  const lastMarkerUpdateRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const isUpdatingMarkerRef = useRef(false);

  // Récupérer les lieux favoris
  const { data: favoriteLocations = [], isLoading: favoritesLoading } = useGetFavoriteLocationsQuery(undefined, {
    skip: !visible, // Ne charger que quand le modal est visible
  });

  // Convertir les lieux favoris en SearchResult
  const favoriteLocationsAsResults = useMemo<SearchResult[]>(() => {
    return favoriteLocations.map((fav) => ({
      title: fav.name,
      address: fav.address,
      latitude: fav.coordinates.latitude,
      longitude: fav.coordinates.longitude,
    }));
  }, [favoriteLocations]);

  // Handler pour sélectionner un lieu favori
  const handleFavoritePress = (favorite: SearchResult) => {
    setSelectedLocation(favorite);
    animateToCoordinate(favorite.latitude, favorite.longitude);
    setSearchQuery('');
    setSearchResults([]);
    setGoogleMapsSuggestions([]);
  };

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

  // Nettoyer le timeout de géocodage quand le composant est démonté
  useEffect(() => {
    return () => {
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
      }
    };
  }, []);

  const animateToCoordinate = (latitude: number, longitude: number, skipMarkerUpdate = false) => {
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

      const nextRegion: Region = {
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegion(nextRegion);
      
      // Marquer que c'est une mise à jour programmée pour éviter les boucles
      isUserInteractionRef.current = false;
      isUpdatingMarkerRef.current = true;
      lastMarkerUpdateRef.current = { latitude, longitude };
      
      // Si skipMarkerUpdate est false, mettre à jour le marqueur aussi
      if (!skipMarkerUpdate) {
        setSelectedLocation((prev) => {
          if (!prev) {
            return {
              title: 'Point sélectionné',
              address: 'Détermination de l\'adresse…',
              latitude,
              longitude,
            };
          }
          return {
            ...prev,
            latitude,
            longitude,
          };
        });
      }
      
      if (mapRef.current) {
        mapRef.current.animateToRegion(nextRegion, 350);
      }

      // Réinitialiser après l'animation
      setTimeout(() => {
        isUpdatingMarkerRef.current = false;
        isUserInteractionRef.current = true;
      }, 400); // Légèrement après la durée de l'animation
    } catch (error) {
      console.error('Error animating to coordinate:', error);
      isUpdatingMarkerRef.current = false;
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
    // Ne pas gérer le clic sur la carte si on est en train de glisser le marqueur
    if (isDragging) {
      return;
    }

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
      
      await updateLocationFromCoordinates(coordinate);
    } catch (error) {
      console.error('Error handling map press:', error);
    }
  };

  const updateLocationFromCoordinates = async (coordinate: { latitude: number; longitude: number }) => {
    try {
      setIsGeocoding(true);
      const [address] = await Location.reverseGeocodeAsync(coordinate);
      setSelectedLocation(buildSelectionFromCoordinate(coordinate, address));
    } catch (error) {
      console.warn('Reverse geocoding failed', error);
      // Garder la sélection même si le reverse geocoding échoue
      setSelectedLocation({
        title: 'Point sélectionné',
        address: `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      });
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleMarkerDragStart = () => {
    setIsDragging(true);
    setSelectedLocation((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        address: 'Détermination de l\'adresse…',
      };
    });
  };

  const handleMarkerDrag = (event: any) => {
    try {
      const coordinate = event?.nativeEvent?.coordinate;
      if (!coordinate || typeof coordinate.latitude !== 'number' || typeof coordinate.longitude !== 'number') {
        return;
      }

      const { latitude, longitude } = coordinate;
      
      // Valider les coordonnées
      if (
        typeof longitude !== 'number' ||
        typeof latitude !== 'number' ||
        isNaN(longitude) ||
        isNaN(latitude) ||
        !isFinite(longitude) ||
        !isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return;
      }

      // Mettre à jour la position du marqueur en temps réel pendant le drag
      setSelectedLocation((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          latitude,
          longitude,
          address: 'Détermination de l\'adresse…',
        };
      });
    } catch (error) {
      console.error('Error handling marker drag:', error);
    }
  };

  const handleMarkerDragEnd = async (event: any) => {
    setIsDragging(false);
    
    try {
      const coordinate = event?.nativeEvent?.coordinate;
      if (!coordinate || typeof coordinate.latitude !== 'number' || typeof coordinate.longitude !== 'number') {
        return;
      }

      const { latitude, longitude } = coordinate;
      
      // Valider les coordonnées
      if (
        typeof longitude !== 'number' ||
        typeof latitude !== 'number' ||
        isNaN(longitude) ||
        isNaN(latitude) ||
        !isFinite(longitude) ||
        !isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        console.warn('Invalid coordinates after drag:', { longitude, latitude });
        return;
      }

      // Mettre à jour la référence pour éviter les boucles
      lastMarkerUpdateRef.current = { latitude, longitude };
      isUpdatingMarkerRef.current = true;
      isUserInteractionRef.current = false;

      // Mettre à jour la région pour suivre le marqueur
      const nextRegion: Region = {
        latitude,
        longitude,
        latitudeDelta: region.latitudeDelta,
        longitudeDelta: region.longitudeDelta,
      };
      if (mapRef.current) {
        mapRef.current.animateToRegion(nextRegion, 0);
      }

      // Réinitialiser après un court délai
      setTimeout(() => {
        isUpdatingMarkerRef.current = false;
        isUserInteractionRef.current = true;
      }, 100);

      // Faire le reverse geocoding pour obtenir l'adresse
      await updateLocationFromCoordinates({ latitude, longitude });
    } catch (error) {
      console.error('Error handling marker drag end:', error);
      setIsDragging(false);
      isUpdatingMarkerRef.current = false;
    }
  };

  // Removed getCoordinates - no longer needed with Google Maps
  const _unused_getCoordinates = (center: any): [number, number] | null => {
    if (Array.isArray(center) && center.length >= 2) {
      const [lng, lat] = center;
      if (
        typeof lng === 'number' &&
        typeof lat === 'number' &&
        !isNaN(lng) &&
        !isNaN(lat) &&
        isFinite(lng) &&
        isFinite(lat) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
      ) {
        return [lng, lat];
      }
    }
    return null;
  };

  const handleCameraChanged = (region: Region) => {
    // Ignorer si on est en train de mettre à jour le marqueur programmatiquement
    if (isUpdatingMarkerRef.current) {
      return;
    }

    // Ignorer si c'est une animation programmée (pas une interaction utilisateur)
    if (!isUserInteractionRef.current) {
      isUserInteractionRef.current = true;
      setRegion(region);
      return;
    }
    
    setRegion(region);

    // Ignorer si on est en train de glisser le marqueur
    if (isDragging) {
      return;
    }

    try {
      const { latitude, longitude } = region;
      
      // Vérifier si les coordonnées sont significativement différentes de la dernière mise à jour
      // pour éviter les mises à jour répétées pour la même position
      if (lastMarkerUpdateRef.current) {
        const latDiff = Math.abs(latitude - lastMarkerUpdateRef.current.latitude);
        const lngDiff = Math.abs(longitude - lastMarkerUpdateRef.current.longitude);
        // Seulement mettre à jour si la différence est significative (environ 10 mètres)
        const threshold = 0.0001; // ~11 mètres
        if (latDiff < threshold && lngDiff < threshold) {
          return;
        }
      }
      
      updateMarkerFromMapCenter(latitude, longitude);
    } catch (error) {
      console.error('Error handling camera change:', error);
    }
  };

  const handleMapIdle = () => {
    // Quand la carte s'arrête de bouger, s'assurer que le géocodage final est fait
    if (isPanning && selectedLocation) {
      // Le timeout dans updateMarkerFromMapCenter s'occupera du géocodage
      // On peut juste réinitialiser isPanning si nécessaire
    }
  };

  const updateMarkerFromMapCenter = (latitude: number, longitude: number) => {
    // Valider les coordonnées
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
      return;
    }

    // Marquer qu'on est en train de mettre à jour le marqueur pour éviter les boucles
    isUpdatingMarkerRef.current = true;
    setIsPanning(true);
    
    // Mettre à jour la référence de la dernière position
    lastMarkerUpdateRef.current = { latitude, longitude };
    
    // Mettre à jour la position du marqueur immédiatement
    setSelectedLocation((prev) => {
      if (!prev) {
        return {
          title: 'Point sélectionné',
          address: 'Détermination de l\'adresse…',
          latitude,
          longitude,
        };
      }
      return {
        ...prev,
        latitude,
        longitude,
        address: 'Détermination de l\'adresse…',
      };
    });

    // Debounce le reverse geocoding pour éviter trop d'appels pendant le pan
    if (geocodeTimeoutRef.current) {
      clearTimeout(geocodeTimeoutRef.current);
    }

    geocodeTimeoutRef.current = setTimeout(async () => {
      setIsPanning(false);
      isUpdatingMarkerRef.current = false; // Réinitialiser après le géocodage
      await updateLocationFromCoordinates({ latitude, longitude });
    }, 500); // Attendre 500ms après la fin du pan avant de géocoder
  };

  // Recherche avec suggestions Mapbox en temps réel
  const searchMapboxSuggestions = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      try {
        setGoogleMapsSuggestions([]);
      } catch (error) {
        console.error('Error clearing suggestions:', error);
      }
      return;
    }

    try {
      setGoogleMapsLoading(true);
      const proximity = selectedLocation
        ? { longitude: selectedLocation.longitude, latitude: selectedLocation.latitude }
        : undefined;
      const suggestions = await searchGoogleMapsPlaces(query, proximity, 5);
      // Filtrer les suggestions invalides
      const validSuggestions = (suggestions || []).filter(
        (s) =>
          s &&
          s.id &&
          s.name &&
          (s.coordinates.latitude === null ||
            (typeof s.coordinates.latitude === 'number' &&
              !isNaN(s.coordinates.latitude) &&
              isFinite(s.coordinates.latitude) &&
              s.coordinates.latitude >= -90 &&
              s.coordinates.latitude <= 90)) &&
          (s.coordinates.longitude === null ||
            (typeof s.coordinates.longitude === 'number' &&
              !isNaN(s.coordinates.longitude) &&
              isFinite(s.coordinates.longitude) &&
              s.coordinates.longitude >= -180 &&
              s.coordinates.longitude <= 180))
      );
      try {
        setGoogleMapsSuggestions(validSuggestions);
      } catch (error) {
        console.error('Error setting suggestions:', error);
      }
    } catch (error) {
      console.error('Mapbox search failed', error);
      try {
        setGoogleMapsSuggestions([]);
      } catch (setError) {
        console.error('Error clearing suggestions after error:', setError);
      }
    } finally {
      try {
        setGoogleMapsLoading(false);
      } catch (error) {
        console.error('Error setting loading state:', error);
      }
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
      setGoogleMapsSuggestions([]);
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
      setGoogleMapsSuggestions([]);
      return;
    }

    // Vérifier si la requête correspond exactement à une suggestion Mapbox
    const exactMatch = googleMapsSuggestions.find(
      (s) => s.name.toLowerCase() === searchQuery.trim().toLowerCase() ||
             s.fullAddress?.toLowerCase() === searchQuery.trim().toLowerCase()
    );

    // Si on a des suggestions Mapbox et qu'il y a une correspondance exacte, utiliser la suggestion correspondante
    if (googleMapsSuggestions.length > 0 && exactMatch) {
      try {
        setSearchLoading(true);
        const firstSuggestion = exactMatch; // Utiliser la suggestion qui correspond exactement
        
        if (!firstSuggestion || !firstSuggestion.id) {
          console.warn('Invalid suggestion:', firstSuggestion);
          setSearchLoading(false);
          return;
        }
        
        // Utiliser getMapboxPlaceDetails pour obtenir les coordonnées complètes
        const placeDetails = await getGoogleMapsPlaceDetails(firstSuggestion.id);
        
        if (placeDetails && placeDetails.coordinates.latitude && placeDetails.coordinates.longitude) {
          const lat = placeDetails.coordinates.latitude;
          const lng = placeDetails.coordinates.longitude;
          
          // Valider les coordonnées avant de les utiliser
          if (
            typeof lat === 'number' &&
            typeof lng === 'number' &&
            !isNaN(lat) &&
            !isNaN(lng) &&
            isFinite(lat) &&
            isFinite(lng) &&
            lat >= -90 &&
            lat <= 90 &&
            lng >= -180 &&
            lng <= 180
          ) {
            const result: SearchResult = {
              title: placeDetails.name || firstSuggestion.name || 'Lieu sélectionné',
              address: placeDetails.fullAddress || firstSuggestion.fullAddress || firstSuggestion.name || 'Adresse non disponible',
              latitude: lat,
              longitude: lng,
            };
            setSelectedLocation(result);
            animateToCoordinate(result.latitude, result.longitude);
            setGoogleMapsSuggestions([]);
            setSearchQuery(placeDetails.name || firstSuggestion.name || '');
            setSearchLoading(false);
            return;
          }
        }
        
        // Fallback si retrieve échoue mais qu'on a des coordonnées dans la suggestion
        if (
          firstSuggestion.coordinates.latitude &&
          firstSuggestion.coordinates.longitude &&
          typeof firstSuggestion.coordinates.latitude === 'number' &&
          typeof firstSuggestion.coordinates.longitude === 'number' &&
          !isNaN(firstSuggestion.coordinates.latitude) &&
          !isNaN(firstSuggestion.coordinates.longitude) &&
          isFinite(firstSuggestion.coordinates.latitude) &&
          isFinite(firstSuggestion.coordinates.longitude) &&
          firstSuggestion.coordinates.latitude >= -90 &&
          firstSuggestion.coordinates.latitude <= 90 &&
          firstSuggestion.coordinates.longitude >= -180 &&
          firstSuggestion.coordinates.longitude <= 180
        ) {
          const result: SearchResult = {
            title: firstSuggestion.name || 'Lieu sélectionné',
            address: firstSuggestion.fullAddress || firstSuggestion.name || 'Adresse non disponible',
            latitude: firstSuggestion.coordinates.latitude,
            longitude: firstSuggestion.coordinates.longitude,
          };
          setSelectedLocation(result);
          animateToCoordinate(result.latitude, result.longitude);
          setGoogleMapsSuggestions([]);
          setSearchLoading(false);
          return;
        }
      } catch (error) {
        console.error('Failed to retrieve place details, falling back to expo-location', error);
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
      if (!results || !Array.isArray(results) || results.length === 0) {
        setSearchResults([]);
        setSearchLoading(false);
        return;
      }
      const mappedResults: SearchResult[] = results.slice(0, 5)
        .map((result, index) => {
          try {
            // Valider que le résultat a les propriétés nécessaires
            if (!result || typeof result !== 'object' || !('latitude' in result) || !('longitude' in result)) {
              console.warn('Invalid geocode result:', result);
              return null;
            }
            
            const lat = result.latitude;
            const lng = result.longitude;
            
            // Valider les coordonnées
            if (
              typeof lat !== 'number' ||
              typeof lng !== 'number' ||
              isNaN(lat) ||
              isNaN(lng) ||
              !isFinite(lat) ||
              !isFinite(lng) ||
              lat < -90 ||
              lat > 90 ||
              lng < -180 ||
              lng > 180
            ) {
              console.warn('Invalid coordinates in geocode result:', { lat, lng });
              return null;
            }
            
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
              latitude: lat,
              longitude: lng,
            };
          } catch (error) {
            console.warn('Error mapping geocode result:', error);
            return null;
          }
        })
        .filter((result): result is SearchResult => result !== null);
        
      setSearchResults(mappedResults);
      const first = mappedResults[0];
      if (first) {
        setSelectedLocation(first);
        animateToCoordinate(first.latitude, first.longitude);
      }
    } catch (error) {
      console.error('Geocoding failed', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleResultPress = (result: SearchResult) => {
    setSelectedLocation(result);
    animateToCoordinate(result.latitude, result.longitude);
    setSearchResults([]);
    setGoogleMapsSuggestions([]);
  };

  const handleGoogleMapsSuggestionPress = async (suggestion: GoogleMapsSearchSuggestion) => {
    if (!suggestion || !suggestion.id) {
      console.warn('Invalid suggestion:', suggestion);
      return;
    }
    
    try {
      setGoogleMapsLoading(true);
      
      // Essayer d'abord d'utiliser les coordonnées de la suggestion si elles sont valides
      let finalLatitude: number | null = null;
      let finalLongitude: number | null = null;
      let finalName = suggestion.name || 'Lieu sélectionné';
      let finalAddress = suggestion.fullAddress || suggestion.name || 'Adresse non disponible';
      
      // Vérifier si les coordonnées de la suggestion sont valides
      if (
        suggestion?.coordinates &&
        suggestion.coordinates.latitude !== null &&
        suggestion.coordinates.longitude !== null &&
        typeof suggestion.coordinates.latitude === 'number' &&
        typeof suggestion.coordinates.longitude === 'number' &&
        !isNaN(suggestion.coordinates.latitude) &&
        !isNaN(suggestion.coordinates.longitude) &&
        isFinite(suggestion.coordinates.latitude) &&
        isFinite(suggestion.coordinates.longitude) &&
        suggestion.coordinates.latitude >= -90 &&
        suggestion.coordinates.latitude <= 90 &&
        suggestion.coordinates.longitude >= -180 &&
        suggestion.coordinates.longitude <= 180
      ) {
        finalLatitude = suggestion.coordinates.latitude;
        finalLongitude = suggestion.coordinates.longitude;
      }
      
      // Essayer de récupérer les détails complets pour obtenir une adresse plus précise
      try {
        const placeDetails = await getGoogleMapsPlaceDetails(suggestion.id);
        
        if (placeDetails) {
          // Utiliser les coordonnées des détails si disponibles et valides
          if (
            placeDetails.coordinates.latitude !== null &&
            placeDetails.coordinates.longitude !== null &&
            typeof placeDetails.coordinates.latitude === 'number' &&
            typeof placeDetails.coordinates.longitude === 'number' &&
            !isNaN(placeDetails.coordinates.latitude) &&
            !isNaN(placeDetails.coordinates.longitude) &&
            isFinite(placeDetails.coordinates.latitude) &&
            isFinite(placeDetails.coordinates.longitude) &&
            placeDetails.coordinates.latitude >= -90 &&
            placeDetails.coordinates.latitude <= 90 &&
            placeDetails.coordinates.longitude >= -180 &&
            placeDetails.coordinates.longitude <= 180
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
        setGoogleMapsSuggestions([]);
        setSearchQuery(finalName);
        setGoogleMapsLoading(false);
        return;
      }
      
      // Si aucune coordonnée valide n'est disponible, essayer de géocoder le nom
      console.warn('No valid coordinates found for suggestion, attempting geocoding:', suggestion);
      try {
        const geocodeQuery = suggestion.name || suggestion.fullAddress || '';
        if (!geocodeQuery.trim()) {
          console.error('No query available for geocoding');
          setGoogleMapsLoading(false);
          return;
        }
        
        const geocodeResults = await Location.geocodeAsync(geocodeQuery);
        if (geocodeResults && Array.isArray(geocodeResults) && geocodeResults.length > 0) {
          const firstResult = geocodeResults[0];
          
          // Valider le résultat du géocodage
          if (
            firstResult &&
            typeof firstResult === 'object' &&
            'latitude' in firstResult &&
            'longitude' in firstResult &&
            typeof firstResult.latitude === 'number' &&
            typeof firstResult.longitude === 'number' &&
            !isNaN(firstResult.latitude) &&
            !isNaN(firstResult.longitude) &&
            isFinite(firstResult.latitude) &&
            isFinite(firstResult.longitude) &&
            firstResult.latitude >= -90 &&
            firstResult.latitude <= 90 &&
            firstResult.longitude >= -180 &&
            firstResult.longitude <= 180
          ) {
            const result: SearchResult = {
              title: suggestion.name || 'Lieu sélectionné',
              address: formatAddressFromGeocode(firstResult) || suggestion.fullAddress || suggestion.name || 'Adresse non disponible',
              latitude: firstResult.latitude,
              longitude: firstResult.longitude,
            };
            setSelectedLocation(result);
            animateToCoordinate(result.latitude, result.longitude);
            setGoogleMapsSuggestions([]);
            setSearchQuery(suggestion.name || '');
          } else {
            console.error('Invalid geocode result:', firstResult);
          }
        } else {
          console.error('Geocoding returned no results for suggestion:', suggestion);
        }
      } catch (geocodeError) {
        console.error('Error geocoding suggestion:', geocodeError);
      }
    } catch (error) {
      console.error('Error handling Mapbox suggestion press:', error);
    } finally {
      setGoogleMapsLoading(false);
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
            onChangeText={(text) => {
              try {
                setSearchQuery(text);
              } catch (error) {
                console.error('Error updating search query:', error);
              }
            }}
            returnKeyType="search"
            onSubmitEditing={handleSearchSubmit}
            autoComplete="off"
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
          />
          {(googleMapsLoading || searchLoading) ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <TouchableOpacity onPress={handleSearchSubmit} disabled={searchLoading}>
              <Ionicons name="arrow-forward" size={20} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Lieux favoris - affichés quand il n'y a pas de recherche active */}
        {!searchQuery.trim() && favoriteLocationsAsResults.length > 0 && (
          <View style={styles.resultsContainer}>
            <View style={styles.favoritesHeader}>
              <Ionicons name="star" size={16} color={Colors.secondary} />
              <Text style={styles.favoritesHeaderText}>Lieux favoris</Text>
            </View>
            <FlatList
              data={favoriteLocationsAsResults}
              keyExtractor={(_, index) => `favorite-${index}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultRow}
                  onPress={() => handleFavoritePress(item)}
                >
                  <Ionicons 
                    name="star" 
                    size={18} 
                    color={Colors.secondary} 
                  />
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

        {/* Suggestions Mapbox en temps réel */}
        {googleMapsSuggestions.length > 0 && (
          <View style={styles.resultsContainer}>
            <FlatList
                  data={googleMapsSuggestions}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultRow}
                  onPress={() => handleGoogleMapsSuggestionPress(item)}
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
        {googleMapsSuggestions.length === 0 && searchResults.length > 0 && (
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
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={region}
            onPress={handleMapPress}
            onRegionChange={handleCameraChanged}
            onRegionChangeComplete={handleMapIdle}
          >
            {selectedLocation && (
              <Marker
                coordinate={{
                  latitude: selectedLocation.latitude,
                  longitude: selectedLocation.longitude,
                }}
                draggable={true}
                onDragStart={handleMarkerDragStart}
                onDrag={handleMarkerDrag}
                onDragEnd={handleMarkerDragEnd}
              >
                <View
                  style={[
                    styles.selectedMarker,
                    { backgroundColor: Colors.primary },
                    isDragging && styles.selectedMarkerDragging,
                  ]}
                >
                  {isGeocoding ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Ionicons name="pin" size={20} color={Colors.white} />
                  )}
                </View>
              </Marker>
            )}
          </MapView>
        </View>

        <View style={styles.locationDetails}>
          {isGeocoding ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="pin" size={20} color={Colors.primary} />
          )}
          <View style={styles.locationDetailsContent}>
            <Text style={styles.locationDetailsTitle}>
              {isDragging
                ? 'Glissez le marqueur pour sélectionner un lieu'
                : isPanning
                ? 'Déplacement de la carte…'
                : selectedLocation?.title ?? 'Touchez la carte, glissez le marqueur ou déplacez la carte pour définir un point'}
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
  favoritesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
    gap: Spacing.xs,
  },
  favoritesHeaderText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
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
  selectedMarkerDragging: {
    transform: [{ scale: 1.1 }],
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
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

