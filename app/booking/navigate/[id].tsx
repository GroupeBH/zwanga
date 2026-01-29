import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { trackingSocket, type DriverLocationPayload } from '@/services/trackingSocket';
import {
    useConfirmDropoffByPassengerMutation,
    useConfirmPickupByPassengerMutation,
    useGetBookingByIdQuery,
} from '@/store/api/bookingApi';
import { useGetDirectionsMutation } from '@/store/api/googleMapsApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Fonction pour décoder les polylines Google
function decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
  const points: Array<{ latitude: number; longitude: number }> = [];
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

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  // Limiter le nombre de points pour les performances
  if (points.length > 300) {
    const step = Math.ceil(points.length / 300);
    const simplified: Array<{ latitude: number; longitude: number }> = [];
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

const { width, height } = Dimensions.get('window');

export default function PassengerNavigationScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { showDialog } = useDialog();
  const insets = useSafeAreaInsets();
  const bookingId = typeof id === 'string' ? id : '';

  // Récupérer la réservation et le trajet
  const { data: booking, isLoading: bookingLoading, refetch: refetchBooking } = useGetBookingByIdQuery(bookingId, { 
    skip: !bookingId,
    pollingInterval: 30000, // Polling léger pour sync
  });
  const tripId = booking?.tripId || '';
  const { data: trip, isLoading: tripLoading } = useGetTripByIdQuery(tripId, { 
    skip: !tripId,
    pollingInterval: 30000,
  });

  // Mutations pour confirmer pickup/dropoff
  const [confirmPickup, { isLoading: isConfirmingPickup }] = useConfirmPickupByPassengerMutation();
  const [confirmDropoff, { isLoading: isConfirmingDropoff }] = useConfirmDropoffByPassengerMutation();

  const mapRef = useRef<MapView>(null);
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Route et directions
  const [getDirections] = useGetDirectionsMutation();
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const routeFetchedRef = useRef(false);
  const lastRouteFetchRef = useRef<number>(0);

  // Coordonnées importantes
  // Le point de récupération peut être personnalisé par le passager
  const pickupCoordinate = useMemo(() => {
    if (booking?.passengerOriginCoordinates) {
      return {
        latitude: booking.passengerOriginCoordinates.latitude,
        longitude: booking.passengerOriginCoordinates.longitude,
      };
    }
    if (trip?.departure) {
      return {
        latitude: trip.departure.lat,
        longitude: trip.departure.lng,
      };
    }
    return null;
  }, [booking?.passengerOriginCoordinates, trip?.departure]);

  const dropoffCoordinate = useMemo(() => {
    if (booking?.passengerDestinationCoordinates) {
      return {
        latitude: booking.passengerDestinationCoordinates.latitude,
        longitude: booking.passengerDestinationCoordinates.longitude,
      };
    }
    if (trip?.arrival) {
      return {
        latitude: trip.arrival.lat,
        longitude: trip.arrival.lng,
      };
    }
    return null;
  }, [booking?.passengerDestinationCoordinates, trip?.arrival]);

  // Fonction pour récupérer la route
  const fetchRoute = useCallback(async () => {
    if (!trip?.departure || !trip?.arrival) return;
    
    // Éviter les appels trop fréquents (minimum 30s entre les appels)
    const now = Date.now();
    if (now - lastRouteFetchRef.current < 30000 && routeFetchedRef.current) return;
    lastRouteFetchRef.current = now;
    
    setIsLoadingRoute(true);
    
    try {
      // Utiliser les coordonnées personnalisées du passager si disponibles
      const origin = booking?.passengerOriginCoordinates 
        ? { lat: booking.passengerOriginCoordinates.latitude, lng: booking.passengerOriginCoordinates.longitude }
        : { lat: trip.departure.lat, lng: trip.departure.lng };
        
      const destination = booking?.passengerDestinationCoordinates
        ? { lat: booking.passengerDestinationCoordinates.latitude, lng: booking.passengerDestinationCoordinates.longitude }
        : { lat: trip.arrival.lat, lng: trip.arrival.lng };
      
      const response = await getDirections({
        origin,
        destination,
        mode: 'driving' as any,
      }).unwrap();
      
      if (response.routes && response.routes.length > 0) {
        const route = response.routes[0];
        
        // Décoder la polyline
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
          
          // Formater la durée
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
      const isNoRouteError = error?.status === 400 || error?.data?.statusCode === 400;
      
      if (isNoRouteError) {
        // Fallback: utiliser une ligne droite entre pickup et dropoff
        console.warn('[PassengerNavigation] Pas de route trouvée, utilisation de ligne droite');
        
        const origin = booking?.passengerOriginCoordinates 
          ? { latitude: booking.passengerOriginCoordinates.latitude, longitude: booking.passengerOriginCoordinates.longitude }
          : { latitude: trip.departure.lat, longitude: trip.departure.lng };
          
        const destination = booking?.passengerDestinationCoordinates
          ? { latitude: booking.passengerDestinationCoordinates.latitude, longitude: booking.passengerDestinationCoordinates.longitude }
          : { latitude: trip.arrival.lat, longitude: trip.arrival.lng };
        
        setRouteCoordinates([origin, destination]);
        setRouteInfo(null); // Pas d'infos de distance/durée en fallback
        routeFetchedRef.current = true;
      } else {
        console.warn('[PassengerNavigation] Erreur route:', error?.data?.message || error?.message || 'Erreur inconnue');
      }
    } finally {
      setIsLoadingRoute(false);
    }
  }, [trip?.departure, trip?.arrival, booking?.passengerOriginCoordinates, booking?.passengerDestinationCoordinates, getDirections]);
  
  // Récupérer la route au chargement
  useEffect(() => {
    if (trip && !routeFetchedRef.current) {
      fetchRoute();
    }
  }, [trip, fetchRoute]);

  // Connexion WebSocket pour recevoir la position du conducteur
  useEffect(() => {
    if (!tripId) return;

    // Rejoindre la room du trip pour recevoir les updates
    trackingSocket.joinTrip(tripId).then(() => {
      setIsSocketConnected(true);
      // Demander la position actuelle du conducteur
      trackingSocket.requestDriverLocation(tripId);
    });

    // Écouter les mises à jour de position du conducteur
    const unsubscribeLocation = trackingSocket.subscribeToDriverLocation((payload: DriverLocationPayload) => {
      if (payload.tripId === tripId && payload.coordinates) {
        setDriverLocation({
          latitude: payload.coordinates[1],
          longitude: payload.coordinates[0],
        });
        setLastUpdate(new Date());
      }
    });

    // Écouter les erreurs
    const unsubscribeError = trackingSocket.subscribeToErrors((message) => {
      console.warn('[PassengerNavigation] Erreur tracking:', message);
    });

    // Demander la position toutes les 10 secondes
    const interval = setInterval(() => {
      trackingSocket.requestDriverLocation(tripId);
    }, 10000);

    return () => {
      trackingSocket.leaveTrip(tripId);
      unsubscribeLocation();
      unsubscribeError();
      clearInterval(interval);
      setIsSocketConnected(false);
    };
  }, [tripId]);

  // Calculer la région de la carte
  const mapRegion = useMemo(() => {
    const points: Array<{ latitude: number; longitude: number }> = [];
    
    if (driverLocation) points.push(driverLocation);
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
  }, [driverLocation, pickupCoordinate, dropoffCoordinate]);

  // Centrer sur le conducteur
  const centerOnDriver = () => {
    if (driverLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...driverLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  };
  
  // Centrer sur toute la route
  const fitToRoute = useCallback(() => {
    if (!mapRef.current) return;
    
    const coordinates: Array<{ latitude: number; longitude: number }> = [];
    
    if (driverLocation) coordinates.push(driverLocation);
    if (pickupCoordinate && !booking?.pickedUp) coordinates.push(pickupCoordinate);
    if (dropoffCoordinate) coordinates.push(dropoffCoordinate);
    if (routeCoordinates.length > 0) {
      coordinates.push(routeCoordinates[0]);
      coordinates.push(routeCoordinates[routeCoordinates.length - 1]);
    }
    
    if (coordinates.length >= 2) {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
        animated: true,
      });
    }
  }, [driverLocation, pickupCoordinate, dropoffCoordinate, routeCoordinates, booking?.pickedUp]);

  // Confirmer la récupération
  const handleConfirmPickup = async () => {
    if (!booking) return;
    
    showDialog({
      variant: 'info',
      title: 'Confirmer la récupération',
      message: 'Confirmez-vous que le conducteur vous a bien récupéré ?',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Confirmer',
          variant: 'primary',
          onPress: async () => {
            try {
              await confirmPickup(booking.id).unwrap();
              showDialog({
                variant: 'success',
                title: 'Récupération confirmée',
                message: 'Bon trajet !',
              });
              refetchBooking();
            } catch (error: any) {
              showDialog({
                variant: 'danger',
                title: 'Erreur',
                message: error?.data?.message || 'Impossible de confirmer la récupération.',
              });
            }
          },
        },
      ],
    });
  };

  // Confirmer la dépose
  const handleConfirmDropoff = async () => {
    if (!booking) return;
    
    showDialog({
      variant: 'info',
      title: 'Confirmer la dépose',
      message: 'Confirmez-vous que vous êtes bien arrivé à destination ?',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Confirmer',
          variant: 'primary',
          onPress: async () => {
            try {
              await confirmDropoff(booking.id).unwrap();
              showDialog({
                variant: 'success',
                title: 'Trajet terminé',
                message: 'Merci d\'avoir voyagé avec nous !',
                actions: [
                  {
                    label: 'Évaluer le conducteur',
                    variant: 'primary',
                    onPress: () => router.push(`/rate/${tripId}`),
                  },
                ],
              });
              refetchBooking();
            } catch (error: any) {
              showDialog({
                variant: 'danger',
                title: 'Erreur',
                message: error?.data?.message || 'Impossible de confirmer la dépose.',
              });
            }
          },
        },
      ],
    });
  };

  // État du trajet pour le passager
  const tripStatus = useMemo(() => {
    if (!booking || !trip) return 'loading';
    if (trip.status !== 'ongoing') return 'not_started';
    if (booking.droppedOff) return 'completed';
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
        <Text style={styles.errorText}>Réservation introuvable</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
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
        style={styles.map}
        initialRegion={mapRegion}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        showsPointsOfInterest={false}
      >
        {/* Position du conducteur */}
        {driverLocation && (
          <Marker
            coordinate={driverLocation}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.driverMarker}>
              <Ionicons name="car-sport" size={20} color={Colors.white} />
            </View>
          </Marker>
        )}

        {/* Point de récupération */}
        {pickupCoordinate && !booking.pickedUp && (
          <Marker coordinate={pickupCoordinate}>
            <View style={styles.pickupMarker}>
              <Ionicons name="person-add" size={16} color={Colors.white} />
            </View>
          </Marker>
        )}

        {/* Point de dépose */}
        {dropoffCoordinate && (
          <Marker coordinate={dropoffCoordinate}>
            <View style={styles.dropoffMarker}>
              <Ionicons name="flag" size={16} color={Colors.white} />
            </View>
          </Marker>
        )}

        {/* Route complète */}
        {routeCoordinates.length > 1 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={Colors.primary}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Ligne vers le conducteur (si pas sur la route) */}
        {driverLocation && pickupCoordinate && !booking.pickedUp && (
          <Polyline
            coordinates={[driverLocation, pickupCoordinate]}
            strokeColor={Colors.info}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        )}
      </MapView>

      {/* Boutons flottants */}
      <View style={[styles.floatingButtons, { top: insets.top + 70 }]}>
        <TouchableOpacity 
          style={styles.floatingButton} 
          onPress={fitToRoute}
          activeOpacity={0.8}
        >
          <Ionicons name="expand-outline" size={22} color={Colors.gray[700]} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.floatingButton} 
          onPress={centerOnDriver}
          activeOpacity={0.8}
        >
          <Ionicons name="car-sport" size={22} color={Colors.info} />
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
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[800]} />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {tripStatus === 'waiting_pickup' ? 'En attente de récupération' : 
             tripStatus === 'in_transit' ? 'En route' :
             tripStatus === 'completed' ? 'Arrivé' : 'Suivi du trajet'}
          </Text>
          {isSocketConnected && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.headerButton} onPress={centerOnDriver}>
          <Ionicons name="locate" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </Animated.View>

      {/* Info Card */}
      <Animated.View 
        entering={FadeInUp.duration(300).delay(100)} 
        style={[styles.infoCard, { paddingBottom: insets.bottom + 16 }]}
      >
        {/* Conducteur */}
        <View style={styles.driverInfo}>
          <View style={styles.driverAvatar}>
            <Text style={styles.driverAvatarText}>
              {(trip.driverName || 'C').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.driverDetails}>
            <Text style={styles.driverName}>{trip.driverName || 'Conducteur'}</Text>
            <Text style={styles.vehicleInfo}>
              {trip.vehicle 
                ? `${trip.vehicle.brand} ${trip.vehicle.model} • ${trip.vehicle.licensePlate}`
                : trip.vehicleInfo}
            </Text>
          </View>
          {trip.driver?.phone && (
            <TouchableOpacity 
              style={styles.callButton}
              onPress={() => {
                showDialog({
                  variant: 'info',
                  title: 'Contacter le conducteur',
                  message: `Appeler ${trip.driverName || 'le conducteur'} ?`,
                  actions: [
                    { label: 'Annuler', variant: 'ghost' },
                    {
                      label: 'Appeler',
                      variant: 'primary',
                      onPress: () => {
                        // Import Linking si nécessaire
                        import('react-native').then(({ Linking }) => {
                          Linking.openURL(`tel:${trip.driver?.phone}`);
                        });
                      },
                    },
                  ],
                });
              }}
            >
              <Ionicons name="call" size={20} color={Colors.success} />
            </TouchableOpacity>
          )}
        </View>

        {/* Infos de route */}
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
              <Text style={styles.routeStatLabel}>Durée estimée</Text>
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
            <Text style={styles.routeLoadingText}>Chargement de l'itinéraire...</Text>
          </View>
        )}

        {/* Statut et dernière mise à jour */}
        <View style={styles.statusRow}>
          {lastUpdate && (
            <Text style={styles.lastUpdateText}>
              Position mise à jour : {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </Text>
          )}
          {!driverLocation && tripStatus !== 'not_started' && (
            <Text style={styles.waitingText}>En attente de la position du conducteur...</Text>
          )}
        </View>

        {/* Itinéraire simplifié */}
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

        {/* Boutons d'action */}
        {trip.status === 'ongoing' && (
          <View style={styles.actionButtons}>
            {!booking.pickedUp && (
              <TouchableOpacity
                style={[styles.actionButton, styles.pickupButton]}
                onPress={handleConfirmPickup}
                disabled={isConfirmingPickup}
              >
                {isConfirmingPickup ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
                    <Text style={styles.actionButtonText}>Je suis récupéré</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {booking.pickedUp && !booking.droppedOff && (
              <TouchableOpacity
                style={[styles.actionButton, styles.dropoffButton]}
                onPress={handleConfirmDropoff}
                disabled={isConfirmingDropoff}
              >
                {isConfirmingDropoff ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="flag" size={20} color={Colors.white} />
                    <Text style={styles.actionButtonText}>Je suis arrivé</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {booking.droppedOff && (
              <View style={styles.completedBadge}>
                <Ionicons name="checkmark-done" size={24} color={Colors.success} />
                <Text style={styles.completedText}>Trajet terminé</Text>
              </View>
            )}
          </View>
        )}

        {trip.status !== 'ongoing' && (
          <View style={styles.notStartedBadge}>
            <Ionicons name="time" size={20} color={Colors.secondary} />
            <Text style={styles.notStartedText}>Le trajet n'a pas encore démarré</Text>
          </View>
        )}
      </Animated.View>
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
});

