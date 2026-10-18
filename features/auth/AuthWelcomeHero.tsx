import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { WELCOME_COLORS as c } from './authWelcomeStyles';

/** Static illustration, not a live offer. No map SDK, GPS, timer or API read. */
export function AuthWelcomeHero({ width, height, topInset }: { width: number; height: number; topInset: number }) {
  const scale = Math.min(width / 390, height / 318, 1.15);
  return <View style={[s.hero, { height: height + topInset }]} accessible accessibilityRole="image"
    accessibilityLabel="Zwanga, covoiturage à Kinshasa. Illustration d’un trajet partagé."
    testID="auth-welcome-hero">
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 390 318" preserveAspectRatio="xMidYMid slice">
        <Path d="M88 -12Q116 149 72 330M301 -12Q278 153 330 330M-10 120Q148 84 402 152M-10 259Q194 223 402 281"
          fill="none" stroke="#FFFFFF" strokeWidth={8} />
      </Svg>
      <View style={[s.scene, { left: (width - 390) / 2, top: topInset + (height - 318) / 2, transform: [{ scale }] }]}>
        <View style={s.brand}>
          <View style={s.logoFrame}><Image source={require('@/assets/images/zwanga-transparent.png')} style={s.logo} resizeMode="contain" accessible={false} /></View>
          <View><Text style={s.brandName} allowFontScaling={false}>ZWANGA</Text>
            <Text style={s.tagline} allowFontScaling={false}>Covoiturage à Kinshasa</Text></View>
        </View>
        <Svg style={s.trail} width={68} height={73} viewBox="0 0 68 73">
          <Path d="M48 6L13 65" fill="none" stroke="#F35A25" strokeWidth={5} strokeDasharray="3 8" strokeLinecap="round" />
        </Svg>
        <View style={s.trip}>
          <View style={s.tripHeader}><Text style={s.meta} allowFontScaling={false}>Sam. · 22:30</Text>
            <View style={s.price}><Text style={s.priceText} allowFontScaling={false}>2 000 FC</Text></View></View>
          <View style={s.route}>
            <View style={s.routeStops}><View style={s.start} /><View style={s.connector} /><View style={s.end} /></View>
            <View style={s.routeNames}><Text style={s.place} allowFontScaling={false}>Kasa-Vubu</Text>
              <Text style={s.place} allowFontScaling={false}>Mont-Ngafula</Text></View>
          </View>
          <View style={s.tripFooter}><View style={s.verified}>
            <Ionicons name="shield-checkmark-outline" size={14} color={c.green} />
            <Text style={s.verifiedText} allowFontScaling={false}>Conducteur vérifié</Text></View>
            <Text style={s.meta} allowFontScaling={false}>3 places</Text></View>
        </View>
        <View style={s.message}><Text style={s.messageText} allowFontScaling={false}>Je suis devant l’arrêt de bus.</Text></View>
      </View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  hero: { width: '100%', backgroundColor: c.peach, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  scene: { position: 'absolute', width: 390, height: 318 },
  brand: { position: 'absolute', top: 24, left: 24, flexDirection: 'row', gap: 8, alignItems: 'center' },
  logoFrame: { width: 32, height: 42, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 64, height: 64 },
  brandName: { fontSize: 22, lineHeight: 25, fontWeight: '800', color: '#E44F18' },
  tagline: { fontSize: 12, lineHeight: 16, color: c.muted },
  trail: { position: 'absolute', top: 239, left: 106 },
  trip: { position: 'absolute', top: 96, left: 36, width: 300, padding: 16, paddingBottom: 12, backgroundColor: c.white, borderRadius: 24,
    shadowColor: '#9B4526', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 3 },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { fontSize: 13, lineHeight: 18, color: c.muted },
  price: { borderRadius: 16, backgroundColor: c.peach, paddingHorizontal: 10, paddingVertical: 4 },
  priceText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: c.orangeText },
  route: { flexDirection: 'row', gap: 12, marginTop: 10 },
  routeStops: { width: 8, alignItems: 'center', paddingVertical: 7 },
  start: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' },
  connector: { width: 2, flex: 1, backgroundColor: '#DCE1E8' },
  end: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF6B35' },
  routeNames: { gap: 9 },
  place: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: c.ink },
  tripFooter: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.surface, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verifiedText: { fontSize: 12, lineHeight: 18, color: c.green, fontWeight: '600' },
  message: { position: 'absolute', top: 252, right: 22, borderRadius: 18, borderBottomRightRadius: 4, backgroundColor: c.ink, paddingHorizontal: 14, paddingVertical: 11,
    shadowColor: c.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 5 },
  messageText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: c.white },
});
