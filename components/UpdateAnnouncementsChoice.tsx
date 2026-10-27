import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { announcementPreference, loadAnnouncementPreference, setAnnouncementPreference, subscribeAnnouncementPreference } from '@/services/installationAnnouncements';
import { ensureAndroidChannel, requestPushPermissions } from '@/services/pushNotifications';
import { createPushRegistrationAttempt } from '@/services/pushRegistrationAttempt';

export function UpdateAnnouncementsChoice() {
  const preference = useSyncExternalStore(subscribeAnnouncementPreference, announcementPreference, announcementPreference);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const mounted = useRef(true), locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void loadAnnouncementPreference().catch(() => { if (mounted.current) setError('Impossible de lire votre choix. Réessayez.'); });
    return () => { mounted.current = false; };
  }, []);
  const change = async (enabled: boolean) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setSettings(false);
    const attempt = createPushRegistrationAttempt();
    try {
      if (enabled) await attempt.wait(() => ensureAndroidChannel());
      if (enabled && !await attempt.wait(requestPushPermissions)) {
        if (mounted.current) { setError('Autorisez les notifications du téléphone pour recevoir les annonces.'); setSettings(true); }
        return;
      }
      await attempt.wait(() => setAnnouncementPreference(enabled));
    } catch { if (mounted.current) setError('Votre choix n’a pas pu être enregistré. Réessayez.'); }
    finally { attempt.finish(); locked.current = false; if (mounted.current) setBusy(false); }
  };
  return <View style={styles.container}>
    <View style={styles.row}><View style={styles.label}>
      <Text style={styles.title}>Me prévenir des mises à jour</Text>
      <Text style={styles.hint}>Même sans compte. Vous pouvez changer ce choix ici à tout moment.</Text>
    </View><Switch value={preference.enabled} disabled={busy} onValueChange={value => void change(value)}
      accessibilityLabel="Recevoir les annonces de mise à jour de Zwanga" accessibilityState={{ busy }}
      trackColor={{ false: '#D4D8DD', true: '#D9480F' }} /></View>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {settings && <Text accessibilityRole="link" style={styles.link} onPress={() => { void Linking.openSettings().catch(() => { if (mounted.current) setError('Ouvrez les réglages de notification de Zwanga sur votre téléphone.'); }); }}>Ouvrir les autorisations</Text>}
    {preference.chosen && <Text style={styles.hint}>Ce choix se synchronise dès que la connexion est disponible.</Text>}
  </View>;
}
const styles = StyleSheet.create({
  container: { paddingVertical: 16, gap: 6 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, label: { flex: 1 },
  title: { color: '#1E293B', fontSize: 14, fontWeight: '600' }, hint: { color: '#64748B', fontSize: 12, lineHeight: 17 },
  error: { color: '#B42318', fontSize: 13 }, link: { color: '#B83E0E', paddingVertical: 10, minHeight: 44 },
});
