import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** One introduction, with direct account actions and no compulsory slide carousel. */
export function AuthWelcome() {
  const router = useRouter();
  const focused = useIsFocused();
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 700 || fontScale > 1.2;
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

  return <SafeAreaView style={styles.screen}>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, compact && styles.compactContent]}
      bounces={false} showsVerticalScrollIndicator={false}>
      <View style={styles.brand}>
        <Image source={require('@/assets/images/zwanga-transparent.png')} style={styles.logo} resizeMode="contain" accessible={false} />
        <View>
          <Text style={styles.brandName}>ZWANGA</Text>
          <Text style={styles.tagline}>Covoiturage à Kinshasa</Text>
        </View>
      </View>
      <View style={styles.introduction}>
        <Text style={[styles.title, compact && styles.compactTitle]} accessibilityRole="header">Trouvez ou proposez un trajet.</Text>
        <Text style={styles.subtitle}>Réservez une place ou partagez votre trajet avec d’autres voyageurs.</Text>
      </View>
      {!compact && <View style={styles.benefits}>
        <View style={styles.benefit}><Ionicons name="search-outline" size={21} color={Colors.primaryDark} />
          <Text style={styles.benefitText}>Des trajets à découvrir près de vous</Text></View>
        <View style={styles.benefit}><Ionicons name="chatbubbles-outline" size={21} color={Colors.primaryDark} />
          <Text style={styles.benefitText}>Une messagerie pour vous organiser</Text></View>
      </View>}
      <View style={styles.location}>
        <Text style={styles.locationTitle}>Vous gardez le contrôle de votre position</Text>
        <Text style={styles.locationText}>Pendant un trajet actif, Zwanga peut utiliser votre position, même en arrière-plan, pour le suivi entre conducteur et passagers. Vous pourrez accepter ou refuser l’autorisation.</Text>
      </View>
    </ScrollView>
    <View style={styles.actions}>
      {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      <TouchableOpacity style={[styles.primary, pending !== null && styles.disabled]} activeOpacity={0.8}
        onPress={() => enter('signup')} disabled={pending !== null} accessibilityRole="button"
        accessibilityState={{ disabled: pending !== null, busy: pending === 'signup' }}>
        {pending === 'signup' ? <ActivityIndicator color={Colors.white} /> : <>
          <Text style={styles.primaryText}>Créer un compte</Text><Ionicons name="arrow-forward" size={20} color={Colors.white} />
        </>}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.secondary, pending !== null && styles.disabled]} activeOpacity={0.8}
        onPress={() => enter('login')} disabled={pending !== null} accessibilityRole="button"
        accessibilityState={{ disabled: pending !== null, busy: pending === 'login' }}>
        {pending === 'login' ? <ActivityIndicator color={Colors.primaryDark} /> : <Text style={styles.secondaryText}>J’ai déjà un compte · Se connecter</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void openLegal()} accessibilityRole="link" style={styles.legalLink}
        accessibilityLabel="Lire les conditions d’utilisation et la politique de confidentialité">
        <Text style={styles.legal}>En continuant, vous acceptez nos conditions d’utilisation et notre politique de confidentialité.</Text>
      </TouchableOpacity>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.white },
  scroll: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24, gap: 28 },
  compactContent: { paddingHorizontal: 20, paddingVertical: 16, gap: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48 },
  brandName: { fontSize: 26, fontWeight: '800', color: Colors.primaryDark },
  tagline: { fontSize: 13, lineHeight: 18, color: Colors.gray[600] },
  introduction: { gap: 10 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '800', color: Colors.gray[900], maxWidth: 360 },
  compactTitle: { fontSize: 26, lineHeight: 31 },
  subtitle: { fontSize: 15, lineHeight: 22, color: Colors.gray[700], maxWidth: 400 },
  benefits: { gap: 14 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.gray[800] },
  location: { borderTopWidth: 1, borderTopColor: Colors.gray[200], paddingTop: 16, gap: 6 },
  locationTitle: { fontSize: 13, fontWeight: '700', lineHeight: 19, color: Colors.gray[800] },
  locationText: { fontSize: 12, lineHeight: 18, color: Colors.gray[700] },
  actions: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 10, backgroundColor: Colors.white },
  primary: { minHeight: 52, padding: 14, borderRadius: 16, backgroundColor: Colors.primaryDark, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  primaryText: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: Colors.white, flexShrink: 1 },
  secondary: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.gray[50] },
  secondaryText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: Colors.gray[900], textAlign: 'center' },
  legalLink: { minHeight: 44, justifyContent: 'center' },
  legal: { fontSize: 11, lineHeight: 16, textAlign: 'center', color: Colors.gray[600] },
  disabled: { opacity: 0.65 },
  error: { fontSize: 13, lineHeight: 18, color: Colors.dangerDark },
});
