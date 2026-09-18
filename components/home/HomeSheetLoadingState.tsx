import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Text,
  View
} from 'react-native';

import { styles } from '@/features/home/HomeSheetLoadingState.styles';
export function HomeSheetLoadingState({ active = true }: { active?: boolean }) {
  const progressRef = useRef<Animated.Value | null>(null);
  if (progressRef.current === null) progressRef.current = new Animated.Value(0);
  const shimmerProgress = progressRef.current;

  useEffect(() => {
    if (!active) return;
    const shimmerAnimation = Animated.loop(
      Animated.timing(shimmerProgress, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );

    shimmerAnimation.start();

    return () => {
      shimmerAnimation.stop();
    };
  }, [active, shimmerProgress]);

  const shimmerTranslateX = useMemo(() => shimmerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-90, 230],
  }), [shimmerProgress]);

  return (
    <View style={styles.sheetLoadingState}>
      <View style={styles.sheetLoadingHeader}>
        <View style={styles.sheetLoadingIcon}>
          <Ionicons name="car-sport-outline" size={20} color={Colors.primary} />
        </View>
        <View style={styles.sheetLoadingCopy}>
          <Text style={styles.sheetLoadingTitle}>Recherche des meilleurs départs</Text>
          <Text style={styles.sheetLoadingText}>On actualise les trajets disponibles.</Text>
        </View>
      </View>
      <View style={styles.sheetLoadingPreview}>
        <Animated.View
          pointerEvents="none"
          style={[styles.sheetLoadingShimmer, { transform: [{ translateX: shimmerTranslateX }] }]}
        />
        <View style={styles.sheetLoadingPreviewTop}>
          <View style={styles.sheetLoadingAvatar} />
          <View style={styles.sheetLoadingLines}>
            <View style={styles.sheetLoadingLineStrong} />
            <View style={styles.sheetLoadingLineSoft} />
          </View>
        </View>
        <View style={styles.sheetLoadingRouteRow}>
          <View style={styles.sheetLoadingRouteDot} />
          <View style={styles.sheetLoadingRouteLine} />
          <View style={[styles.sheetLoadingRouteDot, styles.sheetLoadingRouteDotEnd]} />
        </View>
      </View>
    </View>
  );
}
