import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

interface OnboardingStep {
  id: number;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 1,
    icon: 'car-sport',
    title: 'Trouvez votre trajet',
    description: 'Recherchez des trajets disponibles près de chez vous et réservez votre place en quelques clics.',
    color: Colors.primary,
  },
  {
    id: 2,
    icon: 'people',
    title: 'Voyagez en sécurité',
    description: 'Tous nos conducteurs sont vérifiés et notés par la communauté pour garantir votre sécurité.',
    color: Colors.info,
  },
  {
    id: 3,
    icon: 'wallet',
    title: 'Économisez de l\'argent',
    description: 'Partagez les frais de transport et économisez jusqu\'à 70% sur vos déplacements.',
    color: Colors.success,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      scrollViewRef.current?.scrollTo({ x: nextStep * width, animated: true });
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    handleFinish();
  };

  const handleFinish = async () => {
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
      router.replace('/auth');
    } catch (error) {
      console.error('Error saving onboarding status:', error);
      router.replace('/auth');
    }
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const step = Math.round(offsetX / width);
    setCurrentStep(step);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Skip button */}
      <View style={styles.skipContainer}>
        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Passer</Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable content */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {onboardingSteps.map((step, index) => (
          <View key={step.id} style={styles.stepContainer}>
            <Animated.View
              entering={FadeInDown.delay(index * 100)}
              exiting={FadeOutUp}
              style={styles.content}
            >
              {/* Icon */}
              <View style={[styles.iconContainer, { backgroundColor: `${step.color}15` }]}>
                <Ionicons name={step.icon} size={80} color={step.color} />
              </View>

              {/* Title */}
              <Text style={styles.title}>{step.title}</Text>

              {/* Description */}
              <Text style={styles.description}>{step.description}</Text>
            </Animated.View>
          </View>
        ))}
      </ScrollView>

      {/* Indicators */}
      <View style={styles.indicatorsContainer}>
        {onboardingSteps.map((_, index) => (
          <View
            key={index}
            style={[
              styles.indicator,
              currentStep === index && styles.indicatorActive,
            ]}
          />
        ))}
      </View>

      {/* Navigation buttons */}
      <View style={styles.buttonContainer}>
        {currentStep > 0 && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              const prevStep = currentStep - 1;
              setCurrentStep(prevStep);
              scrollViewRef.current?.scrollTo({ x: prevStep * width, animated: true });
            }}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.gray[700]} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.nextButton, { flex: currentStep === 0 ? 1 : 0.8 }]}
          onPress={handleNext}
        >
          <Text style={styles.nextButtonText}>
            {currentStep === onboardingSteps.length - 1 ? 'Commencer' : 'Suivant'}
          </Text>
          {currentStep < onboardingSteps.length - 1 && (
            <Ionicons name="arrow-forward" size={24} color={Colors.white} />
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  skipContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    alignItems: 'flex-end',
  },
  skipButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  skipText: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  scrollView: {
    flex: 1,
  },
  stepContainer: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  description: {
    fontSize: FontSizes.lg,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 28,
    paddingHorizontal: Spacing.xl,
  },
  indicatorsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[300],
  },
  indicatorActive: {
    width: 24,
    backgroundColor: Colors.primary,
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
    alignItems: 'center',
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    ...CommonStyles.shadowMd,
  },
  nextButtonText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
});

