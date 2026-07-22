import { useDialog } from '@/components/ui/DialogProvider';
import {
  getVehicleTrackingMarkerImage,
  PASSENGER_TRACKING_MARKER_ANCHOR,
  PassengerTrackingMarker,
  VEHICLE_TRACKING_MARKER_ANCHOR,
  VehicleTrackingMarker,
} from '@/components/TrackingMapMarkers';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { trackingSocket, type DriverLocationPayload } from '@/services/trackingSocket';
import {
  useConfirmDropoffByPassengerMutation,
  useGetBookingByIdQuery,
  useUpdatePassengerLocationMutation,
} from '@/store/api/bookingApi';
import { useGetDirectionsMutation } from '@/store/api/googleMapsApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import { getGeoPointCoordinate, normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { calculateDistance, getRouteAlignedPosition } from '@/utils/routeHelpers';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { MapMarker } from 'react-native-maps';
import Animated, { FadeInDown, FadeInUp } from '@/utils/reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_PASSENGER_ROUTE_POINTS = Platform.OS === 'ios' ? 180 : 250;
const IS_ANDROID = Platform.OS === 'android';

// Fonction pour decoder les polylines Google
function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    const latitude = lat / 1e5;
    const longitude = lng / 1e5;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      break;
    }

    points.push({ latitude, longitude });
  }

  // Limiter le nombre de points pour les performances
  if (points.length > MAX_PASSENGER_ROUTE_POINTS) {
    const step = Math.ceil(points.length / MAX_PASSENGER_ROUTE_POINTS);
    const simplified: { latitude: number; longitude: number }[] = [];
    for (let i = 0; i < points.length; i += step) {
      simplified.push(points[i]);
    }
    if (simplified[simplified.length - 1] !== points[points.length - 1]) {
      simplified.push(points[points.length - 1]);
    }
    return simplified;
  }

  return points;
}

