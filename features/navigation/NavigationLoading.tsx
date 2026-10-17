import { HomeRideLoaderVisual } from '@/components/home/HomeRideLoaderVisual';
import { HOME_DASHBOARD_COLORS as c } from '@/features/home/homeDashboardTheme';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = { label?: string; onExit?: () => void; compact?: boolean };

/** No real map or extra data read. The existing native animation respects reduced motion. */
export function NavigationLoading({ label = 'Ouverture de votre trajet', onExit, compact = false }: Props) {
  const active = useScreenIsActive();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [active]);
  const Container = compact ? View : SafeAreaView;
  return <Container style={s.screen} testID="navigation-loading">
    <ScrollView bounces={false} contentContainerStyle={[s.content, compact && s.compactContent]}>
      {!compact && <Text style={s.brand}>ZWANGA</Text>}
      <View style={[s.artwork, compact && s.smallArtwork]} pointerEvents="none">
        <View style={[s.visual, compact ? s.smallVisual : s.fullVisual]}>
          <HomeRideLoaderVisual running={active} />
        </View>
      </View>
      <View accessible accessibilityRole="progressbar" accessibilityState={{ busy: true }}
        accessibilityLabel={label} accessibilityLiveRegion="polite" style={s.status}>
        <Text style={[s.title, compact && s.smallTitle]}>{label}</Text>
        {!compact && <Text style={s.hint}>{slow
          ? 'Cela prend plus de temps. Vérifiez votre connexion.'
          : 'La carte et les détails arrivent…'}</Text>}
      </View>
      {onExit && <TouchableOpacity onPress={() => { if (active) onExit(); }} activeOpacity={0.8}
        disabled={!active} accessibilityRole="button" accessibilityState={{ disabled: !active }} style={s.exit}>
        <Text style={s.exitText}>Retour</Text>
      </TouchableOpacity>}
    </ScrollView>
  </Container>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.warm },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 32 },
  compactContent: { paddingHorizontal: 12, paddingVertical: 12 },
  brand: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 3, color: c.orange, marginBottom: 22 },
  artwork: { width: 264, height: 222, overflow: 'hidden' },
  smallArtwork: { width: 160, height: 134 },
  visual: { position: 'absolute', width: 296, height: 248 },
  fullVisual: { left: -16, top: -13, transform: [{ scale: 264 / 296 }] },
  smallVisual: { left: -68, top: -57, transform: [{ scale: 160 / 296 }] },
  status: { maxWidth: 360, gap: 10, marginTop: 20 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', textAlign: 'center', color: c.ink },
  smallTitle: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  hint: { fontSize: 14, lineHeight: 21, textAlign: 'center', color: c.muted },
  exit: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 26, marginTop: 24, justifyContent: 'center' },
  exitText: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: c.muted },
});
