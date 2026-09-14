import {
  PASSENGER_TRACKING_MARKER_ANCHOR,
  PassengerTrackingMarker,
  VEHICLE_TRACKING_MARKER_ANCHOR,
  VehicleTrackingMarker
} from '@/components/TrackingMapMarkers';
import { Colors } from '@/constants/styles';
import { getTripMarkerImage, getTripRequestMarkerImage } from '@/features/home/homeMapAssets';
import { HOME_MAP_PROVIDER, IS_ANDROID, TRIP_MARKER_ANCHOR, TRIP_REQUEST_MARKER_ANCHOR, USER_LOCATION_MARKER_ANCHOR } from '@/features/home/homeMapPolicy';
import { getTripMapCoordinate, placeName } from '@/features/home/homeModel';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Text,
  View
} from 'react-native';
import MapView, { Callout, Marker } from 'react-native-maps';

import { styles } from '@/features/home/HomeMap.styles';
import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeDriverActivity } from '@/hooks/home/useHomeDriverActivity';
import type { useHomeLocation } from '@/hooks/home/useHomeLocation';
import type { useHomeMap } from '@/hooks/home/useHomeMap';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';
import { useHomeMarkerReadiness } from '@/hooks/home/useHomeMarkerReadiness';
import type { useHomePassengerMarkers } from '@/hooks/home/useHomePassengerMarkers';
import type { useHomeUserLocation } from '@/hooks/home/useHomeUserLocation';
import { TripVehicleMapMarker, UserLocationMapMarker } from './HomeMapMarkers';
type Props =
  Pick<ReturnType<typeof useHomeMapNavigation>,
    'shouldRenderHomeMap'
    | 'openTripDetail'
    | 'openTripRequestDetail'
  >
  & Pick<ReturnType<typeof useHomeMap>,
    'mapRef'
    | 'mapRegion'
    | 'tripsWithMapCoordinates'
    | 'selectedTrip'
    | 'tripMarkerRefs'
    | 'setLoadedTripMarkerKeys'
    | 'tripRequestsWithMapCoordinates'
    | 'passengerMarkerRefs'
    | 'loadedTripMarkerKeys'
  >
  & Pick<ReturnType<typeof useHomeDriverActivity>,
    'ongoingDriverTrip'
  >
  & Pick<ReturnType<typeof useHomeUserLocation>,
    'userLocationMarker'
    | 'userLocationMarkerRef'
    | 'showUserLocationCallout'
  >
  & Pick<ReturnType<typeof useHomeLocation>,
    'lastKnownLocation'
    | 'liveUserCoordinate'
  >
  & Pick<ReturnType<typeof useHomePassengerMarkers>,
    'visibleDriverPassengerMarkers'
  >
  & Pick<ReturnType<typeof useHomeContext>,
    'router'
  >;
