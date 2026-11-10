import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/** One native timeline for the two waves; no per-frame React state or JS timer. */
export function useRequestPickupRipple(enabled: boolean) {
  const value = useRef<Animated.Value | null>(null);
  if (!value.current) value.current = new Animated.Value(0);
  const progress = value.current;
  useEffect(() => {
    progress.setValue(0);
    if (!enabled) return;
    let alive = true, preferenceChanged = false;
    let animation: Animated.CompositeAnimation | undefined;
    const applyPreference = (reduced: boolean) => {
      if (!alive) return;
      animation?.stop(); progress.stopAnimation(); progress.setValue(0);
      if (reduced) return;
      animation = Animated.loop(Animated.timing(progress, {
        toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
      }));
      animation.start();
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => {
      preferenceChanged = true; applyPreference(reduced);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!preferenceChanged) applyPreference(reduced);
    }).catch(() => { /* An unreadable preference leaves a static location marker. */ });
    return () => { alive = false; subscription.remove(); animation?.stop(); progress.stopAnimation(); };
  }, [enabled, progress]);
  return progress;
}
