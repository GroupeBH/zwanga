import { Colors } from '@/constants/styles';
import { MAP_MARKER_ANCHORS, MAP_MARKER_SIZES } from '@/constants/mapMarkers';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Image, StyleSheet, View, type ImageRequireSource } from 'react-native';
import type { VehicleType } from '@/types';

type PassengerTrackingMarkerProps = {
  status: PassengerTrackingMarkerStatus;
  onReady?: () => void;
};

type VehicleTrackingMarkerProps = {
  onReady?: () => void;
  vehicleType?: VehicleType;
};

export type PassengerTrackingMarkerStatus = 'pickup' | 'live' | 'arrived';

const PASSENGER_MARKER_SIZES = MAP_MARKER_SIZES.passengerTracking;
const VEHICLE_MARKER_SIZES = MAP_MARKER_SIZES.vehicleTracking;

const vehicleTrackingMarkerImages: Record<VehicleType, ImageRequireSource> = {
  car: require('@/assets/images/map-markers/trip-marker-car.png'),
  moto: require('@/assets/images/map-markers/trip-marker-moto.png'),
  tricycle: require('@/assets/images/map-markers/trip-marker-tricycle.png'),
};

export function getVehicleTrackingMarkerImage(vehicleType?: VehicleType): ImageRequireSource {
  return vehicleTrackingMarkerImages[vehicleType ?? 'car'] ?? vehicleTrackingMarkerImages.car;
}

const passengerMarkerMeta: Record<
  PassengerTrackingMarkerStatus,
  { color: string; icon: keyof typeof Ionicons.glyphMap; ring: string }
> = {
  pickup: { color: Colors.secondary, icon: 'person-add', ring: Colors.secondary + '20' },
  live: { color: Colors.success, icon: 'person', ring: Colors.success + '20' },
  arrived: { color: Colors.primary, icon: 'flag', ring: Colors.primary + '20' },
};

export const PASSENGER_TRACKING_MARKER_ANCHOR = MAP_MARKER_ANCHORS.passengerTracking;
export const VEHICLE_TRACKING_MARKER_ANCHOR = MAP_MARKER_ANCHORS.vehicleTracking;

export const PassengerTrackingMarker = memo(function PassengerTrackingMarker({
  status,
  onReady,
}: PassengerTrackingMarkerProps) {
  const meta = passengerMarkerMeta[status] ?? passengerMarkerMeta.pickup;

  return (
    <View collapsable={false} style={styles.passengerMarkerFrame} onLayout={onReady}>
      <View style={[styles.passengerMarkerRing, { backgroundColor: meta.ring }]}>
        <View style={[styles.passengerMarkerBody, { backgroundColor: meta.color }]}>
          <Ionicons name={meta.icon} size={PASSENGER_MARKER_SIZES.icon} color={Colors.white} />
        </View>
      </View>
      <View style={[styles.passengerMarkerTip, { borderTopColor: meta.color }]} />
    </View>
  );
});

export const VehicleTrackingMarker = memo(function VehicleTrackingMarker({
  onReady,
  vehicleType = 'car',
}: VehicleTrackingMarkerProps) {
  const markerImage = getVehicleTrackingMarkerImage(vehicleType);

  return (
    <View collapsable={false} style={styles.vehicleFrame}>
      <Image
        source={markerImage}
        style={styles.vehicleImage}
        resizeMode="contain"
        fadeDuration={0}
        onLoadEnd={onReady}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  passengerMarkerFrame: {
    width: PASSENGER_MARKER_SIZES.frameWidth,
    height: PASSENGER_MARKER_SIZES.frameHeight,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'visible',
  },
  passengerMarkerRing: {
    width: PASSENGER_MARKER_SIZES.ring,
    height: PASSENGER_MARKER_SIZES.ring,
    borderRadius: PASSENGER_MARKER_SIZES.ring / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerMarkerBody: {
    width: PASSENGER_MARKER_SIZES.body,
    height: PASSENGER_MARKER_SIZES.body,
    borderRadius: PASSENGER_MARKER_SIZES.body / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    elevation: PASSENGER_MARKER_SIZES.elevation,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  passengerMarkerTip: {
    marginTop: PASSENGER_MARKER_SIZES.tipMarginTop,
    width: 0,
    height: 0,
    borderLeftWidth: PASSENGER_MARKER_SIZES.tipHalfWidth,
    borderRightWidth: PASSENGER_MARKER_SIZES.tipHalfWidth,
    borderTopWidth: PASSENGER_MARKER_SIZES.tipHeight,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  vehicleFrame: {
    width: VEHICLE_MARKER_SIZES.frame,
    height: VEHICLE_MARKER_SIZES.frame,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  vehicleImage: {
    width: VEHICLE_MARKER_SIZES.image,
    height: VEHICLE_MARKER_SIZES.image,
  },
});
