import { HOME_LOADER_WAYPOINTS as points } from '@/features/home/homeLoaderJourney';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

export function useHomeLoaderMotion(enabled: boolean) {
  // Keep a composed, static illustration until the accessibility setting is known.
  const [reduceMotion, setReduceMotion] = useState(true);
  const progress = useRef<Animated.Value | null>(null);
  if (!progress.current) progress.current = new Animated.Value(0.5);
  const journey = progress.current;

  useEffect(() => {
    let mounted = true;
    let receivedChange = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      receivedChange = true;
      if (mounted) setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !receivedChange) setReduceMotion(value);
    }).catch(() => { /* Keep the static illustration if native preferences fail. */ });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!enabled || reduceMotion) {
      journey.setValue(0.5);
      return;
    }
    journey.setValue(0);
    // One native timeline for both the car and the arrival halo; no JS timer,
    // frame listener or interaction handle that could delay the dashboard.
    const animation = Animated.loop(Animated.timing(journey, {
      toValue: 1, duration: 3600, easing: Easing.inOut(Easing.quad),
      useNativeDriver: true, isInteraction: false,
    }));
    animation.start();
    return () => { animation.stop(); journey.stopAnimation(); };
  }, [enabled, journey, reduceMotion]);

  return useMemo(() => {
    const inputRange = points.map(point => point.t);
    return {
      car: {
        opacity: journey.interpolate({ inputRange: [0, 0.08, 0.88, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: journey.interpolate({ inputRange, outputRange: points.map(point => point.x) }) },
          { translateY: journey.interpolate({ inputRange, outputRange: points.map(point => point.y) }) },
          { rotate: journey.interpolate({ inputRange, outputRange: points.map(point => point.heading) }) },
        ],
      },
      halo: {
        opacity: journey.interpolate({ inputRange: [0, 0.55, 0.8, 1], outputRange: [0.18, 0.18, 0.3, 0] }),
        transform: [{ scale: journey.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 1, 1.7] }) }],
      },
    };
  }, [journey]);
}
