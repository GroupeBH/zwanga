import { HOME_COLORS } from '@/features/home/homeModel';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  TouchableOpacity
} from 'react-native';

import type { useHomeSheet } from '@/hooks/home/useHomeSheet';
import type { useHomeUserLocation } from '@/hooks/home/useHomeUserLocation';

import { styles } from '@/features/home/HomeLocationButton.styles';
type Props =
  Pick<ReturnType<typeof useHomeSheet>,
    'locationButtonBottom'
  >
  & Pick<ReturnType<typeof useHomeUserLocation>,
    'handleReturnToUserLocation'
    | 'isCenteringOnUser'
  >;
export const HomeLocationButton = React.memo(function HomeLocationButton({ locationButtonBottom, handleReturnToUserLocation, isCenteringOnUser }: Props) {
  return (<TouchableOpacity
    activeOpacity={0.82}
    accessibilityRole="button"
    accessibilityLabel="Revenir à ma position"
    style={[styles.locationButton, { bottom: locationButtonBottom }]}
    onPress={handleReturnToUserLocation}
    disabled={isCenteringOnUser}
  >
    {isCenteringOnUser ? (
      <ActivityIndicator size="small" color={HOME_COLORS.navy} />
    ) : (
      <Ionicons name="locate" size={22} color={HOME_COLORS.navy} />
    )}
  </TouchableOpacity>);
});
