import { HOME_MAP_ANIMATION_MIN_INTERVAL_MS } from '@/features/home/homeMapPolicy';
import { calculateDistanceMeters } from '@/utils/navigation/routeProgress';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { recordStartupMilestone } from '@/services/startupDiagnostics';

export function useHomeMapCamera(mapRef: RefObject<MapView | null>, enabled: boolean, region: Region) {
  const previous = useRef<Region | null>(null);
  const lastAnimation = useRef(0);
  const [readinessVersion, setReadinessVersion] = useState(0);
  const readiness = useRef({ map: null as MapView | null, ready: false, laidOut: false });
  const active = useRef(enabled);
  active.current = enabled;
  const attachHomeMap = useCallback((map: MapView | null) => {
    if (readiness.current.map === map) return;
    mapRef.current = map;
    readiness.current = { map, ready: false, laidOut: false };
    previous.current = null;
    lastAnimation.current = 0;
    setReadinessVersion(value => value + 1);
    if (map) recordStartupMilestone('home_map_mounted');
  }, [mapRef]);
  const onHomeMapReady = useCallback(() => {
    if (!readiness.current.map || readiness.current.ready) return;
    readiness.current.ready = true;
    setReadinessVersion(value => value + 1);
    recordStartupMilestone('home_map_ready');
  }, []);
  const onHomeMapLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const laidOut = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
    if (readiness.current.laidOut === laidOut) return;
    readiness.current.laidOut = laidOut;
    setReadinessVersion(value => value + 1);
  }, []);
  const animateHomeMapToRegion = useCallback((target: Region, duration = 420) => {
    const state = readiness.current;
    if (!active.current || !state.ready || !state.laidOut || !state.map || state.map !== mapRef.current) return false;
    if (!Object.values(target).every(Number.isFinite) || Math.abs(target.latitude) > 90
      || Math.abs(target.longitude) > 180 || target.latitudeDelta <= 0 || target.longitudeDelta <= 0) return false;
    try {
      state.map.animateToRegion(target, duration);
      return true;
    } catch {
      recordStartupMilestone('home_map_camera_failed');
      return false;
    }
  }, [mapRef]);
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  useEffect(() => {
    if (!enabled) { previous.current = null; return; }
    if (!readiness.current.ready || !readiness.current.laidOut) return;
    const map = mapRef.current;
    const target = { latitude, longitude, latitudeDelta, longitudeDelta };
    const old = previous.current;
    if (old && calculateDistanceMeters(old, target) < 15
      && Math.abs(old.latitudeDelta - latitudeDelta) < 0.0001
      && Math.abs(old.longitudeDelta - longitudeDelta) < 0.0001) return;
    const animate = () => {
      if (map !== mapRef.current || !animateHomeMapToRegion(target)) return;
      previous.current = target;
      lastAnimation.current = Date.now();
    };
    const delay = Math.max(HOME_MAP_ANIMATION_MIN_INTERVAL_MS - (Date.now() - lastAnimation.current), 0);
    if (!delay) { animate(); return; }
    const timer = setTimeout(animate, delay);
    return () => clearTimeout(timer);
  }, [enabled, latitude, longitude, latitudeDelta, longitudeDelta, mapRef, readinessVersion, animateHomeMapToRegion]);
  return { attachHomeMap, onHomeMapReady, onHomeMapLayout, animateHomeMapToRegion };
}
