import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useConfirmDropoffMutation,
  useConfirmPickupMutation,
  useGetTripBookingsQuery
} from '@/store/api/bookingApi';
import { useGetTripByIdQuery, useUpdateDriverLocationMutation } from '@/store/api/tripApi';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

interface RouteStep {
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  end_location: { lat: number; lng: number };
  html_instructions: string;
  maneuver?: string;
  polyline: { points: string };
  start_location: { lat: number; lng: number };
  travel_mode: string;
}

interface DirectionsResponse {
  routes: Array<{
    legs: Array<{
      distance: { text: string; value: number };
      duration: { text: string; value: number };
      steps: RouteStep[];
      start_location: { lat: number; lng: number };
      end_location: { lat: number; lng: number };
    }>;
    overview_polyline: { points: string };
  }>;
}

interface Waypoint {
  id: string;
  type: 'pickup' | 'dropoff';
  location: { lat: number; lng: number };
  address: string;
  passenger: {
    id: string;
    name: string;
    phone?: string;
  };
  booking: Booking;
  completed: boolean;
}

export default function NavigationScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { showDialog } = useDialog();
  const insets = useSafeAreaInsets();
  const tripId = typeof id === 'string' ? id : '';

  const { data: trip, isLoading } = useGetTripByIdQuery(tripId, { skip: !tripId });
  const { data: bookings, isLoading: bookingsLoading, refetch: refetchBookings } = useGetTripBookingsQuery(tripId, { skip: !tripId });
  const [updateDriverLocation] = useUpdateDriverLocationMutation();
  const [confirmPickup, { isLoading: isConfirmingPickup }] = useConfirmPickupMutation();
  const [confirmDropoff, { isLoading: isConfirmingDropoff }] = useConfirmDropoffMutation();

  const mapRef = useRef<MapView>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [currentLegIndex, setCurrentLegIndex] = useState(0);
  const [totalDistance, setTotalDistance] = useState<string>('');
  const [totalDuration, setTotalDuration] = useState<string>('');
  const [isLoadingRoute, setIsLoadingRoute] = useState(true);
  const [heading, setHeading] = useState<number>(0);
  
  // Modal pour les waypoints
  const [waypointModalVisible, setWaypointModalVisible] = useState(false);
  const [activeWaypoint, setActiveWaypoint] = useState<Waypoint | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  
  // Refs pour éviter les re-rendus excessifs
  const routeFetchedRef = useRef(false);
  const lastRouteFetchTimeRef = useRef(0);
  const waypointsCountRef = useRef(0);
  const currentLocationRef = useRef<Location.LocationObject | null>(null);

  // Créer les waypoints à partir des bookings acceptés
  useEffect(() => {
    if (!bookings || !trip) return;

    // Vérifier que les coordonnées du trip sont valides
    const hasDeparture = trip.departure?.lat && trip.departure?.lng;
    const hasArrival = trip.arrival?.lat && trip.arrival?.lng;
    
    if (!hasDeparture || !hasArrival) {
      console.log('Coordonnées du trajet invalides');
      return;
    }

    const acceptedBookings = bookings.filter(b => b.status === 'accepted');
    const waypointsList: Waypoint[] = [];

    acceptedBookings.forEach((booking) => {
      try {
        // Point de récupération du passager (toujours le départ du trip)
        const pickupLocation = { lat: trip.departure.lat, lng: trip.departure.lng };

        waypointsList.push({
          id: `pickup-${booking.id}`,
          type: 'pickup',
          location: pickupLocation,
          address: trip.departure.address || '',
          passenger: {
            id: booking.passengerId,
            name: booking.passengerName || 'Passager',
            phone: booking.passengerPhone,
          },
          booking,
          completed: booking.pickedUp || false,
        });

        // Point de dépose du passager (destination personnalisée ou arrivée du trip)
        let dropoffLocation = { lat: trip.arrival.lat, lng: trip.arrival.lng };
        
        if (booking.passengerDestinationCoordinates?.latitude && booking.passengerDestinationCoordinates?.longitude) {
          dropoffLocation = { 
            lat: booking.passengerDestinationCoordinates.latitude, 
            lng: booking.passengerDestinationCoordinates.longitude 
          };
        }

        waypointsList.push({
          id: `dropoff-${booking.id}`,
          type: 'dropoff',
          location: dropoffLocation,
          address: booking.passengerDestination || trip.arrival.address || '',
          passenger: {
            id: booking.passengerId,
            name: booking.passengerName || 'Passager',
            phone: booking.passengerPhone,
          },
          booking,
          completed: booking.droppedOff || false,
        });
      } catch (error) {
        console.log('Erreur création waypoint pour booking:', booking.id, error);
      }
    });

    setWaypoints(waypointsList);

    // Trouver le prochain waypoint non complété
    const nextIncompleteIndex = waypointsList.findIndex(wp => !wp.completed);
    if (nextIncompleteIndex !== -1) {
      setCurrentWaypointIndex(nextIncompleteIndex);
    }
  }, [bookings, trip]);

  // Demander les permissions de localisation
  useEffect(() => {
    (async () => {
      try {
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
          showDialog({
            title: 'Permission refusée',
            message: 'L\'accès à la localisation est nécessaire pour la navigation GPS.',
            variant: 'warning',
            icon: 'location-outline',
            actions: [
              { label: 'Retour', onPress: () => router.back() }
            ],
          });
          return;
        }

        // Tenter de demander la permission de localisation en arrière-plan (optionnel)
        // Cette permission n'est pas toujours disponible/configurée
        try {
          const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
          if (backgroundStatus !== 'granted') {
            console.log('Permission de localisation en arrière-plan non accordée - mode premier plan uniquement');
          }
        } catch (bgError) {
          // La permission de localisation en arrière-plan n'est pas configurée dans le manifest
          console.log('Localisation en arrière-plan non disponible:', bgError);
        }

        // Obtenir la position initiale
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setCurrentLocation(location);

      // Variables pour throttling des mises à jour
      let lastStateUpdateTime = 0;
      let lastBackendUpdateTime = 0;
      const STATE_UPDATE_INTERVAL = 5000; // Mise à jour du state toutes les 5 secondes
      const BACKEND_UPDATE_INTERVAL = 10000; // Mise à jour backend toutes les 10 secondes

      // S'abonner aux mises à jour de localisation en temps réel
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000, // GPS update toutes les 2 secondes
          distanceInterval: 10, // Ou tous les 10 mètres
        },
        (newLocation) => {
          const now = Date.now();
          
          // Toujours stocker dans la ref pour les calculs internes
          currentLocationRef.current = newLocation;
          
          // Mettre à jour le state seulement périodiquement (pour éviter trop de re-rendus)
          if (now - lastStateUpdateTime > STATE_UPDATE_INTERVAL) {
            lastStateUpdateTime = now;
            setCurrentLocation(newLocation);
            
            // Mettre à jour le cap (heading)
            if (newLocation.coords.heading !== null && newLocation.coords.heading !== -1) {
              setHeading(newLocation.coords.heading);
            }
          }

          // Mettre à jour la position du conducteur dans le backend (throttled)
          if (tripId && now - lastBackendUpdateTime > BACKEND_UPDATE_INTERVAL) {
            lastBackendUpdateTime = now;
            updateDriverLocation({
              tripId,
              coordinates: [newLocation.coords.longitude, newLocation.coords.latitude],
            }).catch(err => console.error('Erreur mise à jour position:', err));
          }

          // Centrer la carte sur la position actuelle (smooth, pas de re-render)
          if (mapRef.current) {
            mapRef.current.animateCamera({
              center: {
                latitude: newLocation.coords.latitude,
                longitude: newLocation.coords.longitude,
              },
              heading: newLocation.coords.heading || 0,
              pitch: 60,
              zoom: 18,
            }, { duration: 800 });
          }

          // Calculer la distance à chaque étape et mettre à jour l'étape actuelle
          updateCurrentStep(newLocation);
        }
      );
      locationSubscription.current = subscription;
      } catch (error) {
        console.error('Erreur lors de l\'initialisation de la localisation:', error);
        showDialog({
          title: 'Erreur de localisation',
          message: 'Impossible d\'activer le GPS. Vérifiez que la localisation est activée sur votre appareil.',
          variant: 'danger',
          icon: 'location-outline',
          actions: [
            { label: 'Réessayer', onPress: () => router.replace(`/trip/navigate/${tripId}`) },
            { label: 'Retour', variant: 'secondary', onPress: () => router.back() },
          ],
        });
      }
    })();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, [tripId]);

  // Récupérer l'itinéraire depuis Google Directions API (une seule fois au démarrage et quand les waypoints changent)
  useEffect(() => {
    const now = Date.now();
    const waypointsChanged = waypoints.length !== waypointsCountRef.current;
    const timeSinceLastFetch = now - lastRouteFetchTimeRef.current;
    
    // Ne fetch que si:
    // 1. On a une location et un trip
    // 2. ET (le route n'a jamais été fetch OU les waypoints ont changé)
    // 3. ET au moins 30 secondes se sont écoulées depuis le dernier fetch
    if (currentLocation && trip && 
        (!routeFetchedRef.current || waypointsChanged) && 
        timeSinceLastFetch > 30000) {
      routeFetchedRef.current = true;
      waypointsCountRef.current = waypoints.length;
      lastRouteFetchTimeRef.current = now;
      fetchRoute();
    }
  }, [currentLocation, trip, waypoints.length]);

  const fetchRoute = async () => {
    if (!currentLocation || !trip) return;

    setIsLoadingRoute(true);
    try {
      const origin = `${currentLocation.coords.latitude},${currentLocation.coords.longitude}`;
      const destination = `${trip.arrival.lat},${trip.arrival.lng}`;
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

      // Construire les waypoints non complétés pour l'API
      const incompletWaypoints = waypoints.filter(wp => !wp.completed);
      let waypointsParam = '';
      
      if (incompletWaypoints.length > 0) {
        const waypointCoords = incompletWaypoints
          .map(wp => `${wp.location.lat},${wp.location.lng}`)
          .join('|');
        waypointsParam = `&waypoints=optimize:true|${waypointCoords}`;
      }

      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypointsParam}&key=${apiKey}&mode=driving&alternatives=false&language=fr`;
      
      const response = await fetch(url);
      const data: DirectionsResponse = await response.json();

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];

        // Décoder le polyline
        const points = decodePolyline(route.overview_polyline.points);
        setRouteCoordinates(points);

        // Calculer la distance et durée totales
        let totalDist = 0;
        let totalDur = 0;
        route.legs.forEach(leg => {
          totalDist += leg.distance.value;
          totalDur += leg.duration.value;
        });

        setTotalDistance(`${(totalDist / 1000).toFixed(1)} km`);
        setTotalDuration(`${Math.round(totalDur / 60)} min`);

        // Stocker les étapes du premier leg (segment actuel)
        if (route.legs.length > 0) {
          setSteps(route.legs[currentLegIndex]?.steps || route.legs[0].steps);
          setCurrentStepIndex(0);
        }

        // Ajuster la vue de la carte pour afficher tout l'itinéraire
        if (mapRef.current && points.length > 0) {
          mapRef.current.fitToCoordinates(points, {
            edgePadding: { top: 150, right: 50, bottom: 300, left: 50 },
            animated: true,
          });
        }
      }
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'itinéraire:', error);
      showDialog({
        title: 'Erreur de navigation',
        message: 'Impossible de charger l\'itinéraire. Vérifiez votre connexion internet.',
        variant: 'danger',
        icon: 'map-outline',
        actions: [
          { label: 'Réessayer', onPress: () => fetchRoute() },
          { label: 'Fermer', variant: 'secondary' },
        ],
      });
    } finally {
      setIsLoadingRoute(false);
    }
  };

  // Mettre à jour l'étape actuelle en fonction de la position
  const updateCurrentStep = (location: Location.LocationObject) => {
    if (steps.length === 0) return;

    const currentCoords = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };

    // Vérifier si on est proche du prochain waypoint
    if (waypoints.length > 0 && currentWaypointIndex < waypoints.length) {
      const nextWaypoint = waypoints[currentWaypointIndex];
      if (!nextWaypoint.completed) {
        const waypointCoords = {
          latitude: nextWaypoint.location.lat,
          longitude: nextWaypoint.location.lng,
        };
        const distanceToWaypoint = calculateDistance(currentCoords, waypointCoords);

        // Si on est à moins de 50 mètres du waypoint, notifier le conducteur
        if (distanceToWaypoint < 0.05 && !waypointModalVisible) {
          setActiveWaypoint(nextWaypoint);
          setWaypointModalVisible(true);
        }
      }
    }

    // Trouver l'étape la plus proche
    for (let i = currentStepIndex; i < steps.length; i++) {
      const stepEnd = {
        latitude: steps[i].end_location.lat,
        longitude: steps[i].end_location.lng,
      };

      const distance = calculateDistance(currentCoords, stepEnd);

      // Si on est à moins de 30 mètres de la fin de l'étape, passer à la suivante
      if (distance < 0.03 && i < steps.length - 1) {
        setCurrentStepIndex(i + 1);
        // Jouer un son de notification
        playInstructionSound();
      }
    }
  };

  // Calculer la distance entre deux points (en km)
  const calculateDistance = (
    point1: { latitude: number; longitude: number },
    point2: { latitude: number; longitude: number }
  ): number => {
    const R = 6371; // Rayon de la Terre en km
    const dLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
    const dLon = ((point2.longitude - point1.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((point1.latitude * Math.PI) / 180) *
        Math.cos((point2.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Notification sonore/vibration (optionnel)
  const playInstructionSound = () => {
    // TODO: Ajouter expo-haptics pour les vibrations
    // import * as Haptics from 'expo-haptics';
    // Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // Ou utiliser expo-audio (remplaçant d'expo-av) pour les sons personnalisés
    // import { Audio } from 'expo-audio';
  };

  // Forcer le recalcul de l'itinéraire
  const forceRecalculateRoute = () => {
    lastRouteFetchTimeRef.current = 0; // Reset le timestamp
    routeFetchedRef.current = false; // Permettre un nouveau fetch
    if (currentLocation && trip) {
      fetchRoute();
    }
  };

  // Confirmer le waypoint (récupération ou dépose du passager)
  const handleConfirmWaypoint = async () => {
    if (!activeWaypoint) return;
    
    const bookingId = activeWaypoint.booking.id;
    
    try {
      if (activeWaypoint.type === 'pickup') {
        // Confirmer la récupération du passager
        await confirmPickup(bookingId).unwrap();
        showDialog({
          title: 'Passager récupéré ✅',
          message: `${activeWaypoint.passenger.name} a été récupéré avec succès.`,
          variant: 'success',
          icon: 'person-add',
        });
      } else {
        // Confirmer la dépose du passager
        await confirmDropoff(bookingId).unwrap();
        showDialog({
          title: 'Passager déposé ✅',
          message: `${activeWaypoint.passenger.name} a été déposé avec succès.`,
          variant: 'success',
          icon: 'checkmark-circle',
        });
      }
      
      // Rafraîchir les bookings pour mettre à jour l'état
      refetchBookings();
      
      // Marquer le waypoint comme complété localement
      const updatedWaypoints = [...waypoints];
      const waypointIndex = updatedWaypoints.findIndex(wp => wp.id === activeWaypoint.id);
      if (waypointIndex !== -1) {
        updatedWaypoints[waypointIndex].completed = true;
        setWaypoints(updatedWaypoints);
      }
      
      // Passer au waypoint suivant
      if (currentWaypointIndex < waypoints.length - 1) {
        setCurrentWaypointIndex(currentWaypointIndex + 1);
        setCurrentLegIndex(currentLegIndex + 1);
      }
      
      playInstructionSound();
      
      // Recalculer l'itinéraire après confirmation d'un waypoint
      setTimeout(() => forceRecalculateRoute(), 1000);
      
    } catch (error: any) {
      const message = error?.data?.message || error?.message || 'Une erreur est survenue';
      showDialog({
        title: 'Erreur',
        message,
        variant: 'danger',
        icon: 'alert-circle',
      });
    } finally {
      setWaypointModalVisible(false);
      setActiveWaypoint(null);
    }
  };

  // Fermer le modal de waypoint sans confirmer
  const handleDismissWaypointModal = () => {
    setWaypointModalVisible(false);
    setActiveWaypoint(null);
  };

  // Quitter la navigation
  const handleExitNavigation = () => {
    showDialog({
      title: 'Quitter la navigation',
      message: 'Voulez-vous vraiment quitter la navigation GPS ?',
      variant: 'warning',
      icon: 'exit-outline',
      actions: [
        { label: 'Quitter', variant: 'primary', onPress: () => router.back() },
        { label: 'Annuler', variant: 'secondary' },
      ],
    });
  };

  // Décoder un polyline Google
  const decodePolyline = (encoded: string): Array<{ latitude: number; longitude: number }> => {
    const points: Array<{ latitude: number; longitude: number }> = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return points;
  };

  // Nettoyer les balises HTML des instructions
  const cleanHtmlInstructions = (html: string): string => {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  };

  // Obtenir l'icône de manœuvre
  const getManeuverIcon = (maneuver?: string): string => {
    if (!maneuver) return 'arrow-up';
    
    const maneuverMap: Record<string, string> = {
      'turn-left': 'arrow-back',
      'turn-right': 'arrow-forward',
      'turn-slight-left': 'arrow-back',
      'turn-slight-right': 'arrow-forward',
      'turn-sharp-left': 'arrow-back',
      'turn-sharp-right': 'arrow-forward',
      'uturn-left': 'return-up-back',
      'uturn-right': 'return-up-forward',
      'straight': 'arrow-up',
      'ramp-left': 'arrow-back',
      'ramp-right': 'arrow-forward',
      'merge': 'git-merge',
      'fork-left': 'git-branch',
      'fork-right': 'git-branch',
      'roundabout-left': 'refresh',
      'roundabout-right': 'refresh',
    };

    return maneuverMap[maneuver] || 'arrow-up';
  };

  // Vérifier que le trip est chargé et a des coordonnées valides
  const hasValidTripCoordinates = trip?.departure?.lat !== 0 && trip?.departure?.lng !== 0 &&
                                   trip?.arrival?.lat !== 0 && trip?.arrival?.lng !== 0;

  if (isLoading || bookingsLoading || !trip) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Chargement de la navigation...</Text>
      </View>
    );
  }

  if (!hasValidTripCoordinates) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="warning" size={48} color={Colors.warning} />
        <Text style={styles.loadingText}>Coordonnées du trajet invalides</Text>
        <TouchableOpacity
          style={styles.backButtonAlt}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonAltText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentStep = steps[currentStepIndex];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Carte */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={true}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        pitchEnabled={true}
        rotateEnabled={true}
        initialRegion={{
          latitude: currentLocation?.coords?.latitude ?? trip?.departure?.lat ?? -4.4419,
          longitude: currentLocation?.coords?.longitude ?? trip?.departure?.lng ?? 15.2663,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {/* Itinéraire */}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeWidth={5}
            strokeColor={Colors.primary}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Position actuelle du conducteur */}
        {currentLocation && currentLocation.coords && currentLocation.coords.latitude && currentLocation.coords.longitude && (
          <Marker
            coordinate={{
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.driverMarker}>
              <View style={styles.driverMarkerInner}>
                <Ionicons name="navigate" size={20} color="#FFFFFF" />
              </View>
            </View>
          </Marker>
        )}

        {/* Waypoints (points de récupération et dépose) */}
        {waypoints
          .filter(wp => wp.location?.lat && wp.location?.lng)
          .map((waypoint) => (
          <Marker
            key={waypoint.id}
            coordinate={{
              latitude: waypoint.location.lat,
              longitude: waypoint.location.lng,
            }}
            title={`${waypoint.type === 'pickup' ? 'Récupérer' : 'Déposer'} ${waypoint.passenger.name}`}
            description={waypoint.address || ''}
          >
            <View style={[
              styles.waypointMarkerContainer,
              waypoint.type === 'pickup' ? styles.pickupMarker : styles.dropoffMarker,
              waypoint.completed ? styles.completedMarker : null,
            ]}>
              <Ionicons 
                name={waypoint.completed ? 'checkmark' : (waypoint.type === 'pickup' ? 'person-add' : 'person-remove')} 
                size={20} 
                color="#FFFFFF" 
              />
            </View>
          </Marker>
        ))}

        {/* Destination finale */}
        {trip?.arrival?.lat && trip?.arrival?.lng && (
          <Marker
            coordinate={{
              latitude: trip.arrival.lat,
              longitude: trip.arrival.lng,
            }}
            title={trip.arrival.name || 'Destination'}
            description={trip.arrival.address || ''}
          >
            <View style={styles.destinationMarker}>
              <Ionicons name="flag" size={24} color="#FFFFFF" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Header avec infos */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleExitNavigation}
        >
          <Ionicons name="close" size={28} color={Colors.white} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.etaText}>{totalDuration}</Text>
          <Text style={styles.distanceText}>{totalDistance}</Text>
        </View>
      </View>

      {/* Prochain waypoint */}
      {waypoints.length > 0 && currentWaypointIndex < waypoints.length && !waypoints[currentWaypointIndex].completed && (
        <TouchableOpacity 
          style={styles.waypointCard}
          activeOpacity={0.9}
          onPress={() => {
            setActiveWaypoint(waypoints[currentWaypointIndex]);
            setWaypointModalVisible(true);
          }}
        >
          <View style={styles.waypointHeader}>
            <View style={[
              styles.waypointIcon,
              { backgroundColor: waypoints[currentWaypointIndex].type === 'pickup' ? Colors.secondary : Colors.info }
            ]}>
              <Ionicons 
                name={waypoints[currentWaypointIndex].type === 'pickup' ? 'person-add' : 'person-remove'} 
                size={20} 
                color={Colors.white} 
              />
            </View>
            <View style={styles.waypointInfo}>
              <Text style={styles.waypointTypeText}>
                {waypoints[currentWaypointIndex].type === 'pickup' ? '📍 Récupérer' : '🏁 Déposer'}
              </Text>
              <Text style={styles.waypointPassengerText}>
                {waypoints[currentWaypointIndex].passenger.name}
              </Text>
              <Text style={styles.waypointAddressText} numberOfLines={1}>
                {waypoints[currentWaypointIndex].address}
              </Text>
            </View>
            <View style={styles.waypointActionButton}>
              <Ionicons 
                name="checkmark-circle" 
                size={24} 
                color={waypoints[currentWaypointIndex].type === 'pickup' ? Colors.secondary : Colors.success} 
              />
            </View>
          </View>
          <Text style={styles.waypointHint}>Appuyez pour confirmer</Text>
        </TouchableOpacity>
      )}

      {/* Instructions de navigation */}
      {!isLoadingRoute && currentStep && (
        <View style={styles.instructionCard}>
          <View style={styles.instructionHeader}>
            <View style={styles.maneuverIcon}>
              <Ionicons 
                name={getManeuverIcon(currentStep.maneuver) as any} 
                size={36} 
                color={Colors.white} 
              />
            </View>
            <View style={styles.instructionInfo}>
              <Text style={styles.instructionText}>
                {cleanHtmlInstructions(currentStep.html_instructions)}
              </Text>
              <Text style={styles.instructionDistance}>{currentStep.distance.text}</Text>
            </View>
          </View>

          {/* Prochaine instruction */}
          {currentStepIndex < steps.length - 1 && (
            <View style={styles.nextInstruction}>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
              <Text style={styles.nextInstructionText}>
                Ensuite : {cleanHtmlInstructions(steps[currentStepIndex + 1].html_instructions)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Loading route indicator */}
      {isLoadingRoute && (
        <View style={styles.loadingRouteCard}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingRouteText}>Calcul de l'itinéraire...</Text>
        </View>
      )}

      {/* Boutons d'action flottants */}
      <View style={styles.floatingButtons}>
        {/* Bouton recalculer l'itinéraire */}
        <TouchableOpacity
          style={[styles.floatingButton, isLoadingRoute && styles.floatingButtonDisabled]}
          onPress={forceRecalculateRoute}
          disabled={isLoadingRoute}
        >
          <Ionicons name="refresh" size={22} color={isLoadingRoute ? Colors.gray[400] : Colors.primary} />
        </TouchableOpacity>

        {/* Bouton recentrer */}
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => {
            const loc = currentLocationRef.current || currentLocation;
            if (mapRef.current && loc) {
              mapRef.current.animateCamera({
                center: {
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                },
                heading: heading,
                pitch: 60,
                zoom: 18,
              }, { duration: 500 });
            }
          }}
        >
          <Ionicons name="locate" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Modal de waypoint stylisé */}
      <Modal
        visible={waypointModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleDismissWaypointModal}
      >
        <View style={styles.waypointModalOverlay}>
          <View style={[styles.waypointModalContent, { paddingBottom: Math.max(insets.bottom, Spacing.xl) + Spacing.lg }]}>
            {/* Indicateur de slide */}
            <View style={styles.waypointModalHandle} />
            
            {/* Icône du type de waypoint */}
            <View style={[
              styles.waypointModalIcon,
              { backgroundColor: activeWaypoint?.type === 'pickup' ? Colors.secondary : Colors.info }
            ]}>
              <Ionicons 
                name={activeWaypoint?.type === 'pickup' ? 'person-add' : 'person-remove'} 
                size={32} 
                color={Colors.white} 
              />
            </View>

            {/* Titre */}
            <Text style={styles.waypointModalTitle}>
              {activeWaypoint?.type === 'pickup' ? '📍 Point de récupération' : '🏁 Point de dépose'}
            </Text>

            {/* Nom du passager */}
            <Text style={styles.waypointModalPassenger}>
              {activeWaypoint?.passenger.name}
            </Text>

            {/* Adresse */}
            <View style={styles.waypointModalAddressContainer}>
              <Ionicons name="location" size={18} color={Colors.gray[500]} />
              <Text style={styles.waypointModalAddress}>
                {activeWaypoint?.address}
              </Text>
            </View>

            {/* Boutons d'action */}
            <View style={styles.waypointModalActions}>
              <TouchableOpacity
                style={styles.waypointModalSecondaryButton}
                onPress={handleDismissWaypointModal}
                disabled={isConfirmingPickup || isConfirmingDropoff}
              >
                <Text style={styles.waypointModalSecondaryButtonText}>Plus tard</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.waypointModalPrimaryButton,
                  { backgroundColor: activeWaypoint?.type === 'pickup' ? Colors.secondary : Colors.success },
                  (isConfirmingPickup || isConfirmingDropoff) && { opacity: 0.7 }
                ]}
                onPress={handleConfirmWaypoint}
                disabled={isConfirmingPickup || isConfirmingDropoff}
              >
                {(isConfirmingPickup || isConfirmingDropoff) ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    <Text style={styles.waypointModalPrimaryButtonText}>
                      {activeWaypoint?.type === 'pickup' ? 'Passager récupéré' : 'Passager déposé'}
                    </Text>
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
    backgroundColor: Colors.black,
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
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  backButtonAlt: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  backButtonAltText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
  },
  map: {
    width,
    height,
  },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  etaText: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  distanceText: {
    fontSize: FontSizes.base,
    color: Colors.gray[300],
  },
  instructionCard: {
    position: 'absolute',
    bottom: 32,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  instructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  maneuverIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionInfo: {
    flex: 1,
  },
  instructionText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  instructionDistance: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
  },
  nextInstruction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
    gap: Spacing.xs,
  },
  nextInstructionText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  loadingRouteCard: {
    position: 'absolute',
    bottom: 32,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingRouteText: {
    fontSize: FontSizes.base,
    color: Colors.gray[700],
  },
  floatingButtons: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: 180,
    gap: Spacing.sm,
  },
  floatingButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingButtonDisabled: {
    opacity: 0.6,
  },
  driverMarker: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  driverMarkerInner: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  destinationMarker: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  waypointMarkerContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickupMarker: {
    backgroundColor: Colors.secondary,
  },
  dropoffMarker: {
    backgroundColor: Colors.info,
  },
  completedMarker: {
    backgroundColor: Colors.gray[400],
  },
  waypointCard: {
    position: 'absolute',
    bottom: 220,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  waypointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  waypointIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waypointInfo: {
    flex: 1,
  },
  waypointTypeText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  waypointPassengerText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginTop: 2,
  },
  waypointAddressText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 2,
  },
  waypointActionButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  waypointHint: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textAlign: 'center',
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },
  // Styles du modal de waypoint
  waypointModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  waypointModalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  waypointModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[300],
    marginBottom: Spacing.lg,
  },
  waypointModalIcon: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  waypointModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  waypointModalPassenger: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
    marginBottom: Spacing.md,
  },
  waypointModalAddressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  waypointModalAddress: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    flex: 1,
  },
  waypointModalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  waypointModalSecondaryButton: {
    flex: 1,
    height: 52,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waypointModalSecondaryButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  waypointModalPrimaryButton: {
    flex: 2,
    height: 52,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  waypointModalPrimaryButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
});

