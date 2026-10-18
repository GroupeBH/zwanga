import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Platform, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/styles';
import { RideModal } from '@/features/navigation/RideModal';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { copyReferralLink, shareReferralLink } from '@/utils/shareReferralLink';
import { shareReferralQr, type ReferralQrSvg } from '@/utils/shareReferralQr';
import { REFERRAL_QR_ERROR, type ReferralQrState } from './referralQrModel';
import { styles } from './ReferralQr.styles';

export function ReferralQrModal({ state, onClose, onRetry }: {
  state: ReferralQrState; onClose: () => void; onRetry: () => void;
}) {
  const { width, height, fontScale = 1 } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const qrSize = Math.max(128, Math.min(width - 80, 280,
    height - insets.top - insets.bottom - 340 - Math.max(0, fontScale - 1) * 160));
  const svg = useRef<ReferralQrSvg | null>(null);
  const mounted = useRef(false);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [qrFailed, setQrFailed] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let disposed = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (disposed || reduced) return;
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    }).catch(() => {});
    return () => { disposed = true; fade.stopAnimation(); };
  }, [fade]);
  const onQrError = useCallback(() => {
    // The QR library reports generation errors during its render.
    queueMicrotask(() => { if (mounted.current) setQrFailed(true); });
  }, []);
  const ready = state.phase === 'ready';
  const failed = state.phase === 'error' || qrFailed;
  const run = async (action: 'share' | 'copy') => {
    if (!ready || locked.current) return;
    locked.current = true;
    setBusy(true); setFeedback('');
    const version = getTokenSessionVersion();
    const current = () => mounted.current && version === getTokenSessionVersion();
    try {
      if (action === 'copy') {
        await copyReferralLink(state.link);
        if (current()) setFeedback('Lien copié. Vous pouvez le coller dans votre message.');
      } else if (Platform.OS === 'web' || qrFailed) {
        await shareReferralLink(state.link);
      } else {
        if (!svg.current) throw new Error('QR not ready');
        await shareReferralQr(svg.current, state.link, current);
      }
    } catch {
      if (current()) setFeedback(action === 'copy'
        ? 'Copie indisponible. Réessayez ou partagez votre invitation.'
        : 'Partage indisponible. Vous pouvez faire scanner le QR code ou copier le lien.');
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  };

  return <RideModal inApp visible transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={styles.overlay} edges={['top', 'bottom', 'left', 'right']}>
      <Animated.View style={[styles.sheet, { opacity: fade }]} accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <View style={styles.header}>
          <Text style={styles.brand}>Zwanga</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer le QR code" onPress={onClose} style={styles.close}>
            <Ionicons name="close" size={24} color={Colors.gray[700]} />
          </TouchableOpacity>
        </View>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          <Text style={styles.title} accessibilityRole="header">Mon QR code</Text>
          <Text style={styles.subtitle}>Scannez pour ouvrir mon lien de parrainage.</Text>
          {ready && !qrFailed ? <>
            <View style={styles.qr} accessible accessibilityRole="image" accessibilityLabel="QR code de votre lien de parrainage Zwanga">
              <QRCode value={state.link} size={qrSize}
                quietZone={56} color="#000000" backgroundColor="#FFFFFF" ecl="M"
                getRef={ref => { svg.current = ref; }} onError={onQrError} />
            </View>
            {!!state.code && <Text style={styles.code}>Votre code : <Text style={styles.codeValue}>{state.code}</Text></Text>}
          </> : <View style={styles.placeholder}>
            {failed ? <Ionicons name="qr-code-outline" size={40} color={Colors.gray[400]} />
              : <ActivityIndicator size="large" color={Colors.primary} />}
            <Text style={[styles.subtitle, failed && styles.error]} accessibilityLiveRegion="polite">
              {qrFailed ? 'Le QR code ne peut pas être affiché. Vous pouvez partager ou copier votre lien.'
                : failed ? REFERRAL_QR_ERROR : 'Préparation de votre invitation…'}
            </Text>
          </View>}
          {!!feedback && <Text style={styles.feedback} accessibilityLiveRegion="polite">{feedback}</Text>}
        </ScrollView>
        <View style={styles.footer}>
          {ready ? <>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy}
              activeOpacity={0.8} onPress={() => void run('share')} style={[styles.primary, busy && styles.disabled]}>
              {busy ? <ActivityIndicator color={Colors.white} size="small" />
                : <Ionicons name="share-social-outline" size={19} color={Colors.white} />}
              <Text style={styles.primaryText}>{busy ? 'Préparation…' : Platform.OS === 'web' || qrFailed ? 'Partager le lien' : 'Partager le QR code'}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void run('copy')} style={styles.secondary}>
              <Text style={styles.secondaryText}>Copier le lien d’invitation</Text>
            </TouchableOpacity>
          </> : failed && <TouchableOpacity accessibilityRole="button" onPress={onRetry} style={styles.primary}>
            <Text style={styles.primaryText}>Réessayer</Text>
          </TouchableOpacity>}
        </View>
      </Animated.View>
    </SafeAreaView>
  </RideModal>;
}
