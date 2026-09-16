import { Colors } from '@/constants/styles';
import { HOME_COLORS } from '@/features/home/homeModel';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { styles } from '@/features/home/HomeTripsLoadingScreen.styles';
export function HomeTripsLoadingScreen() {
  const pulse = useRef(new Animated.Value(0)).current;
  const vehicleProgress = useRef(new Animated.Value(0)).current;
  const shimmerProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const vehicleAnimation = Animated.loop(
      Animated.timing(vehicleProgress, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    const shimmerAnimation = Animated.loop(
      Animated.timing(shimmerProgress, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    pulseAnimation.start();
    vehicleAnimation.start();
    shimmerAnimation.start();

    return () => {
      pulseAnimation.stop();
      vehicleAnimation.stop();
      shimmerAnimation.stop();
    };
  }, [pulse, shimmerProgress, vehicleProgress]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.28],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });
  const vehicleTranslateX = vehicleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 172],
  });
  const shimmerTranslateX = shimmerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 260],
  });

  return (
    <SafeAreaView style={styles.homeLoaderContainer}>
      <View style={styles.homeLoaderShell}>
        <View style={styles.homeLoaderMapPane}>
          <View style={[styles.homeLoaderRoad, styles.homeLoaderRoadVertical]} />
          <View style={[styles.homeLoaderRoad, styles.homeLoaderRoadDiagonal]} />
          <View style={[styles.homeLoaderRoad, styles.homeLoaderRoadSoft]} />

          <View style={styles.homeLoaderPulseAnchor}>
            <Animated.View
              style={[
                styles.homeLoaderPulseRing,
                {
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <View style={styles.homeLoaderGpsDot}>
              <Ionicons name="navigate" size={15} color={Colors.white} />
            </View>
          </View>

          <View style={styles.homeLoaderRouteTrack}>
            <View style={styles.homeLoaderRouteLine} />
            <View style={[styles.homeLoaderRoutePoint, styles.homeLoaderRouteStartPoint]} />
            <Animated.View style={[styles.homeLoaderVehicle, { transform: [{ translateX: vehicleTranslateX }] }]}>
              <Ionicons name="car-sport-outline" size={17} color={Colors.white} />
            </Animated.View>
            <View style={[styles.homeLoaderRoutePoint, styles.homeLoaderRouteEndPoint]} />
          </View>
        </View>

        <View style={styles.homeLoaderCopy}>
          <View style={styles.homeLoaderLogoRow}>
            <View style={styles.homeLoaderLogo}>
              <Text style={styles.homeLoaderLogoText}>Z</Text>
            </View>
            <View style={styles.homeLoaderTitleBlock}>
              <Text style={styles.homeLoaderTitle}>Recherche des trajets proches</Text>
              <Text style={styles.homeLoaderText}>Places, horaires et conducteurs autour de vous.</Text>
            </View>
          </View>

          <View style={styles.homeLoaderStatusRow}>
            <View style={styles.homeLoaderStatusPill}>
              <Ionicons name="location-outline" size={14} color={HOME_COLORS.success} />
              <Text style={styles.homeLoaderStatusText}>Départ détecté</Text>
            </View>
            <View style={styles.homeLoaderStatusPill}>
              <Ionicons name="car-sport-outline" size={14} color={Colors.primary} />
              <Text style={styles.homeLoaderStatusText}>Trajets actifs</Text>
            </View>
          </View>

          <View style={styles.homeLoaderTripPreview}>
            <Animated.View
              pointerEvents="none"
              style={[styles.homeLoaderShimmer, { transform: [{ translateX: shimmerTranslateX }] }]}
            />
            <View style={styles.homeLoaderTripTopRow}>
              <View style={styles.homeLoaderAvatarSkeleton} />
              <View style={styles.homeLoaderTripCopy}>
                <View style={styles.homeLoaderLineStrong} />
                <View style={styles.homeLoaderLineShort} />
              </View>
              <View style={styles.homeLoaderPriceSkeleton} />
            </View>
            <View style={styles.homeLoaderRoutePreview}>
              <View style={styles.homeLoaderRoutePreviewRail}>
                <View style={[styles.homeLoaderMiniDot, styles.homeLoaderMiniStart]} />
                <View style={styles.homeLoaderMiniLine} />
                <View style={[styles.homeLoaderMiniDot, styles.homeLoaderMiniEnd]} />
              </View>
              <View style={styles.homeLoaderTripCopy}>
                <View style={styles.homeLoaderWideLine} />
                <View style={styles.homeLoaderMediumLine} />
              </View>
            </View>
            <View style={styles.homeLoaderChipRow}>
              <View style={styles.homeLoaderChipSkeleton} />
              <View style={styles.homeLoaderChipSkeletonWide} />
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
