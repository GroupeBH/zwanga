import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '@/constants/styles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppSelector } from '@/store/hooks';

export default function SplashScreen() {
  const router = useRouter();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Animation du logo
    scale.value = withSequence(
      withSpring(1.2, { damping: 2 }),
      withSpring(1)
    );
    opacity.value = withTiming(1, { duration: 500 });

    // Vérifier le premier lancement et l'authentification
    const checkFirstLaunch = async () => {
      try {
        const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding');
        
        // Attendre un peu pour l'animation
        setTimeout(async () => {
          if (!hasSeenOnboarding) {
            // Premier lancement : afficher l'onboarding
            router.replace('/onboarding');
          } else if (isAuthenticated) {
            // Utilisateur déjà connecté : aller directement à l'app
            router.replace('/(tabs)');
          } else {
            // Utilisateur non connecté : aller à l'authentification
            router.replace('/auth');
          }
        }, 2000);
      } catch (error) {
        console.error('Error checking first launch:', error);
        // En cas d'erreur, rediriger vers l'authentification
        setTimeout(() => {
          router.replace('/auth');
        }, 2000);
      }
    };

    checkFirstLaunch();
  }, [isAuthenticated]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[animatedStyle, styles.logoContainer]}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>Z</Text>
        </View>
        <Text style={styles.title}>ZWANGA</Text>
        <Text style={styles.subtitle}>Covoiturage à Kinshasa</Text>
      </Animated.View>
      
      <Animated.View style={[animatedStyle, styles.loadingContainer]}>
        <View style={styles.loadingDots}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[styles.dot, { opacity: 0.5 + i * 0.2 }]}
            />
          ))}
        </View>
      </Animated.View>
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
  },
  logoText: {
    fontSize: 60,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
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
  loadingContainer: {
    position: 'absolute',
    bottom: 80,
  },
  loadingDots: {
    flexDirection: 'row',
  },
  dot: {
    width: 8,
    height: 8,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    marginHorizontal: Spacing.xs,
  },
});
