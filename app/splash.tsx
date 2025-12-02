import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useAppSelector } from '@/store/hooks';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

export default function SplashScreen() {
  const router = useRouter();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);

  const logoScale = useSharedValue(0.9);
  const logoOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    logoScale.value = withTiming(1, { duration: 600 });
    logoOpacity.value = withTiming(1, { duration: 600 });
    titleOpacity.value = withDelay(150, withTiming(1, { duration: 700 }));
    progress.value = withTiming(1, { duration: 1800 });

    const checkFirstLaunch = async () => {
      try {
        const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding');
        setTimeout(async () => {
          if (!hasSeenOnboarding) {
            router.replace('/onboarding');
          } else if (isAuthenticated) {
            router.replace('/(tabs)');
          } else {
            router.replace('/auth');
          }
        }, 1800);
      } catch (error) {
        console.error('Error checking first launch:', error);
        setTimeout(() => router.replace('/auth'), 1800);
      }
    };

    checkFirstLaunch();
  }, [isAuthenticated, logoOpacity, logoScale, progress, router, titleOpacity]);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [
      {
        translateY: withTiming(titleOpacity.value ? 0 : 12, { duration: 700 }),
      },
    ],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.glow} />
      <Animated.View style={[styles.logoContainer, logoStyle]}>
        <View style={styles.logoCircle}>
          <Image 
            source={require('@/assets/images/zwanga-transparent.png')} 
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <Animated.Text style={[styles.title, titleStyle]}>ZWANGA</Animated.Text>
        <Animated.Text style={[styles.subtitle, titleStyle]}>
          Covoiturage à Kinshasa
        </Animated.Text>
      </Animated.View>

      <View style={styles.progressWrapper}>
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    top: '35%',
    left: '25%',
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoCircle: {
    width: 128,
    height: 128,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    padding: Spacing.md,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: FontSizes.xxxxl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.lg,
    color: Colors.white,
    opacity: 0.9,
  },
  progressWrapper: {
    position: 'absolute',
    bottom: 80,
    width: '60%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.white,
  },
});
