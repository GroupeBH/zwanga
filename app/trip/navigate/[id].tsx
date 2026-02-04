import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { trackingSocket } from '@/services/trackingSocket';
import {
  useConfirmDropoffMutation,
  useConfirmPickupMutation,
  useGetTripBookingsQuery
} from '@/store/api/bookingApi';
import { TravelMode, useGetDirectionsMutation } from '@/store/api/googleMapsApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
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
import MapView, { AnimatedRegion, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
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
  const [confirmPickup, { isLoading: isConfirmingPickup }] = useConfirmPickupMutation();
  const [confirmDropoff, { isLoading: isConfirmingDropoff }] = useConfirmDropoffMutation();
  const [getDirections] = useGetDirectionsMutation();
  const isTripOngoing = trip?.status === 'ongoing';

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
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  
  // Modal et panneau pour les waypoints
  const [waypointModalVisible, setWaypointModalVisible] = useState(false);
  const [passengersPanelVisible, setPassengersPanelVisible] = useState(false);
  const [activeWaypoint, setActiveWaypoint] = useState<Waypoint | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const [driverTracksViewChanges, setDriverTracksViewChanges] = useState(true);
  const [destinationTracksViewChanges, setDestinationTracksViewChanges] = useState(true);
  const driverPosition = useRef(
    new AnimatedRegion({
      latitude: trip?.departure?.lat ?? 0,
      longitude: trip?.departure?.lng ?? 0,
      latitudeDelta: 0,
      longitudeDelta: 0,
    })
  ).current;
  
  // Refs pour éviter les re-rendus excessifs
  const routeFetchedRef = useRef(false);
  const lastRouteFetchTimeRef = useRef(0);
  const waypointsCountRef = useRef(0);
  const currentLocationRef = useRef<Location.LocationObject | null>(null);
  const hasEnabled3DRef = useRef(false);

  // Connexion WebSocket pour le tracking temps réel
  useEffect(() => {
    if (!tripId) return;

    // Rejoindre la room du trip pour le tracking temps réel
    trackingSocket.joinTrip(tripId).then(() => {
      setIsSocketConnected(true);
      console.log('[Navigation] Connecté au tracking temps réel');
    });

    // Écouter les erreurs WebSocket
    const unsubscribeError = trackingSocket.subscribeToErrors((message) => {
      console.error('[Navigation] Erreur tracking:', message);
    });

    return () => {
      // Quitter la room et se déconnecter proprement
      trackingSocket.leaveTrip(tripId);
      unsubscribeError();
      setIsSocketConnected(false);
      
      // Nettoyage mémoire
      setRouteCoordinates([]);
      setSteps([]);
      setWaypoints([]);
      currentLocationRef.current = null;
      
      console.log('[Navigation] Déconnecté et mémoire nettoyée');
    };
  }, [tripId]);

  // Passer la carte en 3D lorsque la course est en cours
  useEffect(() => {
    if (!isTripOngoing) {
      hasEnabled3DRef.current = false;
      return;
    }

    if (hasEnabled3DRef.current || !mapRef.current || !currentLocationRef.current) {
      return;
    }

    hasEnabled3DRef.current = true;
    mapRef.current.animateCamera(
      {
        center: {
          latitude: currentLocationRef.current.coords.latitude,
          longitude: currentLocationRef.current.coords.longitude,
        },
        pitch: 60,
        heading,
        zoom: 17,
      },
      { duration: 800 }
    );
  }, [isTripOngoing, currentLocation, heading]);
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

        const hasServicesEnabled = await Location.hasServicesEnabledAsync();
        if (!hasServicesEnabled) {
          showDialog({
            title: 'Localisation désactivée',
            message: 'Activez les services de localisation pour démarrer la navigation.',
            variant: 'warning',
            icon: 'location-outline',
            actions: [
              { label: 'Retour', onPress: () => router.back() }
            ],
          });
          return;
        }

        // Obtenir la position initiale (avec fallback)
        let location: Location.LocationObject | null = null;
        try {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
        } catch (error) {
          location = await Location.getLastKnownPositionAsync({});
        }

        if (location) {
          setCurrentLocation(location);
          driverPosition.setValue({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0,
            longitudeDelta: 0,
          });
        } else {
          console.warn('[Navigation] Position initiale indisponible, en attente du GPS');
        }

      // Variables pour throttling des mises à jour (optimisé pour éviter les crashs)
      let lastStateUpdateTime = 0;
      let lastBackendUpdateTime = 0;
      let lastStepCheckTime = 0;
      const STATE_UPDATE_INTERVAL = 10000; // Mise à jour du state toutes les 10 secondes
      const BACKEND_UPDATE_INTERVAL = 8000; // Mise à jour WebSocket toutes les 8 secondes
      const STEP_CHECK_INTERVAL = 5000; // Vérification étapes toutes les 5 secondes

      // S'abonner aux mises à jour de localisation (fréquence réduite pour stabilité)
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced, // Équilibre entre précision et batterie
          timeInterval: 5000, // GPS update toutes les 5 secondes
          distanceInterval: 20, // Ou tous les 20 mètres
        },
        (newLocation) => {
          const now = Date.now();
          
          // Toujours stocker dans la ref pour les calculs internes
          currentLocationRef.current = newLocation;

          // Animer le marqueur conducteur (interpolation)
          driverPosition.timing({
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
            duration: 4500,
            useNativeDriver: false,
            toValue: 0,
            latitudeDelta: 0,
            longitudeDelta: 0
          }).start();
          
          // Mettre à jour le state très rarement (pour éviter les re-rendus)
          if (now - lastStateUpdateTime > STATE_UPDATE_INTERVAL) {
            lastStateUpdateTime = now;
            setCurrentLocation(newLocation);

            // Mettre à jour le cap (heading) seulement s'il a changé significativement
            if (
              newLocation.coords.heading !== null &&
              newLocation.coords.heading !== -1 &&
              (newLocation.coords.speed ?? 0) > 0.5
            ) {
              setHeading(prev => {
                const nextHeading = normalizeHeading(newLocation.coords.heading!);
                const currentHeading = normalizeHeading(prev);
                let delta = nextHeading - currentHeading;
                if (delta > 180) delta -= 360;
                if (delta < -180) delta += 360;

                if (Math.abs(delta) < 8) {
                  return prev;
                }

                const smoothedHeading = normalizeHeading(currentHeading + delta * 0.35);
                return smoothedHeading;
              });
            }
          }

          // Mettre à jour la position du conducteur via WebSocket (throttled)
          if (tripId && now - lastBackendUpdateTime > BACKEND_UPDATE_INTERVAL) {
            lastBackendUpdateTime = now;
            trackingSocket.updateDriverLocation(
              tripId,
              [newLocation.coords.longitude, newLocation.coords.latitude]
            ).catch(() => {}); // Ignorer les erreurs silencieusement
          }

          // NOTE: Animation de caméra désactivée pour éviter les crashs mémoire
          // L'utilisateur peut recentrer manuellement avec le bouton

          // Calculer la distance à chaque étape (throttled)
          if (now - lastStepCheckTime > STEP_CHECK_INTERVAL) {
            lastStepCheckTime = now;
            updateCurrentStep(newLocation);
          }
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

  // Passer la carte en 3D lorsque la course est en cours
  useEffect(() => {
    if (!isTripOngoing) {
      hasEnabled3DRef.current = false;
      return;
    }

    if (hasEnabled3DRef.current || !mapRef.current || !currentLocationRef.current) {
      return;
    }

    hasEnabled3DRef.current = true;
    mapRef.current.animateCamera(
      {
        center: {
          latitude: currentLocationRef.current.coords.latitude,
          longitude: currentLocationRef.current.coords.longitude,
        },
        pitch: 60,
        heading,
        zoom: 17,
      },
      { duration: 800 }
    );
  }, [isTripOngoing, currentLocation, heading]);
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
      // Construire les waypoints non complétés pour l'API backend
      const incompletWaypoints = waypoints.filter(wp => !wp.completed);
      const waypointsForApi = incompletWaypoints.map(wp => ({
        lat: wp.location.lat,
        lng: wp.location.lng,
      }));

      // Appel à l'API backend optimisée
      const data = await getDirections({
        origin: {
          lat: currentLocation.coords.latitude,
          lng: currentLocation.coords.longitude,
        },
        destination: {
          lat: trip.arrival.lat,
          lng: trip.arrival.lng,
        },
        waypoints: waypointsForApi.length > 0 ? waypointsForApi : undefined,
        mode: TravelMode.DRIVING,
        optimizeWaypoints: true,
        language: 'fr',
      }).unwrap();

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];

        // Décoder le polyline
        const points = decodePolyline(route.overviewPolyline);
        setRouteCoordinates(points);

        // Calculer la distance et durée totales
        let totalDist = 0;
        let totalDur = 0;
        route.legs.forEach(leg => {
          totalDist += leg.distance; // déjà en mètres
          totalDur += leg.duration; // déjà en secondes
        });

        setTotalDistance(`${(totalDist / 1000).toFixed(1)} km`);
        setTotalDuration(`${Math.round(totalDur / 60)} min`);

        // Convertir et stocker les étapes du leg actuel
        if (route.legs.length > 0) {
          const currentLeg = route.legs[currentLegIndex] || route.legs[0];
          const convertedSteps: RouteStep[] = currentLeg.steps.map(step => ({
            distance: { text: `${Math.round(step.distance)} m`, value: step.distance },
            duration: { text: `${Math.round(step.duration / 60)} min`, value: step.duration },
            html_instructions: step.htmlInstructions,
            maneuver: '',
            start_location: { lat: step.startLocation.lat, lng: step.startLocation.lng },
            end_location: { lat: step.endLocation.lat, lng: step.endLocation.lng },
            polyline: { points: step.polyline },
            travel_mode: 'DRIVING',
          }));
          setSteps(convertedSteps);
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
    } catch (error: any) {
      // Vérifier si c'est une erreur "pas de route trouvée" (400)
      const isNoRouteError = error?.status === 400 || error?.data?.statusCode === 400;
      const isNetworkError = error?.status === 'FETCH_ERROR' || error?.error?.includes?.('Network');
      
      if (isNoRouteError) {
        // Fallback: utiliser une ligne droite entre les points
        console.warn('[Navigation] Pas de route trouvée, utilisation de ligne droite');
        
        // Créer une route simplifiée avec les waypoints
        const fallbackPoints: Array<{ latitude: number; longitude: number }> = [
          { latitude: currentLocation.coords.latitude, longitude: currentLocation.coords.longitude },
        ];
        
        // Ajouter les waypoints non complétés
        waypoints.filter(wp => !wp.completed).forEach(wp => {
          fallbackPoints.push({ latitude: wp.location.lat, longitude: wp.location.lng });
        });
        
        // Ajouter la destination finale
        fallbackPoints.push({ latitude: trip.arrival.lat, longitude: trip.arrival.lng });
        
        setRouteCoordinates(fallbackPoints);
        setTotalDistance('--');
        setTotalDuration('--');
        setSteps([]);
      } else if (isNetworkError) {
        // Erreur réseau - afficher un warning discret
        console.warn('[Navigation] Erreur réseau, nouvelle tentative plus tard');
      } else {
        // Autres erreurs - log seulement
        console.warn('[Navigation] Erreur itinéraire:', error?.data?.message || error?.message || 'Erreur inconnue');
      }
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

  const normalizeHeading = (value: number) => {
    const normalized = value % 360;
    return normalized < 0 ? normalized + 360 : normalized;
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

  // Calculs pour les stats passagers (mémorisés)
  const passengerStats = React.useMemo(() => {
    const pickups = waypoints.filter(wp => wp.type === 'pickup');
    const dropoffs = waypoints.filter(wp => wp.type === 'dropoff');
    const pendingPickups = pickups.filter(wp => !wp.completed);
    const pendingDropoffs = dropoffs.filter(wp => !wp.completed);
    const completedPickups = pickups.filter(wp => wp.completed);
    const completedDropoffs = dropoffs.filter(wp => wp.completed);
    
    // Passagers uniques
    const uniquePassengers = new Map<string, { name: string; pickedUp: boolean; droppedOff: boolean }>();
    waypoints.forEach(wp => {
      const existing = uniquePassengers.get(wp.passenger.id);
      if (!existing) {
        uniquePassengers.set(wp.passenger.id, {
          name: wp.passenger.name,
          pickedUp: wp.type === 'pickup' ? wp.completed : false,
          droppedOff: wp.type === 'dropoff' ? wp.completed : false,
        });
      } else {
        if (wp.type === 'pickup') existing.pickedUp = wp.completed;
        if (wp.type === 'dropoff') existing.droppedOff = wp.completed;
      }
    });
    
    return {
      totalPassengers: uniquePassengers.size,
      pendingPickups: pendingPickups.length,
      pendingDropoffs: pendingDropoffs.length,
      completedPickups: completedPickups.length,
      completedDropoffs: completedDropoffs.length,
      inVehicle: completedPickups.length - completedDropoffs.length,
      passengers: Array.from(uniquePassengers.entries()).map(([id, data]) => ({ id, ...data })),
    };
  }, [waypoints]);

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

  // Décoder un polyline Google (avec simplification pour économiser la mémoire)
  const decodePolyline = (encoded: string): Array<{ latitude: number; longitude: number }> => {
    const allPoints: Array<{ latitude: number; longitude: number }> = [];
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

      allPoints.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    // Simplifier le polyline pour économiser la mémoire (max 200 points)
    const maxPoints = 200;
    if (allPoints.length <= maxPoints) {
      return allPoints;
    }
    
    const step = Math.ceil(allPoints.length / maxPoints);
    const simplified: Array<{ latitude: number; longitude: number }> = [];
    for (let i = 0; i < allPoints.length; i += step) {
      simplified.push(allPoints[i]);
    }
    // Toujours inclure le dernier point
    if (simplified[simplified.length - 1] !== allPoints[allPoints.length - 1]) {
      simplified.push(allPoints[allPoints.length - 1]);
    }
    
    return simplified;
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
      
      {/* Carte (ultra-optimisée pour éviter les crashs) */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        showsPointsOfInterest={false}
        loadingEnabled={false}
        mapType="standard"
        minZoomLevel={12}
        maxZoomLevel={18}
        pitchEnabled={isTripOngoing}
        rotateEnabled={isTripOngoing}
        scrollEnabled={true}
        zoomEnabled={true}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        initialRegion={{
          latitude: currentLocation?.coords?.latitude ?? trip?.departure?.lat ?? -4.4419,
          longitude: currentLocation?.coords?.longitude ?? trip?.departure?.lng ?? 15.2663,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        {/* Itinéraire (simplifié) */}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeWidth={4}
            strokeColor={Colors.primary}
          />
        )}

        {/* Position actuelle du conducteur - Marqueur voiture */}
        {currentLocation?.coords?.latitude && currentLocation?.coords?.longitude && (
          <Marker.Animated
            coordinate={driverPosition as unknown as { latitude: number; longitude: number }}
            anchor={{ x: 0.5, y: 0.5 }}
            title="Ma position"
            flat
            rotation={heading}
            tracksViewChanges={driverTracksViewChanges}
          >
            <View
              style={styles.driverMarker}
              onLayout={() => {
                if (driverTracksViewChanges) {
                  setDriverTracksViewChanges(false);
                }
              }}
            >
              <View style={styles.driverMarkerInner}>
                <View style={styles.driverMarkerCar}>
                  <Ionicons name="car" size={20} color={Colors.white} />
                </View>
              </View>
            </View>
          </Marker.Animated>
        )}

        {/* Prochain waypoint uniquement (1 seul pour éviter les crashs) */}
        {waypoints.length > 0 && currentWaypointIndex < waypoints.length && 
         !waypoints[currentWaypointIndex].completed &&
         waypoints[currentWaypointIndex].location?.lat && 
         waypoints[currentWaypointIndex].location?.lng && (
          <Marker
            coordinate={{
              latitude: waypoints[currentWaypointIndex].location.lat,
              longitude: waypoints[currentWaypointIndex].location.lng,
            }}
            pinColor={waypoints[currentWaypointIndex].type === 'pickup' ? Colors.secondary : Colors.success}
            title={`${waypoints[currentWaypointIndex].type === 'pickup' ? 'Récupérer' : 'Déposer'} ${waypoints[currentWaypointIndex].passenger.name}`}
          />
        )}

        {/* Destination finale - Marqueur arrivée */}
        {trip?.arrival?.lat && trip?.arrival?.lng && (
          <Marker
            coordinate={{
              latitude: trip.arrival.lat,
              longitude: trip.arrival.lng,
            }}
            anchor={{ x: 0.5, y: 1 }}
            title={trip.arrival.name || 'Arrivée'}
            tracksViewChanges={destinationTracksViewChanges}
          >
            <View
              style={styles.destinationMarkerContainer}
              onLayout={() => {
                if (destinationTracksViewChanges) {
                  setDestinationTracksViewChanges(false);
                }
              }}
            >
              <View style={styles.destinationMarkerBody}>
                <Ionicons name="flag" size={22} color={Colors.white} />
              </View>
              <View style={styles.destinationMarkerTip} />
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
          <View style={styles.etaRow}>
            <Text style={styles.etaText}>{totalDuration}</Text>
            {/* Indicateur temps réel */}
            <View style={[styles.liveIndicator, isSocketConnected && styles.liveIndicatorActive]}>
              <View style={[styles.liveDot, isSocketConnected && styles.liveDotActive]} />
              <Text style={[styles.liveText, isSocketConnected && styles.liveTextActive]}>
                {isSocketConnected ? 'LIVE' : '...'}
              </Text>
            </View>
          </View>
          <Text style={styles.distanceText}>{totalDistance}</Text>
        </View>
      </View>

      {/* Barre compacte des passagers */}
      {waypoints.length > 0 && (
        <View style={styles.passengersBar}>
          {/* Stats des passagers */}
          <TouchableOpacity 
            style={styles.passengersStatsButton}
            onPress={() => setPassengersPanelVisible(true)}
          >
            <View style={styles.passengersBadge}>
              <Ionicons name="people" size={16} color={Colors.white} />
              <Text style={styles.passengersBadgeText}>{passengerStats.totalPassengers}</Text>
            </View>
            <View style={styles.passengersStatsInfo}>
              {passengerStats.inVehicle > 0 && (
                <View style={styles.inVehicleBadge}>
                  <Ionicons name="car" size={12} color={Colors.white} />
                  <Text style={styles.inVehicleText}>{passengerStats.inVehicle} à bord</Text>
                </View>
              )}
              {passengerStats.pendingPickups > 0 && (
                <Text style={styles.pendingText}>
                  {passengerStats.pendingPickups} à récupérer
                </Text>
              )}
            </View>
            <Ionicons name="chevron-up" size={20} color={Colors.gray[500]} />
          </TouchableOpacity>

          {/* Prochain waypoint compact */}
          {currentWaypointIndex < waypoints.length && !waypoints[currentWaypointIndex].completed && (
            <TouchableOpacity 
              style={[
                styles.nextWaypointCompact,
                { borderLeftColor: waypoints[currentWaypointIndex].type === 'pickup' ? Colors.secondary : Colors.success }
              ]}
              activeOpacity={0.8}
              onPress={() => {
                setActiveWaypoint(waypoints[currentWaypointIndex]);
                setWaypointModalVisible(true);
              }}
            >
              <View style={styles.nextWaypointInfo}>
                <Text style={styles.nextWaypointType}>
                  {waypoints[currentWaypointIndex].type === 'pickup' ? '📍 Récupérer' : '🏁 Déposer'}
                </Text>
                <Text style={styles.nextWaypointName} numberOfLines={1}>
                  {waypoints[currentWaypointIndex].passenger.name}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.quickConfirmButton,
                  { backgroundColor: waypoints[currentWaypointIndex].type === 'pickup' ? Colors.secondary : Colors.success }
                ]}
                onPress={() => {
                  setActiveWaypoint(waypoints[currentWaypointIndex]);
                  setWaypointModalVisible(true);
                }}
              >
                <Ionicons name="checkmark" size={20} color={Colors.white} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        </View>
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
              mapRef.current.animateToRegion({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }, 300);
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

      {/* Panneau des passagers */}
      <Modal
        visible={passengersPanelVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPassengersPanelVisible(false)}
      >
        <View style={styles.passengersPanelOverlay}>
          <TouchableOpacity 
            style={styles.passengersPanelBackdrop} 
            activeOpacity={1}
            onPress={() => setPassengersPanelVisible(false)}
          />
          <View style={[styles.passengersPanelContent, { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.md }]}>
            <View style={styles.passengersPanelHandle} />
            
            {/* Header */}
            <View style={styles.passengersPanelHeader}>
              <Text style={styles.passengersPanelTitle}>Passagers du trajet</Text>
              <View style={styles.passengersPanelStats}>
                <View style={styles.statBadge}>
                  <Ionicons name="person-add" size={14} color={Colors.secondary} />
                  <Text style={styles.statText}>{passengerStats.completedPickups}/{passengerStats.completedPickups + passengerStats.pendingPickups}</Text>
                </View>
                <View style={styles.statBadge}>
                  <Ionicons name="car" size={14} color={Colors.primary} />
                  <Text style={styles.statText}>{passengerStats.inVehicle}</Text>
                </View>
                <View style={styles.statBadge}>
                  <Ionicons name="flag" size={14} color={Colors.success} />
                  <Text style={styles.statText}>{passengerStats.completedDropoffs}/{passengerStats.completedDropoffs + passengerStats.pendingDropoffs}</Text>
                </View>
              </View>
            </View>

            {/* Liste des waypoints */}
            <View style={styles.waypointsList}>
              {waypoints.map((waypoint, index) => {
                const isNext = index === currentWaypointIndex && !waypoint.completed;
                return (
                  <TouchableOpacity
                    key={waypoint.id}
                    style={[
                      styles.waypointListItem,
                      waypoint.completed && styles.waypointListItemCompleted,
                      isNext && styles.waypointListItemNext,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (!waypoint.completed) {
                        setActiveWaypoint(waypoint);
                        setPassengersPanelVisible(false);
                        setWaypointModalVisible(true);
                      }
                    }}
                    disabled={waypoint.completed}
                  >
                    <View style={[
                      styles.waypointListIcon,
                      { backgroundColor: waypoint.type === 'pickup' ? Colors.secondary : Colors.success },
                      waypoint.completed && styles.waypointListIconCompleted,
                    ]}>
                      {waypoint.completed ? (
                        <Ionicons name="checkmark" size={14} color={Colors.white} />
                      ) : (
                        <Ionicons 
                          name={waypoint.type === 'pickup' ? 'person-add' : 'flag'} 
                          size={14} 
                          color={Colors.white} 
                        />
                      )}
                    </View>
                    
                    <View style={styles.waypointListInfo}>
                      <Text style={[
                        styles.waypointListName,
                        waypoint.completed && styles.waypointListNameCompleted,
                      ]}>
                        {waypoint.passenger.name}
                      </Text>
                      <Text style={styles.waypointListType}>
                        {waypoint.type === 'pickup' ? 'Récupération' : 'Dépose'}
                      </Text>
                    </View>

                    {!waypoint.completed && (
                      <TouchableOpacity
                        style={[
                          styles.waypointListAction,
                          { backgroundColor: waypoint.type === 'pickup' ? Colors.secondary : Colors.success }
                        ]}
                        onPress={() => {
                          setActiveWaypoint(waypoint);
                          setPassengersPanelVisible(false);
                          setWaypointModalVisible(true);
                        }}
                      >
                        <Ionicons name="checkmark" size={16} color={Colors.white} />
                      </TouchableOpacity>
                    )}

                    {isNext && (
                      <View style={styles.nextBadge}>
                        <Text style={styles.nextBadgeText}>SUIVANT</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Bouton fermer */}
            <TouchableOpacity
              style={styles.closePanelButton}
              onPress={() => setPassengersPanelVisible(false)}
            >
              <Text style={styles.closePanelButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[200],
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
    ...StyleSheet.absoluteFillObject,
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
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  etaText: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
  },
  liveIndicatorActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gray[400],
  },
  liveDotActive: {
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: Colors.gray[400],
  },
  liveTextActive: {
    color: '#10B981',
  },
  distanceText: {
    fontSize: FontSizes.base,
    color: Colors.gray[300],
  },
  instructionCard: {
    position: 'absolute',
    bottom: 52,
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
    bottom: 52,
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
  driverMarkerCar: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  destinationMarkerContainer: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: 'transparent',
    paddingTop: 2,
  },
  destinationMarkerBody: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  destinationMarkerTip: {
    marginTop: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.success,
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
  // Barre compacte des passagers
  passengersBar: {
    position: 'absolute',
    top: 100,
    left: Spacing.md,
    right: Spacing.md,
    gap: Spacing.sm,
  },
  passengersStatsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    gap: Spacing.sm,
  },
  passengersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    gap: 4,
  },
  passengersBadgeText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  passengersStatsInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  inVehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.info,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    gap: 2,
  },
  inVehicleText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.white,
  },
  pendingText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  nextWaypointCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    paddingLeft: Spacing.md,
    borderLeftWidth: 4,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    gap: Spacing.sm,
  },
  nextWaypointInfo: {
    flex: 1,
  },
  nextWaypointType: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
  },
  nextWaypointName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  quickConfirmButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Panneau des passagers
  passengersPanelOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  passengersPanelBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  passengersPanelContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    maxHeight: '70%',
  },
  passengersPanelHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[300],
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  passengersPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  passengersPanelTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  passengersPanelStats: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    gap: 4,
  },
  statText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  waypointsList: {
    gap: Spacing.xs,
  },
  waypointListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  waypointListItemCompleted: {
    backgroundColor: Colors.gray[100],
    opacity: 0.7,
  },
  waypointListItemNext: {
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  waypointListIcon: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waypointListIconCompleted: {
    backgroundColor: Colors.gray[400],
  },
  waypointListInfo: {
    flex: 1,
  },
  waypointListName: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  waypointListNameCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.gray[500],
  },
  waypointListType: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  waypointListAction: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextBadge: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  nextBadgeText: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  closePanelButton: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  closePanelButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
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

