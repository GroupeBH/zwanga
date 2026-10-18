import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthWelcomeHero } from './AuthWelcomeHero';
import { welcomeStyles as styles, WELCOME_COLORS as c } from './authWelcomeStyles';

const BENEFITS = [
  { icon: 'search-outline', label: 'Trajets près de vous' },
  { icon: 'shield-checkmark-outline', label: 'Profils vérifiés' },
  { icon: 'card-outline', label: 'Électronique, jetons ou cash' },
  { icon: 'chatbubble-outline', label: 'Messagerie intégrée' },
] as const;

/** One introduction, with direct account actions and no compulsory slide carousel. */
export function AuthWelcome() {
  const router = useRouter();
  const focused = useIsFocused();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height < 700;
  const stackBenefits = width < 350 || fontScale > 1.2;
  const heroHeight = Math.max(210, Math.min(318, height - insets.top - insets.bottom - 520));
  const [showLocationDetail, setShowLocationDetail] = useState(false);
  const [pending, setPending] = useState<'login' | 'signup' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (focused) { locked.current = false; setPending(null); setError(null); }
  }, [focused]);
  const enter = (mode: 'login' | 'signup') => {
    if (!focused || locked.current) return;
    locked.current = true;
    setPending(mode);
    try {
      router.push({ pathname: '/auth', params: { mode } });
    } catch {
      locked.current = false;
      setPending(null);
      setError('Impossible d’ouvrir cet écran. Veuillez réessayer.');
    }
  };
  const openLegal = async () => {
    try { await Linking.openURL('https://zwanga-admin.onrender.com/'); }
    catch { if (mounted.current) setError('Impossible d’ouvrir les informations légales. Vérifiez votre connexion.'); }
  };

  return <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
      bounces={false} showsVerticalScrollIndicator={false}>
      <AuthWelcomeHero width={Math.max(1, width - insets.left - insets.right)} height={heroHeight} topInset={insets.top} />
      <View style={[styles.body, compact && styles.compactBody]}>
        <Text style={styles.title} accessibilityRole="header">Trouvez ou proposez un trajet.</Text>
        <Text style={styles.subtitle}>Partagez la route avec des gens qui vont dans la même direction.</Text>
        <View style={styles.benefits} testID="auth-welcome-benefits">
          {BENEFITS.map(benefit => <View key={benefit.icon} style={[styles.benefit, stackBenefits && styles.stackedBenefit]}>
            <View style={styles.benefitIcon} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Ionicons name={benefit.icon} size={18} color={c.orange} />
            </View><Text style={styles.benefitText}>{benefit.label}</Text>
          </View>)}
        </View>
        <TouchableOpacity style={styles.location} onPress={() => setShowLocationDetail(value => !value)}
          accessibilityRole="button" accessibilityLabel="En savoir plus sur la localisation"
          accessibilityState={{ expanded: showLocationDetail }} testID="auth-welcome-location">
          <Ionicons name="lock-closed-outline" size={14} color={c.muted} />
          <Text style={styles.locationText}>Vous gardez le contrôle de votre localisation.</Text>
          <Ionicons name={showLocationDetail ? 'chevron-up' : 'chevron-down'} size={14} color={c.muted} />
        </TouchableOpacity>
        {showLocationDetail && <Text style={styles.locationDetail} accessibilityLiveRegion="polite">
          Avec votre autorisation, Zwanga utilise votre position pendant un trajet, même en arrière-plan. Pour les conducteurs disponibles, elle sert aussi à recevoir les commandes proches, même en veille. Vous pouvez accepter ou refuser l’autorisation et désactiver le suivi en veille dans votre profil.
        </Text>}
        <View style={styles.actions}>
          {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
          <TouchableOpacity style={[styles.primary, pending !== null && styles.disabled]} activeOpacity={0.8}
            onPress={() => enter('signup')} disabled={pending !== null} accessibilityRole="button"
            accessibilityLabel="Créer un compte" testID="auth-welcome-signup"
            accessibilityState={{ disabled: pending !== null, busy: pending === 'signup' }}>
            {pending === 'signup' ? <ActivityIndicator color={c.white} /> : <>
              <Text style={styles.primaryText}>Créer un compte</Text><Ionicons name="arrow-forward" size={20} color={c.white} />
            </>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondary, pending !== null && styles.disabled]} activeOpacity={0.8}
            onPress={() => enter('login')} disabled={pending !== null} accessibilityRole="button"
            accessibilityLabel="Déjà inscrit ? Se connecter" testID="auth-welcome-login"
            accessibilityState={{ disabled: pending !== null, busy: pending === 'login' }}>
            {pending === 'login' ? <ActivityIndicator color={c.orange} /> : <Text style={styles.secondaryText}>Déjà inscrit ? <Text style={styles.emphasis}>Se connecter</Text></Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void openLegal()} accessibilityRole="link" style={styles.legalLink}
            accessibilityLabel="Lire les conditions d’utilisation et la politique de confidentialité">
            <Text style={styles.legal}>En continuant, vous acceptez nos <Text style={styles.legalEmphasis}>conditions d’utilisation</Text> et notre <Text style={styles.legalEmphasis}>politique de confidentialité</Text>.</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
