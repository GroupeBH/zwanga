import { HOME_COLORS } from '@/features/home/homeModel';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  TouchableOpacity, Text, View, StyleSheet
} from 'react-native';

import type { useHomeSheet } from '@/hooks/home/useHomeSheet';
import type { useHomeUserLocation } from '@/hooks/home/useHomeUserLocation';

import { styles } from '@/features/home/HomeLocationButton.styles';
import { useLocationRecovery } from '@/hooks/location-picker/useLocationRecovery';
import { locationAccessMessage } from '@/features/location-picker/locationAccessMessage';
import { LocationRecoveryAction } from '@/components/location/LocationRecoveryAction';
type Props =
  Pick<ReturnType<typeof useHomeSheet>,
    'locationButtonBottom'
  >
  & Pick<ReturnType<typeof useHomeUserLocation>,
    'handleReturnToUserLocation'
    | 'isCenteringOnUser'
  > & { active: boolean };
export const HomeLocationButton = React.memo(function HomeLocationButton({ locationButtonBottom, handleReturnToUserLocation, isCenteringOnUser, active }: Props) {
  const recovery = useLocationRecovery(() => { void handleReturnToUserLocation(); }, active);
  const busy = isCenteringOnUser || recovery.busy;
  return (<><TouchableOpacity
    activeOpacity={0.82}
    accessibilityRole="button"
    accessibilityLabel="Revenir à ma position"
    style={[styles.locationButton, { bottom: locationButtonBottom }]}
    onPress={() => void recovery.request()}
    accessibilityState={{ busy, disabled: busy || !active }}
    disabled={busy || !active}
  >
    {busy ? (
      <ActivityIndicator size="small" color={HOME_COLORS.navy} />
    ) : (
      <Ionicons name="locate" size={22} color={HOME_COLORS.navy} />
    )}
  </TouchableOpacity>
    {active && (recovery.issue || recovery.error) && <View style={[s.recovery, { bottom: locationButtonBottom + 56 }]}>
      {recovery.issue && <Text style={s.copy} accessibilityLiveRegion="polite">{locationAccessMessage(recovery.issue)}</Text>}
      <LocationRecoveryAction recovery={recovery} />
    </View>}
  </>);
});
const s = StyleSheet.create({
  recovery: { position: 'absolute', right: 16, left: 16, zIndex: 9, backgroundColor: '#FFFFFF', padding: 12, borderRadius: 16 },
  copy: { fontSize: 14, lineHeight: 20, color: '#4B5563' },
});
