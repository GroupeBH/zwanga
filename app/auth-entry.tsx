import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AuthEntryScreen() {
  const router = useRouter();

  const handleLoginPress = () => {
    router.push('/auth?mode=login');
  };

  const handleSignupPress = () => {
    router.push('/auth?mode=signup');
  };

  const handleOpenLegal = () => {
    Linking.openURL('https://zwanga-admin.onrender.com/').catch((err) =>
      console.warn('Unable to open legal URL', err),
    );
  };

  return (
    <LinearGradient
      colors={[Colors.primary, '#0b1727']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.container}>
        {/* Top brand section */}
        <View style={styles.header}>
          <View style={styles.logoWrapper}>
            <View style={styles.logoCircle}>
              <Image
                source={require('@/assets/images/zwanga-transparent.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <View>
              <Text style={styles.appName}>ZWANGA</Text>
              <Text style={styles.appTagline}>Covoiturage à Kinshasa</Text>
            </View>
          </View>

          <View style={styles.badge}>
            <Ionicons name="shield-checkmark" size={18} color={Colors.success} />
            <Text style={styles.badgeText}>Sécurisé & vérifié</Text>
          </View>
        </View>

        {/* Middle content */}
        <View style={styles.content}>
          <Text style={styles.title}>Bienvenue</Text>
          <Text style={styles.subtitle}>
            Rejoignez une communauté de conducteurs et de passagers qui partagent leurs trajets au quotidien.
          </Text>

          <View style={styles.highlightsRow}>
            <View style={styles.highlightCard}>
              <View style={[styles.highlightIcon, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                <Ionicons name="car-sport" size={22} color={Colors.primary} />
              </View>
              <Text style={styles.highlightTitle}>Rapide</Text>
              <Text style={styles.highlightText}>Trouvez ou publiez un trajet en quelques secondes.</Text>
            </View>

            <View style={styles.highlightCard}>
              <View style={[styles.highlightIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                <Ionicons name="people" size={22} color={Colors.success} />
              </View>
              <Text style={styles.highlightTitle}>Communautaire</Text>
              <Text style={styles.highlightText}>Voyagez avec des membres notés et vérifiés.</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleSignupPress}>
            <View style={styles.primaryButtonContent}>
              <Ionicons name="person-add" size={22} color="white" />
              <View style={{ flex: 1 }}>
                <Text style={styles.primaryButtonText}>Créer un compte</Text>
                <Text style={styles.primaryButtonSub}>
                  Je suis nouveau sur Zwanga
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={22} color="white" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleLoginPress}>
            <View style={styles.secondaryButtonContent}>
              <Ionicons name="log-in-outline" size={22} color={Colors.primary} />
              <Text style={styles.secondaryButtonText}>J&apos;ai déjà un compte</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.footerHint} onPress={handleOpenLegal}>
            En continuant, vous acceptez nos conditions d&apos;utilisation et notre politique de confidentialité.
          </Text>
        </View>
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
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  logoCircle: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(15,23,42,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.6)',
  },
  logoImage: {
    width: 40,
    height: 40,
  },
  appName: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    letterSpacing: 1.2,
  },
  appTagline: {
    fontSize: FontSizes.sm,
    color: 'rgba(226,232,240,0.9)',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(15,118,110,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.6)',
    gap: 6,
  },
  badgeText: {
    fontSize: 11,
    color: 'rgba(226,232,240,0.9)',
    fontWeight: FontWeights.medium,
  },
  content: {
    marginTop: Spacing.xxl,
  },
  title: {
    fontSize: 32,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: 'rgba(226,232,240,0.9)',
    lineHeight: 22,
  },
  highlightsRow: {
    flexDirection: 'row',
    marginTop: Spacing.xxl,
    gap: Spacing.md,
  },
  highlightCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  highlightIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  highlightTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.white,
    marginBottom: 2,
  },
  highlightText: {
    fontSize: FontSizes.sm,
    color: 'rgba(148,163,184,0.95)',
    lineHeight: 18,
  },
  actions: {
    gap: Spacing.md,
  },
  primaryButton: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.9)',
  },
  primaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  primaryButtonText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  primaryButtonSub: {
    fontSize: FontSizes.sm,
    color: 'rgba(148,163,184,0.95)',
    marginTop: 2,
  },
  secondaryButton: {
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(241,245,249,0.98)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  secondaryButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  footerHint: {
    fontSize: 11,
    color: 'rgba(148,163,184,0.9)',
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});