export function HomeMap({
  shouldRenderHomeMap,
  mapRef,
  mapRegion,
  ongoingDriverTrip,
  userLocationMarker,
  lastKnownLocation,
  tripsWithMapCoordinates,
  liveUserCoordinate,
  selectedTrip,
  tripMarkerRefs,
  openTripDetail,
  setLoadedTripMarkerKeys,
  tripRequestsWithMapCoordinates,
  openTripRequestDetail,
  visibleDriverPassengerMarkers,
  passengerMarkerRefs,
  router,
  loadedTripMarkerKeys,
  userLocationMarkerRef,
  showUserLocationCallout,
}: Props) {
  const onPassengerMarkerReady = useHomeMarkerReadiness({
    enabled: shouldRenderHomeMap,
    tripId: ongoingDriverTrip?.id,
    passengerMarkerRefs,
    setLoadedTripMarkerKeys,
  });
  return (<>
    {shouldRenderHomeMap ? (
      <MapView
        ref={mapRef}
        provider={HOME_MAP_PROVIDER}
        style={styles.map}
        initialRegion={mapRegion}
        showsCompass={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        showsPointsOfInterest={false}
        showsUserLocation={!ongoingDriverTrip && !userLocationMarker && Boolean(lastKnownLocation?.coords)}
        showsMyLocationButton={false}
        moveOnMarkerPress={false}
        toolbarEnabled={false}
      >
        {tripsWithMapCoordinates.map((trip) => {
          const isActiveDriverTrip = trip.id === ongoingDriverTrip?.id;
          const coordinate = getTripMapCoordinate(
            trip,
            isActiveDriverTrip ? liveUserCoordinate : null,
          );
          const isSelected = trip.id === selectedTrip?.id;
          const markerRenderKey = `${trip.id}:${trip.vehicleType || 'car'}:${isActiveDriverTrip ? 'tracking' : 'vehicle'}`;

          if (!coordinate) {
            return null;
          }

          return (
            <Marker
              ref={(marker) => {
                if (marker) {
                  tripMarkerRefs.current[trip.id] = marker;
                } else {
                  delete tripMarkerRefs.current[trip.id];
                }
              }}
              key={markerRenderKey}
              identifier={trip.id}
              coordinate={coordinate}
              anchor={isActiveDriverTrip ? VEHICLE_TRACKING_MARKER_ANCHOR : TRIP_MARKER_ANCHOR}
              image={IS_ANDROID ? getTripMarkerImage(trip, isSelected) : undefined}
              onPress={() => openTripDetail(trip.id)}
              tappable
              tracksViewChanges={false}
              zIndex={isSelected ? 10 : 1}
            >
              {isActiveDriverTrip && !IS_ANDROID ? (
                <VehicleTrackingMarker vehicleType={trip.vehicleType} />
              ) : !IS_ANDROID ? (
                <TripVehicleMapMarker
                  trip={trip}
                  isSelected={isSelected}

                />
              ) : null}
            </Marker>
          );
        })}
        {tripRequestsWithMapCoordinates.map(({ request, coordinate }) => {
          const markerRenderKey = `trip-request-${request.id}:${request.passengerGender ?? 'unknown'}`;

          return (
            <Marker
              key={markerRenderKey}
              identifier={`trip-request-${request.id}`}
              coordinate={coordinate}
              anchor={TRIP_REQUEST_MARKER_ANCHOR}
              image={getTripRequestMarkerImage(request.passengerGender)}
              title={request.passengerName || 'Demande de trajet'}
              description={`${placeName(request.departure)} → ${placeName(request.arrival)}`}
              onPress={() => openTripRequestDetail(request.id)}
              tappable
              tracksViewChanges={false}
              zIndex={6}
            />
          );
        })}
        {ongoingDriverTrip && visibleDriverPassengerMarkers.map((passenger) => {
          const passengerMarkerKey = `home-passenger-${passenger.bookingId}:${passenger.status}`;
          const passengerDescription =
            passenger.status === 'arrived'
              ? 'Passager arrivé'
              : passenger.status === 'pickup'
                ? 'Point de prise en charge'
                : passenger.isLive
                  ? 'Position en temps réel'
                  : 'Position du passager';

          return (
            <Marker
              ref={(marker) => {
                if (marker) {
                  passengerMarkerRefs.current[passenger.bookingId] = marker;
                } else {
                  delete passengerMarkerRefs.current[passenger.bookingId];
                }
              }}
              key={passengerMarkerKey}
              identifier={`home-passenger-${passenger.bookingId}`}
              coordinate={passenger.coordinate}
              anchor={PASSENGER_TRACKING_MARKER_ANCHOR}
              title={passenger.passengerName}
              description={passengerDescription}
              onPress={() => router.push(`/passenger/${passenger.passengerId}`)}
              tappable
              tracksViewChanges={IS_ANDROID && !loadedTripMarkerKeys.has(passengerMarkerKey)}
              zIndex={20}
            >
              <PassengerTrackingMarker
                status={passenger.status}
                onReady={() => onPassengerMarkerReady(passengerMarkerKey, passenger.bookingId)}
              />
            </Marker>
          );
        })}
        {userLocationMarker && !ongoingDriverTrip && (
          <Marker
            ref={(marker) => {
              userLocationMarkerRef.current = marker;
            }}
            identifier="home-user-location"
            coordinate={userLocationMarker.coordinate}
            anchor={USER_LOCATION_MARKER_ANCHOR}
            title={userLocationMarker.title}
            description={userLocationMarker.address}
            onPress={showUserLocationCallout}
            tracksViewChanges={false}
            zIndex={30}
          >
            <UserLocationMapMarker />
            <Callout tooltip>
              <View style={styles.userLocationCallout}>
                <View style={styles.userLocationCalloutTop}>
                  <View style={styles.userLocationCalloutIcon}>
                    <Ionicons name="navigate" size={14} color={Colors.white} />
                  </View>
                  <Text style={styles.userLocationCalloutTitle} numberOfLines={1}>
                    {userLocationMarker.title}
                  </Text>
                </View>
                <Text style={styles.userLocationCalloutAddress} numberOfLines={2}>
                  {userLocationMarker.address}
                </Text>
              </View>
            </Callout>
          </Marker>
        )}
      </MapView>
    ) : (
      <View style={styles.map} />
    )}
  </>);
}
