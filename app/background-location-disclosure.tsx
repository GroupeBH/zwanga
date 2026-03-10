import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useAppSelector } from '@/store/hooks';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BACKGROUND_DISCLOSURE_KEY = 'hasSeenBackgroundLocationDisclosure';

const DISCLOSURE_POINTS = [
  {
    icon: 'navigate',
    iconColor: '#2563EB',
    iconBg: 'rgba(37,99,235,0.12)',
    text: 'Maintenir la navigation GPS pendant un trajet actif, meme en arriere-plan.',
  },
  {
    icon: 'car',
    iconColor: '#059669',
    iconBg: 'rgba(5,150,105,0.12)',
    text: 'Permettre le suivi en temps reel entre conducteur et passagers du trajet en cours.',
  },
  {
    icon: 'shield-checkmark',
    iconColor: '#D97706',
    iconBg: 'rgba(217,119,6,0.14)',
    text: 'Le partage est limite au trajet actif et peut etre refuse dans la permission systeme.',
  },
] as const;

export default function BackgroundLocationDisclosureScreen() {
  const router = useRouter();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await AsyncStorage.setItem(BACKGROUND_DISCLOSURE_KEY, 'true');
      router.replace(isAuthenticated ? '/(tabs)' : '/auth-entry');
    } catch (error) {
      console.error('Error saving background disclosure status:', error);
      router.replace(isAuthenticated ? '/(tabs)' : '/auth-entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LinearGradient
      colors={['#FFF7ED', '#FFFFFF', '#ECFEFF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.topChip}>
            <Ionicons name="information-circle" size={16} color={Colors.primary} />
            <Text style={styles.topChipText}>Information importante</Text>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroIconWrapper}>
              <LinearGradient
                colors={['#E0F2FE', '#DBEAFE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroIconGradient}
              >
                <Ionicons name="location" size={38} color={Colors.primary} />
              </LinearGradient>
            </View>

            <Text style={styles.heroTitle}>Utilisation de la localisation</Text>
            <Text style={styles.heroSubtitle}>
              Zwanga peut utiliser votre position meme lorsque l application est en arriere-plan pendant un trajet actif.
            </Text>
          </View>

          <View style={styles.pointsCard}>
            <Text style={styles.sectionTitle}>Pourquoi nous demandons cet acces</Text>

            <View style={styles.pointsList}>
              {DISCLOSURE_POINTS.map((item) => (
                <View key={item.text} style={styles.pointRow}>
                  <View style={[styles.pointIcon, { backgroundColor: item.iconBg }]}>
                    <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={18} color={item.iconColor} />
                  </View>
                  <Text style={styles.pointText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.noteCard}>
            <Ionicons name="lock-closed" size={18} color={Colors.gray[600]} />
            <Text style={styles.noteText}>
              Vous gardez le controle: vous pourrez accepter ou refuser la permission systeme ensuite.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.continueButton, isSubmitting && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={isSubmitting}
          >
            <LinearGradient
              colors={[Colors.primary, '#FF8A4C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.continueButtonGradient}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Text style={styles.continueButtonText}>J ai compris</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.footerHint}>Cet ecran s affiche une seule fois lors du premier lancement.</Text>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  topChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  topChipText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  heroCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  heroIconWrapper: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  heroIconGradient: {
    width: 86,
    height: 86,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: FontSizes.xxl,
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: FontSizes.base,
    color: Colors.gray[700],
    lineHeight: 24,
    textAlign: 'center',
  },
  pointsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
  },
  pointsList: {
    gap: Spacing.md,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  pointIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  pointText: {
    flex: 1,
    fontSize: FontSizes.sm,
    lineHeight: 21,
    color: Colors.gray[700],
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: Spacing.md,
  },
  noteText: {
    flex: 1,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.gray[700],
  },
  continueButton: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  continueButtonDisabled: {
    opacity: 0.8,
  },
  continueButtonGradient: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  continueButtonText: {
    fontSize: FontSizes.base,
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  footerHint: {
    textAlign: 'center',
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
});
