import { getTripMarkerImage, userLocationMarkerImage } from '@/features/home/homeMapAssets';
import { IS_ANDROID } from '@/features/home/homeMapPolicy';
import type { TripVehicleMapMarkerProps } from '@/features/home/homeTypes';
import React from 'react';
import {
  Image,
  View
} from 'react-native';

import { styles } from '@/features/home/HomeMapMarkers.styles';
export function TripVehicleMapMarker({ isSelected, onReady, trip }: TripVehicleMapMarkerProps) {
  return (
    <View collapsable={false} style={styles.tripVehicleMarkerFrame}>
      <View collapsable={false} style={styles.tripVehicleMarkerImageShell}>
        <Image
          source={getTripMarkerImage(trip, isSelected)}
          style={[styles.tripVehicleMarkerImage, isSelected && styles.tripVehicleMarkerImageSelected]}
          resizeMode="contain"
          onLoadEnd={onReady}
        />
      </View>
    </View>
  );
}

export function UserLocationMapMarker() {
  return (
    <View
      collapsable={false}
      style={[styles.userLocationMarkerFrame, IS_ANDROID && styles.userLocationMarkerFrameAndroid]}
    >
      <Image
        source={userLocationMarkerImage}
        style={[styles.userLocationMarkerImage, IS_ANDROID && styles.userLocationMarkerImageAndroid]}
        resizeMode="contain"
      />
    </View>
  );
}
