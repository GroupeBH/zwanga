import { Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type PassengerTrackingMarkerProps = {
  isLive: boolean;
  name: string;
  onReady?: () => void;
};

export const PASSENGER_TRACKING_MARKER_ANCHOR = { x: 0.5, y: 0.78 };
export const VEHICLE_TRACKING_MARKER_ANCHOR = { x: 0.5, y: 0.5 };

export const PassengerTrackingMarker = memo(function PassengerTrackingMarker({
  isLive,
  name,
  onReady,
}: PassengerTrackingMarkerProps) {
  return (
    <View collapsable={false} style={styles.passengerContainer} onLayout={onReady}>
      <View style={styles.passengerLabel}>
        <View style={[styles.statusDot, isLive && styles.statusDotLive]} />
        <View style={styles.passengerLabelCopy}>
          <Text style={styles.passengerName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.passengerProfileHint} numberOfLines={1}>
            Voir le profil
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color={Colors.primary} />
      </View>
      <View style={styles.labelTip} />
      <View style={styles.passengerIcon}>
        <Ionicons name="person" size={15} color={Colors.white} />
      </View>
    </View>
  );
});

export const VehicleTrackingMarker = memo(function VehicleTrackingMarker() {
  return (
    <View collapsable={false} style={styles.vehicleFrame}>
      <View style={styles.vehicleBody}>
        <View style={styles.vehicleFrontLights}>
          <View style={styles.vehicleLight} />
          <View style={styles.vehicleLight} />
        </View>
        <View style={styles.vehicleWindshield} />
        <View style={styles.vehicleRearWindow} />
        <View style={[styles.vehicleWheel, styles.vehicleWheelFrontLeft]} />
        <View style={[styles.vehicleWheel, styles.vehicleWheelFrontRight]} />
        <View style={[styles.vehicleWheel, styles.vehicleWheelRearLeft]} />
        <View style={[styles.vehicleWheel, styles.vehicleWheelRearRight]} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  passengerContainer: {
    width: 152,
    height: 86,
    paddingTop: 4,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  passengerLabel: {
    width: 144,
    minHeight: 42,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    elevation: 3,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.gray[400],
  },
  statusDotLive: {
    backgroundColor: Colors.success,
  },
  passengerLabelCopy: {
    flex: 1,
    minWidth: 0,
  },
  passengerName: {
    color: Colors.gray[900],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  passengerProfileHint: {
    marginTop: 1,
    color: Colors.primary,
    fontSize: 10,
    fontWeight: FontWeights.medium,
  },
  labelTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.white,
  },
  passengerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
    borderWidth: 2,
    borderColor: Colors.white,
    elevation: 3,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
  },
  vehicleFrame: {
    width: 44,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleBody: {
    width: 22,
    height: 38,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.white,
    backgroundColor: Colors.primary,
    elevation: 4,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 3,
  },
  vehicleFrontLights: {
    position: 'absolute',
    top: 2,
    left: 3,
    right: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  vehicleLight: {
    width: 4,
    height: 3,
    borderRadius: 1,
    backgroundColor: '#F7D774',
  },
  vehicleWindshield: {
    position: 'absolute',
    top: 8,
    left: 3,
    right: 3,
    height: 9,
    borderRadius: 3,
    backgroundColor: '#CFE4F7',
  },
  vehicleRearWindow: {
    position: 'absolute',
    bottom: 6,
    left: 4,
    right: 4,
    height: 7,
    borderRadius: 2,
    backgroundColor: '#9FC2DE',
  },
  vehicleWheel: {
    position: 'absolute',
    width: 3,
    height: 8,
    borderRadius: 1,
    backgroundColor: Colors.gray[900],
  },
  vehicleWheelFrontLeft: {
    top: 7,
    left: -4,
  },
  vehicleWheelFrontRight: {
    top: 7,
    right: -4,
  },
  vehicleWheelRearLeft: {
    bottom: 6,
    left: -4,
  },
  vehicleWheelRearRight: {
    right: -4,
    bottom: 6,
  },
});
