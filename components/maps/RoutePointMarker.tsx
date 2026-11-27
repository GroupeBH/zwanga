import React, { memo, useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Marker, type MapMarker, type MapMarkerProps } from 'react-native-maps';
import { useNavigationMarkerRefresh } from '@/hooks/navigation/useNavigationMarkerRefresh';

type Kind = 'departure' | 'arrival' | 'passenger';
type Props = Pick<MapMarkerProps, 'coordinate' | 'title' | 'description' | 'zIndex' | 'onPress' | 'identifier'> & {
  kind: Kind; highlighted?: boolean;
};
const CENTER = { x: 0.5, y: 0.5 };
const OFFSET = { x: 0, y: 0 };
const ANDROID = Platform.OS === 'android';

/** A small, sharp map symbol, with a larger transparent touch surface.
 * No image decode, font load, shadow or permanent native snapshot loop. */
export function RoutePointSymbol({ kind, highlighted = false, onReady }: {
  kind: Kind; highlighted?: boolean; onReady?: () => void;
}) {
  return <View collapsable={false} onLayout={onReady} style={s.frame}>
    <View style={[s.symbol, kind === 'departure' ? s.departure : s.arrival,
      kind === 'passenger' && s.passenger, highlighted && s.highlighted]} />
  </View>;
}

export const RoutePointMarker = memo(function RoutePointMarker({ kind, highlighted = false, ...props }: Props) {
  const ref = useRef<MapMarker | null>(null);
  const appearance = `${kind}:${highlighted}`;
  const { onReady, isLoaded } = useNavigationMarkerRefresh(ANDROID, appearance);
  const refresh = useCallback(() => onReady(appearance, () => ref.current), [appearance, onReady]);
  // Also handle a change of symbol without depending on another layout event.
  useEffect(refresh, [refresh]);
  return <Marker {...props} ref={ref} anchor={CENTER} centerOffset={OFFSET}
    tracksViewChanges={ANDROID && !isLoaded(appearance)} tracksInfoWindowChanges={false}>
    <RoutePointSymbol kind={kind} highlighted={highlighted} onReady={refresh} />
  </Marker>;
}, (a, b) => a.kind === b.kind && a.identifier === b.identifier && a.highlighted === b.highlighted && a.title === b.title &&
  a.description === b.description && a.zIndex === b.zIndex && a.onPress === b.onPress &&
  a.coordinate.latitude === b.coordinate.latitude && a.coordinate.longitude === b.coordinate.longitude);

const s = StyleSheet.create({
  frame: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  symbol: { width: 24, height: 24, borderWidth: 3, borderColor: '#FFFFFF' },
  departure: { borderRadius: 12, backgroundColor: '#158C4E' },
  arrival: { borderRadius: 7, backgroundColor: '#D54100' },
  passenger: { backgroundColor: '#4054A8' },
  highlighted: { width: 28, height: 28, borderWidth: 4 },
});