export default function PassengerNavigationScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { showDialog } = useDialog();
  const insets = useSafeAreaInsets();
  const bookingId = typeof id === 'string' ? id : '';

  // Recuperer la reservation et le trajet
  const { data: booking, isLoading: bookingLoading, refetch: refetchBooking } = useGetBookingByIdQuery(bookingId, { 
    skip: !bookingId,
    pollingInterval: 30000, // Polling leger pour sync
  });
  const tripId = booking?.tripId || '';
  const { data: trip, isLoading: tripLoading } = useGetTripByIdQuery(tripId, { 
    skip: !tripId,
    pollingInterval: 30000,
  });
  const isTripOngoing = trip?.status === 'ongoing';

  const [updatePassengerLocation] = useUpdatePassengerLocationMutation();
  const [confirmDropoffByPassenger, { isLoading: isConfirmingArrival }] =
    useConfirmDropoffByPassengerMutation();

  const mapRef = useRef<MapView>(null);
  const driverMarkerRef = useRef<MapMarker | null>(null);
  const passengerMarkerRef = useRef<MapMarker | null>(null);
  const pickupMarkerRef = useRef<MapMarker | null>(null);
  const dropoffMarkerRef = useRef<MapMarker | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [passengerLocation, setPassengerLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [loadedMarkerKeys, setLoadedMarkerKeys] = useState<ReadonlySet<string>>(() => new Set());
  
  // Route et directions
  const [getDirections] = useGetDirectionsMutation();
  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [arrivalModalVisible, setArrivalModalVisible] = useState(false);
  const routeFetchedRef = useRef(false);
  const lastRouteFetchRef = useRef<number>(0);
  const hasFitInitialMapRef = useRef(false);
  const hasPresentedArrivalModalRef = useRef(false);
  const passengerLocationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const isMountedRef = useRef(true);
  const isExitingRef = useRef(false);
  const mapTopOffset = insets.top + 84;

  const navigateBackSafely = useCallback(() => {
    if (isExitingRef.current) {
      return;
    }

    isExitingRef.current = true;
    try {
      setIsSocketConnected(false);
      setIsLoadingRoute(false);
      routeFetchedRef.current = false;
      passengerLocationSubscriptionRef.current?.remove();
      passengerLocationSubscriptionRef.current = null;

    } catch (error) {
      console.warn('[PassengerNavigation] cleanup before back failed:', error);
    }

    try {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/bookings');
      }
    } catch {
      router.replace('/bookings');
    } finally {
      // If navigation fails for any reason, let the user retry the back action.
      setTimeout(() => {
        if (isMountedRef.current) {
          isExitingRef.current = false;
        }
      }, 800);
    }
  }, [router]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      passengerLocationSubscriptionRef.current?.remove();
      passengerLocationSubscriptionRef.current = null;
      void Speech.stop();
    };
  }, []);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigateBackSafely();
      return true;
    });

    return () => {
      backHandler.remove();
    };
  }, [navigateBackSafely]);

  // Coordonnees importantes
  // Le point de recuperation peut etre personnalise par le passager
  const pickupCoordinate = useMemo(() => {
    return (
      normalizeTripMapCoordinate(
        booking?.passengerOriginCoordinates?.latitude,
        booking?.passengerOriginCoordinates?.longitude,
      ) ?? normalizeTripMapCoordinate(trip?.departure?.lat, trip?.departure?.lng)
    );
  }, [
    booking?.passengerOriginCoordinates?.latitude,
    booking?.passengerOriginCoordinates?.longitude,
    trip?.departure?.lat,
    trip?.departure?.lng,
  ]);

  const dropoffCoordinate = useMemo(() => {
    return (
      normalizeTripMapCoordinate(
        booking?.passengerDestinationCoordinates?.latitude,
        booking?.passengerDestinationCoordinates?.longitude,
      ) ?? normalizeTripMapCoordinate(trip?.arrival?.lat, trip?.arrival?.lng)
    );
  }, [
    booking?.passengerDestinationCoordinates?.latitude,
    booking?.passengerDestinationCoordinates?.longitude,
    trip?.arrival?.lat,
    trip?.arrival?.lng,
  ]);

  const presentArrivalModal = useCallback(() => {
    if (!isMountedRef.current || hasPresentedArrivalModalRef.current) return;

    hasPresentedArrivalModalRef.current = true;
    setArrivalModalVisible(true);
    void Speech.stop().finally(() => {
      if (!isMountedRef.current) return;
      Speech.speak(
        "Vous êtes arrivé à votre destination. Appuyez sur Terminer pour valider l'arrivée et noter le conducteur.",
        { language: 'fr-FR', rate: 0.95 },
      );
    });
  }, []);

  useEffect(() => {
    hasPresentedArrivalModalRef.current = false;
    setArrivalModalVisible(false);
    setLoadedMarkerKeys(new Set());
  }, [bookingId]);

  const handleTrackingMarkerReady = useCallback(
    (markerKey: string, markerRef: React.MutableRefObject<MapMarker | null>) => {
      if (!IS_ANDROID) return;

      [80, 220].forEach((delay) => {
        setTimeout(() => {
          markerRef.current?.redraw();
        }, delay);
      });
      setTimeout(() => {
        if (!isMountedRef.current) return;

        setLoadedMarkerKeys((current) => {
          if (current.has(markerKey)) return current;

          const next = new Set(current);
          next.add(markerKey);
          return next;
        });
      }, 320);
    },
    [],
  );

  const tripDriverLocation = useMemo(
    () => getGeoPointCoordinate(trip?.currentLocation ?? null),
    [trip?.currentLocation],
  );

  useEffect(() => {
    if (!tripDriverLocation) {
      return;
    }

    const apiUpdatedAt = trip?.lastLocationUpdateAt ? new Date(trip.lastLocationUpdateAt) : null;
    const hasFreshApiLocation = Boolean(
      apiUpdatedAt &&
        !Number.isNaN(apiUpdatedAt.getTime()) &&
        (!lastUpdate || apiUpdatedAt.getTime() > lastUpdate.getTime()),
    );

    if (!driverLocation || hasFreshApiLocation) {
      setDriverLocation(tripDriverLocation);
      if (apiUpdatedAt && !Number.isNaN(apiUpdatedAt.getTime())) {
        setLastUpdate(apiUpdatedAt);
      }
    }
  }, [driverLocation, lastUpdate, trip?.lastLocationUpdateAt, tripDriverLocation]);

  // Fonction pour recuperer la route
  const fetchRoute = useCallback(async () => {
    if (!pickupCoordinate || !dropoffCoordinate || !isMountedRef.current) return;
    
    // Eviter les appels trop frequents (minimum 30s entre les appels)
    const now = Date.now();
    if (now - lastRouteFetchRef.current < 30000 && routeFetchedRef.current) return;
    lastRouteFetchRef.current = now;
    
    setIsLoadingRoute(true);
    
    try {
      const origin = { lat: pickupCoordinate.latitude, lng: pickupCoordinate.longitude };
      const destination = { lat: dropoffCoordinate.latitude, lng: dropoffCoordinate.longitude };
      
      const response = await getDirections({
        origin,
        destination,
        mode: 'driving' as any,
      }).unwrap();
      if (!isMountedRef.current) return;
      
      if (response.routes && response.routes.length > 0) {
        const route = response.routes[0];
        
        // Decoder la polyline
        if (route.overviewPolyline) {
          const decoded = decodePolyline(route.overviewPolyline);
          setRouteCoordinates(decoded);
        }
        
        // Calculer les infos de route
        if (route.legs && route.legs.length > 0) {
          const totalDistance = route.legs.reduce((acc, leg) => acc + leg.distance, 0);
          const totalDuration = route.legs.reduce((acc, leg) => acc + leg.duration, 0);
          
          // Formater la distance
          const distanceKm = totalDistance / 1000;
          const distanceStr = distanceKm >= 1 
            ? `${distanceKm.toFixed(1)} km` 
            : `${totalDistance} m`;
          
          // Formater la duree
          const hours = Math.floor(totalDuration / 3600);
          const minutes = Math.ceil((totalDuration % 3600) / 60);
          const durationStr = hours > 0 
            ? `${hours}h ${minutes}min` 
            : `${minutes} min`;
          
          setRouteInfo({ distance: distanceStr, duration: durationStr });
        }
        
        routeFetchedRef.current = true;
      }
    } catch (error: any) {
      if (!isMountedRef.current) return;
      const isNoRouteError = error?.status === 400 || error?.data?.statusCode === 400;
      
      if (isNoRouteError) {
        // Fallback: utiliser une ligne droite entre pickup et dropoff
        console.warn('[PassengerNavigation] Pas de route trouvee, utilisation de ligne droite');
        
        setRouteCoordinates([pickupCoordinate, dropoffCoordinate]);
        setRouteInfo(null); // Pas d'infos de distance/duree en fallback
        routeFetchedRef.current = true;
      } else {
        console.warn('[PassengerNavigation] Erreur route:', error?.data?.message || error?.message || 'Erreur inconnue');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingRoute(false);
      }
    }
  }, [dropoffCoordinate, getDirections, pickupCoordinate]);
  
  // Recuperer la route au chargement
  useEffect(() => {
    if (trip && !routeFetchedRef.current) {
      fetchRoute();
    }
  }, [trip, fetchRoute]);

  // Connexion WebSocket pour recevoir la position du conducteur
  useEffect(() => {
    if (!tripId || !isTripOngoing) {
      setIsSocketConnected(false);
      return;
    }

    let isCancelled = false;
    setIsSocketConnected(false);

    // Rejoindre la room du trip pour recevoir les updates
    trackingSocket
      .joinTrip(tripId)
      .then(() => {
        if (!isMountedRef.current || isCancelled) return;
        setIsSocketConnected(true);
        // Demander la position actuelle du conducteur
        trackingSocket.requestDriverLocation(tripId);
      })
      .catch((error) => {
        if (!isMountedRef.current || isCancelled) return;
        setIsSocketConnected(false);
        console.warn('[PassengerNavigation] Connexion tracking impossible:', error);
      });

    // Ecouter les mises a jour de position du conducteur
    const unsubscribeLocation = trackingSocket.subscribeToDriverLocation((payload: DriverLocationPayload) => {
      if (!isMountedRef.current) return;
      if (payload.tripId === tripId && payload.coordinates) {
        const coordinate = normalizeTripMapCoordinate(
          payload.coordinates[1],
          payload.coordinates[0],
        );
        if (!coordinate) return;

        setDriverLocation(coordinate);
        setLastUpdate(new Date());
      }
    });

    const unsubscribeAutoProgress = trackingSocket.subscribeToBookingAutoProgress((payload) => {
      if (!isMountedRef.current || payload.tripId !== tripId) return;
      const bookingEvents = payload.events.filter((event) => event.bookingId === bookingId);
      if (bookingEvents.some((event) => event.type === 'dropoff_confirmed')) {
        presentArrivalModal();
      }
      if (bookingEvents.length > 0) {
        refetchBooking();
      }
    });

    // Ecouter les erreurs
    const unsubscribeError = trackingSocket.subscribeToErrors((message) => {
      if (!isMountedRef.current || isCancelled) return;
      console.warn('[PassengerNavigation] Erreur tracking:', message);
    });

    // Demander la position toutes les 10 secondes
    const interval = setInterval(() => {
      trackingSocket.requestDriverLocation(tripId);
    }, 10000);

    return () => {
      isCancelled = true;
      trackingSocket.leaveTrip(tripId);
      unsubscribeLocation();
      unsubscribeAutoProgress();
      unsubscribeError();
      clearInterval(interval);
    };
  }, [bookingId, isTripOngoing, presentArrivalModal, refetchBooking, tripId]);

  useEffect(() => {
    if (!booking?.id || booking.status !== 'accepted' || !isTripOngoing || booking.droppedOff) {
      passengerLocationSubscriptionRef.current?.remove();
      passengerLocationSubscriptionRef.current = null;
      return;
    }

    let isCancelled = false;
    let lastSentAt = 0;
    const SEND_INTERVAL_MS = 8000;

    const sendLocation = async (location: Location.LocationObject) => {
      if (isCancelled || !isMountedRef.current) return;
      setPassengerLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const now = Date.now();
      if (now - lastSentAt < SEND_INTERVAL_MS) return;
      lastSentAt = now;

      try {
        const response = await updatePassengerLocation({
          bookingId: booking.id,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }).unwrap();

        void trackingSocket
          .updatePassengerLocation(tripId, booking.id, response.coordinates)
          .catch((error) => {
            console.warn('[PassengerNavigation] Relais temps reel indisponible:', error);
          });

        if (response.autoProgress?.events?.length && isMountedRef.current) {
          refetchBooking();
        }
      } catch (error) {
        console.warn('[PassengerNavigation] Position passager non envoyee:', error);
      }
    };

    const startPassengerLocationSharing = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          showDialog({
            variant: 'warning',
            title: 'Localisation requise',
            message:
              'Activez la localisation pour permettre la confirmation automatique de la prise en charge et de l arrivee.',
          });
          return;
        }

        let initialLocation: Location.LocationObject | null = null;
        try {
          initialLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        } catch {
          initialLocation = await Location.getLastKnownPositionAsync({});
        }

        if (initialLocation) {
          await sendLocation(initialLocation);
        }

        if (isCancelled || !isMountedRef.current) return;
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: SEND_INTERVAL_MS,
            distanceInterval: 10,
          },
          (location) => {
            void sendLocation(location);
          },
        );

        if (isCancelled || !isMountedRef.current) {
          subscription.remove();
          return;
        }

        passengerLocationSubscriptionRef.current = subscription;
      } catch (error) {
        console.warn('[PassengerNavigation] Suivi GPS passager indisponible:', error);
      }
    };

    void startPassengerLocationSharing();

    return () => {
      isCancelled = true;
      passengerLocationSubscriptionRef.current?.remove();
      passengerLocationSubscriptionRef.current = null;
    };
  }, [
    booking?.droppedOff,
    booking?.id,
    booking?.status,
    isTripOngoing,
    refetchBooking,
    showDialog,
    tripId,
    updatePassengerLocation,
  ]);

  useEffect(() => {
    if (
      !passengerLocation ||
      !dropoffCoordinate ||
      !booking?.pickedUp ||
      booking.droppedOff ||
      !isTripOngoing
    ) {
      return;
    }

    if (calculateDistance(passengerLocation, dropoffCoordinate) <= 0.06) {
      presentArrivalModal();
    }
  }, [
    booking?.droppedOff,
    booking?.pickedUp,
    dropoffCoordinate,
    isTripOngoing,
    passengerLocation,
    presentArrivalModal,
  ]);

  useEffect(() => {
    if (booking?.droppedOffConfirmedByPassenger || booking?.droppedOff) {
      presentArrivalModal();
    }
  }, [booking?.droppedOff, booking?.droppedOffConfirmedByPassenger, presentArrivalModal]);

  const routeAlignedDriver = useMemo(
    () =>
      driverLocation
        ? getRouteAlignedPosition(driverLocation, routeCoordinates, 0.1)
        : null,
    [driverLocation, routeCoordinates],
  );
  const displayedDriverLocation = routeAlignedDriver?.coordinate ?? driverLocation;
  const displayedDriverHeading = routeAlignedDriver?.heading ?? 0;

  // Calculer la region de la carte
  const mapRegion = useMemo(() => {
    const points: { latitude: number; longitude: number }[] = [];
    
    if (passengerLocation) points.push(passengerLocation);
    if (displayedDriverLocation) points.push(displayedDriverLocation);
    if (pickupCoordinate) points.push(pickupCoordinate);
    if (dropoffCoordinate) points.push(dropoffCoordinate);

    if (points.length === 0) {
      return {
        latitude: -4.441931,
        longitude: 15.266293,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
    }

    const lats = points.map(p => p.latitude);
    const lngs = points.map(p => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latDelta = Math.max((maxLat - minLat) * 1.5, 0.01);
    const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.01);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [displayedDriverLocation, passengerLocation, pickupCoordinate, dropoffCoordinate]);

  // Centrer sur le conducteur
  const centerOnDriver = () => {
    if (displayedDriverLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...displayedDriverLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  };

  // Centrer sur le passager
  const centerOnPassenger = () => {
    if (passengerLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...passengerLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  };
  
  // Centrer sur toute la route
  const fitToRoute = useCallback(() => {
    if (!mapRef.current) return;
    
    const coordinates: { latitude: number; longitude: number }[] = [];
    
    if (passengerLocation) coordinates.push(passengerLocation);
    if (displayedDriverLocation) coordinates.push(displayedDriverLocation);
    if (pickupCoordinate && !booking?.pickedUp) coordinates.push(pickupCoordinate);
    if (dropoffCoordinate) coordinates.push(dropoffCoordinate);
    if (routeCoordinates.length > 0) {
      coordinates.push(routeCoordinates[0]);
      coordinates.push(routeCoordinates[routeCoordinates.length - 1]);
    }
    
    if (coordinates.length >= 2) {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: {
          top: mapTopOffset + 24,
          right: 50,
          bottom: isMapExpanded ? 120 : 300,
          left: 50,
        },
        animated: true,
      });
    }
  }, [
    displayedDriverLocation,
    passengerLocation,
    pickupCoordinate,
    dropoffCoordinate,
    routeCoordinates,
    booking?.pickedUp,
    mapTopOffset,
    isMapExpanded,
  ]);

  const handleMapReady = useCallback(() => {
    if (hasFitInitialMapRef.current) return;
    hasFitInitialMapRef.current = true;

    requestAnimationFrame(() => {
      if (isMountedRef.current) {
        fitToRoute();
      }
    });
  }, [fitToRoute]);

  const handleFinishArrival = useCallback(async () => {
    if (!booking || isConfirmingArrival) return;

    try {
      if (!booking.droppedOffConfirmedByPassenger && !booking.droppedOff) {
        const request = booking.paymentMode
          ? { id: booking.id, paymentMode: booking.paymentMode }
          : booking.id;
        await confirmDropoffByPassenger(request).unwrap();
      }

      await refetchBooking();
      setArrivalModalVisible(false);
      void Speech.stop();
      router.replace(`/rate/${tripId}`);
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        "Impossible de terminer le trajet pour le moment.";
      showDialog({
        variant: 'danger',
        title: "Validation impossible",
        message: Array.isArray(message) ? message.join('\n') : message,
      });
    }
  }, [
    booking,
    confirmDropoffByPassenger,
    isConfirmingArrival,
    refetchBooking,
    router,
    showDialog,
    tripId,
  ]);

  // Etat du trajet pour le passager
  const tripStatus = useMemo(() => {
    if (!booking || !trip) return 'loading';
    if (trip.status !== 'ongoing') return 'not_started';
    if (booking.droppedOff) return 'completed';
    if (booking.droppedOffConfirmedByPassenger) return 'awaiting_dropoff_confirmation';
    if (booking.pickedUp && !booking.pickedUpConfirmedByPassenger) return 'pickup_confirmation_needed';
    if (booking.pickedUp) return 'in_transit';
    return 'waiting_pickup';
  }, [booking, trip]);

  // Loading
  if (bookingLoading || tripLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  // Erreur
  if (!booking || !trip) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar barStyle="dark-content" />
        <Ionicons name="alert-circle" size={64} color={Colors.danger} />
        <Text style={styles.errorText}>Reservation introuvable</Text>
        <TouchableOpacity style={styles.backButton} onPress={navigateBackSafely}>
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      
      {/* Carte */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={[styles.map, { top: mapTopOffset }]}
        initialRegion={mapRegion}
        mapType="standard"
        onMapReady={handleMapReady}
        showsUserLocation={!passengerLocation}
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        showsPointsOfInterest={false}
      >
        {/* Position du passager */}
        {passengerLocation && (
          <Marker
            ref={passengerMarkerRef}
            coordinate={passengerLocation}
            anchor={PASSENGER_TRACKING_MARKER_ANCHOR}
            title="Votre position"
            description={booking.pickedUp ? 'Vous êtes à bord' : 'Votre position actuelle'}
            tracksViewChanges={IS_ANDROID && !loadedMarkerKeys.has('passenger-location')}
            zIndex={25}
          >
            <PassengerTrackingMarker
              status={booking.pickedUp ? 'live' : 'pickup'}
              onReady={() => handleTrackingMarkerReady('passenger-location', passengerMarkerRef)}
            />
          </Marker>
        )}

        {/* Position du conducteur */}
        {displayedDriverLocation && (
          <Marker
            ref={driverMarkerRef}
            coordinate={displayedDriverLocation}
            anchor={VEHICLE_TRACKING_MARKER_ANCHOR}
            title="Conducteur"
            description="Voiture qui vient vous chercher"
            image={IS_ANDROID ? getVehicleTrackingMarkerImage(trip.vehicleType) : undefined}
            flat
            rotation={displayedDriverHeading}
            tracksViewChanges={false}
            zIndex={30}
          >
            {!IS_ANDROID && (
              <VehicleTrackingMarker
                vehicleType={trip.vehicleType}
                onReady={() => handleTrackingMarkerReady('driver-location', driverMarkerRef)}
              />
            )}
          </Marker>
        )}

        {/* Point de recuperation */}
        {pickupCoordinate && !booking.pickedUp && (
          <Marker
            ref={pickupMarkerRef}
            coordinate={pickupCoordinate}
            anchor={PASSENGER_TRACKING_MARKER_ANCHOR}
            title="Point de prise en charge"
            description={booking.passengerOrigin || trip.departure.address}
            tracksViewChanges={IS_ANDROID && !loadedMarkerKeys.has('pickup-location')}
            zIndex={22}
          >
            <PassengerTrackingMarker
              status="pickup"
              onReady={() => handleTrackingMarkerReady('pickup-location', pickupMarkerRef)}
            />
          </Marker>
        )}

        {/* Point d'arrivee */}
        {dropoffCoordinate && (
          <Marker
            ref={dropoffMarkerRef}
            coordinate={dropoffCoordinate}
            anchor={PASSENGER_TRACKING_MARKER_ANCHOR}
            title="Destination"
            description={booking.passengerDestination || trip.arrival.address}
            tracksViewChanges={IS_ANDROID && !loadedMarkerKeys.has('dropoff-location')}
            zIndex={21}
          >
            <PassengerTrackingMarker
              status="arrived"
              onReady={() => handleTrackingMarkerReady('dropoff-location', dropoffMarkerRef)}
            />
          </Marker>
        )}
        {/* Route complete */}
        {routeCoordinates.length > 1 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={Colors.primary}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Ligne entre la voiture et le passager avant la prise en charge */}
        {displayedDriverLocation && !booking.pickedUp && (passengerLocation || pickupCoordinate) && (
          <Polyline
            coordinates={[displayedDriverLocation, passengerLocation ?? pickupCoordinate!]}
            strokeColor={Colors.info}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        )}
      </MapView>

      {/* Boutons flottants */}
      <View style={[styles.floatingButtons, { top: insets.top + 70 }]}>
        <TouchableOpacity
          style={[styles.floatingButton, isMapExpanded && styles.floatingButtonActive]}
          onPress={() => setIsMapExpanded((prev) => !prev)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isMapExpanded ? 'contract-outline' : 'expand-outline'}
            size={22}
            color={isMapExpanded ? Colors.primary : Colors.gray[700]}
          />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.floatingButton} 
          onPress={fitToRoute}
          activeOpacity={0.8}
        >
          <Ionicons name="map-outline" size={22} color={Colors.gray[700]} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.floatingButton, !passengerLocation && styles.floatingButtonDisabled]}
          onPress={centerOnPassenger}
          disabled={!passengerLocation}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={22} color={passengerLocation ? Colors.primary : Colors.gray[400]} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.floatingButton, !driverLocation && styles.floatingButtonDisabled]}
          onPress={centerOnDriver}
          disabled={!driverLocation}
          activeOpacity={0.8}
        >
          <Ionicons name="car-sport" size={22} color={driverLocation ? Colors.info : Colors.gray[400]} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.floatingButton, isLoadingRoute && styles.floatingButtonLoading]} 
          onPress={() => {
            routeFetchedRef.current = false;
            lastRouteFetchRef.current = 0;
            fetchRoute();
          }}
          disabled={isLoadingRoute}
          activeOpacity={0.8}
        >
          {isLoadingRoute ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="refresh-outline" size={22} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Header */}
      <Animated.View 
        entering={FadeInDown.duration(300)} 
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity style={styles.headerButton} onPress={navigateBackSafely}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[800]} />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {tripStatus === 'waiting_pickup' ? 'En attente de recuperation' : 
             tripStatus === 'pickup_confirmation_needed' ? 'Recuperation detectee' :
             tripStatus === 'in_transit' ? 'En route' :
             tripStatus === 'awaiting_dropoff_confirmation' ? 'Arrivee detectee' :
             tripStatus === 'completed' ? 'Arrive' : 'Suivi du trajet'}
          </Text>
          {isSocketConnected && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.headerButton, !passengerLocation && styles.headerButtonDisabled]}
          onPress={centerOnPassenger}
          disabled={!passengerLocation}
        >
          <Ionicons name="locate" size={24} color={passengerLocation ? Colors.primary : Colors.gray[400]} />
        </TouchableOpacity>
      </Animated.View>

      {/* Info Card */}
      {!isMapExpanded && (
      <Animated.View 
        entering={FadeInUp.duration(300).delay(100)} 
        style={[styles.infoCard, { paddingBottom: insets.bottom + 16 }]}
      >
        {/* Projection du trajet (compact) */}
        <View style={styles.routeInfo}>
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: Colors.secondary }]} />
            <Text style={styles.routeText} numberOfLines={1}>
              {booking.passengerOrigin || trip.departure.address}
            </Text>
            {!booking.pickedUp && <View style={styles.currentIndicator} />}
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: Colors.primary }]} />
            <Text style={styles.routeText} numberOfLines={1}>
              {booking.passengerDestination || trip.arrival.address}
            </Text>
            {booking.pickedUp && !booking.droppedOff && <View style={styles.currentIndicator} />}
          </View>
        </View>

        {routeInfo && (
          <View style={styles.routeStats}>
            <View style={styles.routeStat}>
              <Ionicons name="navigate-outline" size={18} color={Colors.primary} />
              <Text style={styles.routeStatValue}>{routeInfo.distance}</Text>
              <Text style={styles.routeStatLabel}>Distance</Text>
            </View>
            <View style={styles.routeStatDivider} />
            <View style={styles.routeStat}>
              <Ionicons name="time-outline" size={18} color={Colors.secondary} />
              <Text style={styles.routeStatValue}>{routeInfo.duration}</Text>
              <Text style={styles.routeStatLabel}>Projection</Text>
            </View>
            {isSocketConnected && (
              <>
                <View style={styles.routeStatDivider} />
                <View style={styles.routeStat}>
                  <View style={styles.liveStatDot} />
                  <Text style={[styles.routeStatValue, { color: Colors.success }]}>En direct</Text>
                  <Text style={styles.routeStatLabel}>Tracking</Text>
                </View>
              </>
            )}
          </View>
        )}

        {isLoadingRoute && !routeInfo && (
          <View style={styles.routeLoadingRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.routeLoadingText}>Chargement de l&apos;itineraire...</Text>
          </View>
        )}

        <View style={styles.statusRow}>
          {lastUpdate && (
            <Text style={styles.lastUpdateText}>
              Position mise a jour : {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </Text>
          )}
          {!driverLocation && tripStatus !== 'not_started' && (
            <Text style={styles.waitingText}>En attente de la position du conducteur...</Text>
          )}
        </View>

        {/* Etat automatique du trajet */}
        {trip.status === 'ongoing' && (
          <View style={styles.actionButtons}>
            {!booking.pickedUp && (
              <View style={styles.completedBadge}>
                <Ionicons name="locate" size={24} color={Colors.primary} />
                <Text style={styles.completedText}>En attente de la prise en charge</Text>
              </View>
            )}

            {booking.pickedUp && !booking.pickedUpConfirmedByPassenger && (
              <View style={styles.completedBadge}>
                <Ionicons name="sync" size={24} color={Colors.secondary} />
                <Text style={styles.completedText}>Confirmation de la prise en charge</Text>
              </View>
            )}

            {booking.pickedUp && booking.pickedUpConfirmedByPassenger && !booking.droppedOffConfirmedByPassenger && !booking.droppedOff && (
              <View style={styles.completedBadge}>
                <Ionicons name="navigate" size={24} color={Colors.primary} />
                <Text style={styles.completedText}>Arrivee en cours au point de depose</Text>
              </View>
            )}

            {booking.droppedOffConfirmedByPassenger && !booking.droppedOff && (
              <View style={styles.completedBadge}>
                <Ionicons name="hourglass" size={24} color={Colors.secondary} />
                <Text style={styles.completedText}>Finalisation de l arrivee</Text>
              </View>
            )}

            {booking.droppedOff && (
              <View style={styles.completedBadge}>
                <Ionicons name="checkmark-done" size={24} color={Colors.success} />
                <Text style={styles.completedText}>Trajet termine</Text>
              </View>
            )}
          </View>
        )}

        {trip.status !== 'ongoing' && (
          <View style={styles.notStartedBadge}>
            <Ionicons name="time" size={20} color={Colors.secondary} />
            <Text style={styles.notStartedText}>Le trajet n&apos;a pas encore demarre</Text>
          </View>
        )}
      </Animated.View>
      )}

      <Modal
        visible={arrivalModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setArrivalModalVisible(false)}
      >
        <View style={styles.arrivalModalOverlay}>
          <View
            style={[
              styles.arrivalModalContent,
              { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.md },
            ]}
          >
            <View style={styles.arrivalModalHandle} />
            <View style={styles.arrivalModalIcon}>
              <Ionicons name="flag" size={30} color={Colors.white} />
            </View>
            <Text style={styles.arrivalModalTitle}>Vous êtes arrivé</Text>
            <Text style={styles.arrivalModalText}>
              Validez votre arrivée à la destination choisie pendant la réservation.
            </Text>
            <View style={styles.arrivalModalAddressRow}>
              <Ionicons name="location" size={18} color={Colors.primary} />
              <Text style={styles.arrivalModalAddress} numberOfLines={2}>
                {booking.passengerDestination || trip.arrival.address}
              </Text>
            </View>
            <View style={styles.arrivalModalGpsStatus}>
              <Ionicons name="locate" size={18} color={Colors.success} />
              <Text style={styles.arrivalModalGpsStatusText}>Arrivée détectée par GPS</Text>
            </View>
            <Text style={styles.arrivalModalHint}>
              Après validation, vous pourrez noter le conducteur.
            </Text>
            <View style={styles.arrivalModalActions}>
              <TouchableOpacity
                style={styles.arrivalModalLaterButton}
                onPress={() => setArrivalModalVisible(false)}
                disabled={isConfirmingArrival}
              >
                <Text style={styles.arrivalModalLaterButtonText}>Plus tard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.arrivalModalFinishButton}
                onPress={() => void handleFinishArrival()}
                disabled={isConfirmingArrival}
              >
                {isConfirmingArrival ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
                    <Text style={styles.arrivalModalFinishButtonText}>Terminer</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[100],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[600],
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.xl,
  },
  errorText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.lg,
    color: Colors.gray[700],
    textAlign: 'center',
  },
  backButton: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
  },
  backButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingButtons: {
    position: 'absolute',
    right: Spacing.md,
    gap: Spacing.sm,
    zIndex: 10,
  },
  floatingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingButtonLoading: {
    opacity: 0.7,
  },
  floatingButtonDisabled: {
    opacity: 0.55,
  },
  floatingButtonActive: {
    borderWidth: 1,
    borderColor: Colors.primary + '33',
    backgroundColor: Colors.primary + '10',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomLeftRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonDisabled: {
    opacity: 0.6,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
    marginRight: 4,
  },
  liveText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.success,
  },
  infoCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverAvatarText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  driverDetails: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  driverName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  vehicleInfo: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 2,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.success + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  routeStat: {
    alignItems: 'center',
    gap: 4,
  },
  routeStatValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  routeStatLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  routeStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.gray[200],
  },
  liveStatDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
  },
  routeLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  routeLoadingText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  statusRow: {
    marginBottom: Spacing.md,
  },
  lastUpdateText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textAlign: 'center',
  },
  waitingText: {
    fontSize: FontSizes.sm,
    color: Colors.secondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  routeInfo: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.sm,
  },
  routeText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: Colors.gray[300],
    marginLeft: 5,
    marginVertical: 4,
  },
  currentIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.info,
    marginLeft: Spacing.sm,
  },
  actionButtons: {
    marginTop: Spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  pickupButton: {
    backgroundColor: Colors.secondary,
  },
  dropoffButton: {
    backgroundColor: Colors.success,
  },
  reportButton: {
    backgroundColor: Colors.danger,
    marginBottom: Spacing.sm,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  completedText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.success,
  },
  notStartedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.secondary + '15',
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  notStartedText: {
    fontSize: FontSizes.sm,
    color: Colors.secondary,
    fontWeight: FontWeights.medium,
  },
  driverMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.info,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  passengerMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary + '25',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  passengerMarkerInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  pickupMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  dropoffMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  arrivalModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  arrivalModalContent: {
    width: '100%',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    alignItems: 'center',
  },
  arrivalModalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.gray[300],
  },
  arrivalModalIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    backgroundColor: Colors.success,
  },
  arrivalModalTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  arrivalModalText: {
    marginTop: Spacing.xs,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  arrivalModalAddressRow: {
    width: '100%',
    minHeight: 48,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[100],
  },
  arrivalModalAddress: {
    flex: 1,
    color: Colors.gray[800],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  arrivalModalGpsStatus: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  arrivalModalGpsStatusText: {
    color: Colors.success,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  arrivalModalHint: {
    marginTop: Spacing.md,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    textAlign: 'center',
  },
  arrivalModalActions: {
    width: '100%',
    marginTop: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.md,
  },
  arrivalModalLaterButton: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  arrivalModalLaterButtonText: {
    color: Colors.gray[700],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
  },
  arrivalModalFinishButton: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.success,
  },
  arrivalModalFinishButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
});
