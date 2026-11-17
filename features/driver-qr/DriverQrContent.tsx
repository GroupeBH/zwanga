import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, RefreshControl, ScrollView, Share, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/styles';
import { API_BASE_URL } from '@/config/env';
import { useGetPublicDriverCardQuery } from '@/store/api/publicDriverApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { shareDriverQr } from '@/utils/shareDriverQr';
import type { ReferralQrSvg } from '@/utils/shareReferralQr';
import { DRIVER_CREDIT_LABELS, driverQrLink } from './driverQrModel';
import { styles } from './DriverQr.styles';

export function DriverQrContent({ driverId }: { driverId: string }) {
  const { width } = useWindowDimensions();
  const query = useGetPublicDriverCardQuery(driverId, { refetchOnMountOrArgChange: true, refetchOnReconnect: true });
  const card = query.currentData;
  const link = driverQrLink(API_BASE_URL, driverId, __DEV__);
  const shareable = driverQrLink(API_BASE_URL, driverId);
  const ready = Boolean(card?.id === driverId && link && !query.isError && !query.isFetching);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [qrFailed, setQrFailed] = useState(false);
  const svg = useRef<ReferralQrSvg | null>(null);
  const mounted = useRef(false);
  const locked = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const onQrError = useCallback(() => {
    // qrcode-svg may call this during render; never update parent state synchronously.
    queueMicrotask(() => { if (mounted.current) setQrFailed(true); });
  }, []);
  const run = async (action: 'share' | 'copy' | 'preview') => {
    if (!ready || !link || locked.current || (action !== 'preview' && !shareable)) return;
    locked.current = true; setBusy(true); setFeedback('');
    const version = getTokenSessionVersion();
    const current = () => mounted.current && version === getTokenSessionVersion();
    try {
      if (action === 'preview') await Linking.openURL(link);
      else if (action === 'copy') {
        const Clipboard = await import('expo-clipboard');
        if (!current()) return;
        await Clipboard.setStringAsync(link);
        if (current()) setFeedback('Lien copié.');
      } else if (Platform.OS === 'web' || qrFailed || !svg.current) {
        await Share.share({ title: 'Mon profil conducteur Zwanga', message: `Ma fiche conducteur Zwanga : ${link}` });
      } else await shareDriverQr(svg.current, link, current);
    } catch {
      if (current()) setFeedback(action === 'preview' ? 'Impossible d’ouvrir la fiche. Réessayez.' : 'Partage indisponible. Réessayez ou copiez le lien.');
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  };
  const retry = () => { setQrFailed(false); void query.refetch(); };
  return <ScrollView contentContainerStyle={styles.content} refreshControl={
    <RefreshControl refreshing={query.isFetching && !query.isLoading} onRefresh={retry} />
  }>
    {!ready ? <>
      {query.isFetching ? <ActivityIndicator color={Colors.primary} accessibilityLabel="Chargement de votre QR" /> : null}
      <Text style={styles.hint}>{query.isFetching ? 'Chargement de votre fiche…' : 'Votre fiche conducteur est indisponible pour le moment.'}</Text>
      {!query.isFetching && <TouchableOpacity style={styles.secondary} accessibilityRole="button" onPress={retry}><Text style={styles.link}>Réessayer</Text></TouchableOpacity>}
    </> : <>
      <Text style={styles.name}>{card!.firstName} {card!.lastName}</Text>
      <Text style={styles.hint}>Scannez pour voir mon profil conducteur.</Text>
      {qrFailed ? <Text style={styles.hint}>QR indisponible. Vous pouvez partager le lien.</Text> :
        <View style={styles.qr} accessible accessibilityRole="image" accessibilityLabel="Mon QR conducteur Zwanga">
          <QRCode value={link!} size={Math.max(120, Math.min(232, width - 112))} quietZone={32}
            color="#000000" backgroundColor="#FFFFFF" ecl="M" getRef={(ref: ReferralQrSvg) => { svg.current = ref; }} onError={onQrError} />
        </View>}
      <Text style={styles.hint}>Visible par toute personne qui scanne : profil, véhicules et biens à crédit. Aucun montant ni retard affiché.</Text>
      {!shareable && <Text style={styles.hint}>Lien local de test : il ne sera pas accessible depuis les autres téléphones.</Text>}
      <TouchableOpacity style={[styles.action, (busy || !shareable) && styles.disabled]} disabled={busy || !shareable}
        accessibilityRole="button" onPress={() => void run('share')}>
        <Text style={styles.actionText}>{busy ? 'Patientez…' : Platform.OS === 'web' || qrFailed ? 'Partager le lien' : 'Partager mon QR'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} accessibilityRole="button" disabled={busy || !shareable} onPress={() => void run('copy')}>
        <Text style={styles.link}>Copier le lien</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} accessibilityRole="button" disabled={busy} onPress={() => void run('preview')}>
        <Text style={styles.link}>Voir ma fiche publique</Text>
      </TouchableOpacity>
      <View style={styles.detail}>
        <Text style={styles.sectionTitle}>Biens à crédit visibles</Text>
        {card!.credits.length === 0 ? <Text style={styles.label}>Aucun bien activé ou soldé.</Text> : card!.credits.map(credit =>
          <View key={`${credit.assetKind}:${credit.status}`} style={styles.row}>
            <Text style={styles.label}>{DRIVER_CREDIT_LABELS[credit.assetKind]}</Text>
            <Text style={[styles.status, credit.status === 'settled' && styles.settled]}>{credit.status === 'settled' ? 'Soldé' : 'En cours'}</Text>
          </View>)}
      </View>
    </>}
    {!!feedback && <Text style={styles.hint} accessibilityLiveRegion="polite">{feedback}</Text>}
  </ScrollView>;
}
