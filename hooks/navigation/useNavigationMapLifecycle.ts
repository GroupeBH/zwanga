import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { InteractionManager, Platform, type LayoutChangeEvent } from 'react-native';
import type MapView from 'react-native-maps';
import { warnThrottled } from '@/utils/throttledWarning';

/** Owns native map readiness and screen transitions, not the trip's background tracking. */
export function useNavigationMapLifecycle({
  screenKey, enabled, mapRef,
}: { screenKey: string; enabled: boolean; mapRef: RefObject<MapView | null> }) {
  const [mountedEpoch, setMountedEpoch] = useState<number | null>(null);
  const [released, setReleased] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const readyRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const epochRef = useRef(0);
  const loadedRef = useRef(false);
  const layoutRef = useRef(false);
  const leavingRef = useRef(false);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryRef = useRef<(() => void) | undefined>(undefined);
  const invalidateEpoch = useCallback(() => ++epochRef.current, []);

  useEffect(() => {
    enabledRef.current = enabled;
    const epoch = invalidateEpoch();
    readyRef.current = false;
    loadedRef.current = false;
    layoutRef.current = false;
    leavingRef.current = false;
    recoveryRef.current?.();
    recoveryRef.current = undefined;
    setIsMapReady(false);
    setMountedEpoch(null);
    setReleased(false);
    let mountTimer: ReturnType<typeof setTimeout> | undefined;
    const task = enabled ? InteractionManager.runAfterInteractions(() => {
      mountTimer = setTimeout(() => {
        if (epochRef.current === epoch && enabledRef.current && !leavingRef.current) setMountedEpoch(epoch);
      }, Platform.OS === 'ios' ? 420 : 0);
    }) : undefined;
    return () => {
      enabledRef.current = false;
      invalidateEpoch();
      readyRef.current = false;
      task?.cancel();
      if (mountTimer !== undefined) clearTimeout(mountTimer);
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
      if (recoveryTimer.current) clearTimeout(recoveryTimer.current);
      navigationTimer.current = null;
      recoveryTimer.current = null;
    };
  }, [enabled, invalidateEpoch, screenKey]);

  const mayUseCurrentMap = useCallback(() => enabledRef.current && !leavingRef.current &&
    mountedEpoch !== null && mountedEpoch === epochRef.current, [mountedEpoch]);
  const updateReady = useCallback(() => {
    if (!mayUseCurrentMap()) return;
    readyRef.current = loadedRef.current && layoutRef.current;
    setIsMapReady(readyRef.current);
  }, [mayUseCurrentMap]);
  const onMapReady = useCallback(() => {
    if (!mayUseCurrentMap()) return;
    loadedRef.current = true;
    updateReady();
  }, [mayUseCurrentMap, updateReady]);
  const onMapLayout = useCallback((event: LayoutChangeEvent) => {
    if (!mayUseCurrentMap()) return;
    const { width, height } = event.nativeEvent.layout;
    layoutRef.current = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
    updateReady();
  }, [mayUseCurrentMap, updateReady]);

  const runMapCommand = useCallback((command: (map: MapView) => void) => {
    if (!enabledRef.current || leavingRef.current || !readyRef.current || !mapRef.current) return false;
    try { command(mapRef.current); return true; }
    catch (error) { warnThrottled('[NavigationMap] Commande de carte ignorée:', error); return false; }
  }, [mapRef]);

  const navigateAfterRelease = useCallback((navigate: () => void, onRecovered?: () => void) => {
    if (!enabledRef.current || leavingRef.current) return false;
    leavingRef.current = true;
    ++epochRef.current;
    readyRef.current = false;
    loadedRef.current = false;
    layoutRef.current = false;
    setIsMapReady(false);
    setReleased(true);
    recoveryRef.current = onRecovered;
    const recover = () => {
      recoveryTimer.current = null;
      if (!enabledRef.current) return;
      leavingRef.current = false;
      setMountedEpoch(epochRef.current);
      setReleased(false);
      recoveryRef.current?.();
      recoveryRef.current = undefined;
    };
    // First remove native map/marker views; then navigate, with a bounded recovery if navigation fails.
    navigationTimer.current = setTimeout(() => {
      navigationTimer.current = null;
      if (!enabledRef.current) return;
      try {
        navigate();
        if (enabledRef.current) recoveryTimer.current = setTimeout(recover, 1500);
      } catch (error) {
        warnThrottled('[NavigationMap] Changement d’écran impossible:', error);
        recover();
      }
    }, Platform.OS === 'ios' ? 260 : 40);
    return true;
  }, []);

  return {
    shouldRenderMap: enabled && !released && mountedEpoch !== null && mountedEpoch === epochRef.current,
    isMapReady, readyRef, onMapReady, onMapLayout, runMapCommand, navigateAfterRelease,
  };
}
