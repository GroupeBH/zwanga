import { HOME_MAP_ANIMATION_MIN_INTERVAL_MS } from '@/features/home/homeMapPolicy';
import { calculateDistanceMeters } from '@/utils/navigation/routeProgress';
import { useEffect, useRef, type RefObject } from 'react';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';

export function useHomeMapCamera(mapRef: RefObject<MapView | null>, enabled: boolean, region: Region) {
  const previous = useRef<Region | null>(null);
  const lastAnimation = useRef(0);
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  useEffect(() => {
    if (!enabled) { previous.current = null; return; }
    const target = { latitude, longitude, latitudeDelta, longitudeDelta };
    const old = previous.current;
    if (old && calculateDistanceMeters(old, target) < 15
      && Math.abs(old.latitudeDelta - latitudeDelta) < 0.0001
      && Math.abs(old.longitudeDelta - longitudeDelta) < 0.0001) return;
    const animate = () => {
      if (!mapRef.current) return;
      previous.current = target;
      lastAnimation.current = Date.now();
      mapRef.current.animateToRegion(target, 420);
    };
    const delay = Math.max(HOME_MAP_ANIMATION_MIN_INTERVAL_MS - (Date.now() - lastAnimation.current), 0);
    if (!delay) { animate(); return; }
    const timer = setTimeout(animate, delay);
    return () => clearTimeout(timer);
  }, [enabled, latitude, longitude, latitudeDelta, longitudeDelta, mapRef]);
}
