import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import type MapView from 'react-native-maps';
import type { EdgePadding, LatLng, Region } from 'react-native-maps';
import { fitNavigationCamera, type MapLayout } from '@/utils/navigation/mapCamera';
import { routeBounds } from '@/utils/routes/safePolyline';

/** Overview only: never fight a gesture or refit for an identical polling response. */
export function useRouteOverviewCamera({ routeKey, coordinates, isReady, edgePadding, mapLayoutRef,
  runMapCommand, layoutKey = '' }: {
  routeKey: string; coordinates: LatLng[]; isReady: boolean; edgePadding: EdgePadding;
  mapLayoutRef: RefObject<MapLayout | null>; layoutKey?: string | number;
  runMapCommand: (command: (map: MapView) => void) => boolean;
}) {
  const state = useRef({ routeKey, fitted: '', moved: false, lastPress: -Infinity });
  if (state.current.routeKey !== routeKey) state.current = { routeKey, fitted: '', moved: false, lastPress: -Infinity };
  const bounds = useMemo(() => routeBounds(coordinates), [coordinates]);
  const signature = bounds ? JSON.stringify([routeKey, bounds, edgePadding, mapLayoutRef.current, layoutKey]) : '';
  const fit = useCallback((animated: boolean) => {
    if (!isReady || !signature) return false;
    let fitted = false;
    const ran = runMapCommand(map => {
      fitted = fitNavigationCamera(map, coordinates, mapLayoutRef.current, { edgePadding, animated });
    });
    if (ran && fitted) state.current.fitted = signature;
    return ran && fitted;
  }, [isReady, signature, runMapCommand, coordinates, mapLayoutRef, edgePadding]);
  useEffect(() => {
    if (!isReady) { state.current.fitted = ''; state.current.moved = false; return; }
    if (!state.current.moved && state.current.fitted !== signature) fit(false);
  }, [isReady, signature, fit]);
  const onPanDrag = useCallback(() => { state.current.moved = true; }, []);
  const onRegionChangeComplete = useCallback((_region: Region, details: { isGesture?: boolean }) => {
    if (details?.isGesture) state.current.moved = true;
  }, []);
  const recenter = useCallback(() => {
    const now = Date.now();
    if (now - state.current.lastPress < 400) return;
    if (fit(true)) { state.current.moved = false; state.current.lastPress = now; }
  }, [fit]);
  return { onPanDrag, onRegionChangeComplete, recenter };
}
