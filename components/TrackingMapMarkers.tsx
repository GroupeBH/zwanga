import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Image, Platform, StyleSheet, View, type ImageRequireSource } from 'react-native';
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

const IS_ANDROID = Platform.OS === 'android';

const vehicleTrackingMarkerImages: Record<VehicleType, ImageRequireSource> = {
  car: require('@/assets/images/map-markers/trip-marker-car.png'),
  moto: require('@/assets/images/map-markers/trip-marker-moto.png'),
  tricycle: require('@/assets/images/map-markers/trip-marker-tricycle.png'),
};

const passengerMarkerMeta: Record<
  PassengerTrackingMarkerStatus,
  { color: string; icon: keyof typeof Ionicons.glyphMap; ring: string }
> = {
  pickup: { color: Colors.secondary, icon: 'person-add', ring: Colors.secondary + '20' },
  live: { color: Colors.success, icon: 'person', ring: Colors.success + '20' },
  arrived: { color: Colors.primary, icon: 'flag', ring: Colors.primary + '20' },
};

export const PASSENGER_TRACKING_MARKER_ANCHOR = { x: 0.5, y: 0.92 };
export const VEHICLE_TRACKING_MARKER_ANCHOR = { x: 0.5, y: 0.5 };

export const PassengerTrackingMarker = memo(function PassengerTrackingMarker({
  status,
  onReady,
}: PassengerTrackingMarkerProps) {
  const meta = passengerMarkerMeta[status] ?? passengerMarkerMeta.pickup;

  return (
    <View collapsable={false} style={styles.passengerMarkerFrame} onLayout={onReady}>
      <View style={[styles.passengerMarkerRing, { backgroundColor: meta.ring }]}>
        <View style={[styles.passengerMarkerBody, { backgroundColor: meta.color }]}>
          <Ionicons name={meta.icon} size={16} color={Colors.white} />
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
  const markerImage = vehicleTrackingMarkerImages[vehicleType] ?? vehicleTrackingMarkerImages.car;

  return (
    <View collapsable={false} style={styles.vehicleFrame} onLayout={onReady}>
      <Image source={markerImage} style={styles.vehicleImage} resizeMode="contain" />
    </View>
  );
});

const styles = StyleSheet.create({
  passengerMarkerFrame: {
    width: 46,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  passengerMarkerRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerMarkerBody: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    elevation: 4,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  passengerMarkerTip: {
    marginTop: -2,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  vehicleFrame: {
    width: IS_ANDROID ? 72 : 76,
    height: IS_ANDROID ? 72 : 76,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  vehicleImage: {
    width: IS_ANDROID ? 48 : 58,
    height: IS_ANDROID ? 48 : 58,
  },
});
