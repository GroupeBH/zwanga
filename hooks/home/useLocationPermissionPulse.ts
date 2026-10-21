import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

/** A slow native halo, never a flashing label or a JS polling timer. */
export function useLocationPermissionPulse(enabled: boolean) {
  const value = useRef<Animated.Value | null>(null);
  if (!value.current) value.current = new Animated.Value(0.2);
  const opacity = value.current;
  useEffect(() => {
    opacity.setValue(0.2);
    if (!enabled) return;
    let alive = true;
    let preferenceChanged = false;
    let animation: Animated.CompositeAnimation | undefined;
    const applyPreference = (reduced: boolean) => {
      if (!alive) return;
      animation?.stop(); opacity.stopAnimation(); opacity.setValue(0.2);
      if (reduced) return;
      animation = Animated.loop(Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 1400, useNativeDriver: true, isInteraction: false }),
        Animated.timing(opacity, { toValue: 0.2, duration: 1400, useNativeDriver: true, isInteraction: false }),
      ]));
      animation.start();
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => {
      preferenceChanged = true; applyPreference(reduced);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!preferenceChanged) applyPreference(reduced);
    }).catch(() => { /* Keep a static button if the preference cannot be read. */ });
    return () => {
      alive = false; subscription.remove(); animation?.stop(); opacity.stopAnimation();
    };
  }, [enabled, opacity]);
  return opacity;
}
