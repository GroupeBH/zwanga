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
      colors={[Colors.white, '#FFF8F3', '#F3F6F9']}
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
            <Ionicons name="shield-checkmark" size={18} color={Colors.primaryDark} />
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
              <View style={[styles.highlightIcon, { backgroundColor: Colors.primary + '14' }]}>
                <Ionicons name="car-sport" size={22} color={Colors.primary} />
              </View>
              <Text style={styles.highlightTitle}>Rapide</Text>
              <Text style={styles.highlightText}>Trouvez ou publiez un trajet en quelques secondes.</Text>
            </View>

            <View style={styles.highlightCard}>
              <View style={[styles.highlightIcon, { backgroundColor: Colors.success + '14' }]}>
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
              <Ionicons name="log-in-outline" size={22} color={Colors.primaryDark} />
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
    backgroundColor: '#FFF7F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E9C8BD',
  },
  logoImage: {
    width: 40,
    height: 40,
  },
  appName: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.primaryDark,
    letterSpacing: 0,
  },
  appTagline: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#E9C8BD',
    gap: 6,
  },
  badgeText: {
    fontSize: 11,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  content: {
    marginTop: Spacing.xxl,
  },
  title: {
    fontSize: 32,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
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
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#E9C8BD',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
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
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    marginBottom: 2,
  },
  highlightText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 18,
  },
  actions: {
    gap: Spacing.md,
  },
  primaryButton: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.primaryDark,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
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
    color: 'rgba(255,255,255,0.78)',
    marginTop: 2,
  },
  secondaryButton: {
    height: 52,
    borderRadius: 18,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#E9C8BD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  secondaryButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.primaryDark,
  },
  footerHint: {
    fontSize: 11,
    color: Colors.gray[600],
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});


