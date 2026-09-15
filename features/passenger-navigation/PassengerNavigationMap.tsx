import { usePassengerNavigationData } from '../../hooks/passenger-navigation/usePassengerNavigationData';
import { usePassengerNavigationState } from '../../hooks/passenger-navigation/usePassengerNavigationState';
import {
  usePassengerNavigationPresentation,
} from '../../hooks/passenger-navigation/usePassengerNavigationPresentation';
import { IS_ANDROID, PASSENGER_NAVIGATION_MAP_PROVIDER } from './navigationModel';
import { styles } from '../screen-styles/app/booking/navigate/detail/index';
import {
  getVehicleTrackingMarkerImage,
  PASSENGER_TRACKING_MARKER_ANCHOR,
  PassengerTrackingMarker,
  VEHICLE_TRACKING_MARKER_ANCHOR,
  VehicleTrackingMarker,
} from '@/components/TrackingMapMarkers';
import { Colors } from '@/constants/styles';
import React from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { MapMarker } from 'react-native-maps';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface PassengerNavigationMapProps {
  state: ReturnType<typeof usePassengerNavigationState>;
  camera: { mapRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number; }; fitToRoute: () => void; centerOnPassenger: () => void; centerOnDriver: () => void; };
  context: { routeOriginCoordinate: MapCoordinate | null; activePassengerDestination: MapCoordinate | null; hasPassengerPickedUp: boolean; passengerRouteSignature: string; isPassengerOnboard: boolean; hasPassengerDroppedOff: boolean; };
  handleTrackingMarkerReady: (markerKey: string, markerRef: React.MutableRefObject<MapMarker | null>) => void;
  driverCamera: { displayedDriverLocation: { latitude: number; longitude: number; } | null; displayedDriverHeading: number; };
  data: ReturnType<typeof usePassengerNavigationData>;
  coordinates: { tripDepartureCoordinate: MapCoordinate | null; tripArrivalCoordinate: MapCoordinate | null; pickupCoordinate: MapCoordinate | null; dropoffCoordinate: MapCoordinate | null; isKinshasaTrip: boolean; };
  presentation: ReturnType<typeof usePassengerNavigationPresentation>;
}

