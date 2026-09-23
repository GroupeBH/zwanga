import { BorderRadius, Colors, FontSizes, Spacing } from '@/constants/styles';
import { shouldDismissHomePriority } from '@/features/home/homePriorityDismissal';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type Props = {
  priorityKey: string;
  enabled: boolean;
  onDismiss: (key: string) => void;
  dismissLabel?: string;
  children: React.ReactNode;
};

export const SwipeableHomePriority = React.memo(function SwipeableHomePriority({ priorityKey, enabled, onDismiss, dismissLabel = 'Masquer sur l’accueil', children }: Props) {
  const translation = useSharedValue(0);
  const width = useSharedValue(320);
  const activeToken = useSharedValue(0);
  const dismissing = useSharedValue(false);
  const committed = useRef(false);
  const generation = useRef(0);
  // Each new focus/key gets a distinct primitive token on both JS and UI threads.
  const lifecycle = useMemo(() => ({ enabled, priorityKey, token: ++generation.current }), [enabled, priorityKey]);
  const token = lifecycle.token;
  const live = useRef<typeof lifecycle | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useLayoutEffect(() => {
    live.current = enabled ? lifecycle : null;
    activeToken.value = enabled ? token : 0;
    committed.current = false;
    cancelAnimation(translation);
    dismissing.value = false;
    translation.value = 0;
    return () => {
      // Invalidate both runtimes before the native view is removed or detached.
      live.current = null;
      activeToken.value = 0;
      cancelAnimation(translation);
      dismissing.value = false;
    };
  }, [activeToken, dismissing, enabled, lifecycle, token, translation]);

  const commit = useCallback(() => {
    if (live.current !== lifecycle || committed.current) return;
    committed.current = true;
    onDismissRef.current(priorityKey);
  }, [lifecycle, priorityKey]);

  const pan = useMemo(() => Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .cancelsTouchesInView(true)
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onStart(() => {
      if (activeToken.value === token && !dismissing.value) cancelAnimation(translation);
    })
    .onUpdate(event => {
      if (activeToken.value !== token || dismissing.value || !Number.isFinite(event.translationX)) return;
      translation.value = Math.max(-width.value, Math.min(width.value, event.translationX));
    })
    .onEnd(event => {
      if (activeToken.value !== token || dismissing.value) return;
      if (shouldDismissHomePriority(event.translationX, event.velocityX, width.value)) {
        dismissing.value = true;
        const target = (event.translationX < 0 ? -1 : 1) * width.value * 1.1;
        translation.value = withTiming(target, { duration: 180 }, finished => {
          if (activeToken.value !== token) return;
          if (!finished) {
            dismissing.value = false;
            return;
          }
          runOnJS(commit)();
        });
      } else {
        translation.value = withTiming(0, { duration: 160 });
      }
    })
    .onFinalize((_event, success) => {
      if (activeToken.value !== token || dismissing.value) return;
      if (!success) translation.value = withTiming(0, { duration: 160 });
    }), [activeToken, commit, dismissing, enabled, token, translation, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translation.value }],
    opacity: 1 - Math.min(Math.abs(translation.value) / Math.max(width.value, 1), 1) * 0.6,
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: Math.min(Math.abs(translation.value) / 60, 1),
  }));

  return (
    <View style={styles.container} onLayout={event => {
      const nextWidth = event.nativeEvent.layout.width;
      if (Number.isFinite(nextWidth) && nextWidth > 0) width.value = nextWidth;
    }}>
      <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="eye-off-outline" size={20} color={Colors.gray[600]} />
        <Text style={styles.label}>{dismissLabel}</Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View collapsable={false} style={animatedStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { borderRadius: BorderRadius.lg, overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.gray[100], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  label: { color: Colors.gray[600], fontSize: FontSizes.sm },
});