export function PassengerNavigationMap({
  state,
  camera,
  context,
  handleTrackingMarkerReady,
  driverCamera,
  data,
  coordinates,
  presentation,
}: PassengerNavigationMapProps) {
  const trip = data.trip;
  if (!trip) return null;
  const booking = data.booking;
  if (!booking) return null;
  return (
    <MapView
      ref={state.mapRef}
      provider={PASSENGER_NAVIGATION_MAP_PROVIDER}
      style={[styles.map, { top: state.mapTopOffset }]}
      initialRegion={camera.mapRegion}
      mapType="standard"
      onMapReady={state.handleMapReady}
      onLayout={state.onMapLayout}
      showsUserLocation={!context.isPassengerOnboard && !state.passengerLocation}
      showsMyLocationButton={false}
      showsCompass={false}
      showsTraffic={false}
      showsBuildings={false}
      showsIndoors={false}
      showsPointsOfInterest={false}
    >
    {/* Position du passager */}
    {state.passengerLocation && !context.isPassengerOnboard && (
      <Marker
        ref={state.passengerMarkerRef}
        key="passenger-location"
        coordinate={state.passengerLocation}
        anchor={PASSENGER_TRACKING_MARKER_ANCHOR}
        title="Votre position"
        description="Votre position actuelle"
        tracksViewChanges={IS_ANDROID && !state.isTrackingMarkerLoaded('passenger-location')}
        zIndex={25}
      >
        <PassengerTrackingMarker
          status="pickup"
          onReady={() => handleTrackingMarkerReady('passenger-location', state.passengerMarkerRef)}
        />
      </Marker>
    )}

    {/* Position du conducteur */}
    {driverCamera.displayedDriverLocation && (
      <Marker
        ref={state.driverMarkerRef}
        key="driver-location"
        coordinate={driverCamera.displayedDriverLocation}
        anchor={VEHICLE_TRACKING_MARKER_ANCHOR}
        title="Conducteur"
        description="Voiture qui vient vous chercher"
        image={IS_ANDROID ? getVehicleTrackingMarkerImage(trip.vehicleType) : undefined}
        flat
        rotation={driverCamera.displayedDriverHeading}
        tracksViewChanges={false}
        zIndex={30}
      >
        {!IS_ANDROID && (
          <VehicleTrackingMarker
            vehicleType={trip.vehicleType}
            onReady={() => handleTrackingMarkerReady('driver-location', state.driverMarkerRef)}
          />
        )}
      </Marker>
    )}

    {/* Point de récupération */}
    {coordinates.pickupCoordinate && !booking.pickedUp && (
      <Marker
        ref={state.pickupMarkerRef}
        key="pickup-location"
        coordinate={coordinates.pickupCoordinate}
        anchor={PASSENGER_TRACKING_MARKER_ANCHOR}
        title="Point de prise en charge"
        description={booking.passengerOrigin || trip.departure.address}
        tracksViewChanges={IS_ANDROID && !state.isTrackingMarkerLoaded('pickup-location')}
        zIndex={22}
      >
        <PassengerTrackingMarker
          status="pickup"
          onReady={() => handleTrackingMarkerReady('pickup-location', state.pickupMarkerRef)}
        />
      </Marker>
    )}

    {/* Point d'arrivée */}
    {coordinates.dropoffCoordinate && (
      <Marker
        ref={state.dropoffMarkerRef}
        key="dropoff-location"
        coordinate={coordinates.dropoffCoordinate}
        anchor={PASSENGER_TRACKING_MARKER_ANCHOR}
        title="Destination"
        description={booking.passengerDestination || trip.arrival.address}
        tracksViewChanges={IS_ANDROID && !state.isTrackingMarkerLoaded('dropoff-location')}
        zIndex={21}
      >
        <PassengerTrackingMarker
          status="arrived"
          onReady={() => handleTrackingMarkerReady('dropoff-location', state.dropoffMarkerRef)}
        />
      </Marker>
    )}
    {/* Route complete */}
    {presentation.displayedRouteCoordinates.length > 1 && (
      <Polyline
        key="passenger-route"
        coordinates={presentation.displayedRouteCoordinates}
        strokeColor={state.activeRouteSegment === 'route' ? Colors.primaryDark : 'rgba(255, 107, 53, 0.28)'}
        strokeWidth={state.activeRouteSegment === 'route' ? 6 : 3}
        lineCap="round"
        lineJoin="round"
        tappable
        onPress={() => state.setActiveRouteSegment('route')}
        zIndex={state.activeRouteSegment === 'route' ? 12 : 2}
      />
    )}

    {/* Ligne entre la voiture et le passager avant la prise en charge */}
    {driverCamera.displayedDriverLocation && !booking.pickedUp && (state.passengerLocation || coordinates.pickupCoordinate) && (
      <Polyline
        key="pickup-connector"
        coordinates={[driverCamera.displayedDriverLocation, state.passengerLocation ?? coordinates.pickupCoordinate!]}
        strokeColor={state.activeRouteSegment === 'pickup' ? Colors.infoDark : 'rgba(52, 152, 219, 0.28)'}
        strokeWidth={state.activeRouteSegment === 'pickup' ? 6 : 3}
        lineDashPattern={state.activeRouteSegment === 'pickup' ? undefined : [8, 6]}
        lineCap="round"
        lineJoin="round"
        tappable
        onPress={() => state.setActiveRouteSegment('pickup')}
        zIndex={state.activeRouteSegment === 'pickup' ? 13 : 3}
      />
    )}
    </MapView>
  );
}
