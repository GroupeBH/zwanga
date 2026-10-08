import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { ensureNearbyDriverLocation, isNearbyDriverLocationEnabled,
  setNearbyDriverLocationEnabled } from '@/services/nearbyDriverLocation';
import { Colors } from '@/constants/styles';
import { isDriverAccount } from '@/utils/accountRole';

/** Disclosure precedes the OS permission prompt; no extra availability/vehicle workflow. */
export function NearbyDriverLocationPermission({ available }: { available: boolean }) {
  const user = useAppSelector(selectUser);
  const userId = user?.id;
  const driver = isDriverAccount(user);
  const active = useScreenIsActive();
  const [enabled, setEnabled] = useState(true);
  const [permission, setPermission] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const identity = useRef(userId);
  identity.current = userId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setBusy(false); setEnabled(true); setPermission(false); setLoaded(false); setMessage(''); }, [userId]);
  useEffect(() => {
    let cancelled = false;
    if (active && userId) {
      setLoaded(false); setLoadError(false); setMessage('');
      void Promise.all([isNearbyDriverLocationEnabled(userId), Location.getBackgroundPermissionsAsync()])
        .then(([setting, result]) => {
          if (!cancelled) { setEnabled(setting); setPermission(result.granted); setLoaded(true); }
        }).catch(() => { if (!cancelled) setLoadError(true); });
    }
    return () => { cancelled = true; };
  }, [active, userId, attempt]);

  const toggle = async (disableOnly = false) => {
    const canDisable = enabled && (permission || disableOnly);
    if (!userId || !driver || !active || !loaded || inFlight.current || (!canDisable && !available)) return;
    inFlight.current = true; setBusy(true); setMessage('');
    const version = getTokenSessionVersion();
    const current = () => mounted.current && identity.current === userId && version === getTokenSessionVersion();
    try {
      if (canDisable) {
        await setNearbyDriverLocationEnabled(userId, false, version);
        if (current()) setEnabled(false);
        return;
      }
      let foreground = await Location.getForegroundPermissionsAsync();
      if (!current()) return;
      if (!foreground.granted) foreground = await Location.requestForegroundPermissionsAsync();
      if (!current()) return;
      if (!foreground.granted) { setMessage('Autorisez la localisation dans les réglages du téléphone.'); return; }
      let background = await Location.getBackgroundPermissionsAsync();
      if (!current()) return;
      if (!background.granted) background = await Location.requestBackgroundPermissionsAsync();
      if (!current()) return;
      if (!background.granted) {
        setMessage('Choisissez « Toujours autoriser » dans les réglages. Les demandes restent accessibles dans l’app.');
        return;
      }
      await setNearbyDriverLocationEnabled(userId, true, version);
      if (!current()) return;
      const saved = await isNearbyDriverLocationEnabled(userId);
      if (!current()) return;
      setEnabled(saved); setPermission(true);
      if (AppState.currentState === 'active') await ensureNearbyDriverLocation(userId);
    } catch {
      if (current()) setMessage('Localisation indisponible. Vérifiez les autorisations et réessayez.');
    } finally {
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  };

  if (!driver) return null;
  const canDisable = enabled && permission;
  const disabled = busy || !loaded || (!available && !canDisable);
  return <View style={styles.section}>
    <Text style={styles.title}>Recevoir aussi en veille</Text>
    <Text style={styles.copy}>Activé par défaut avec votre autorisation : Zwanga utilise votre position même en arrière-plan pour recevoir les demandes proches.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.status}>{loadError ? 'Impossible de vérifier les autorisations.' : !loaded ? 'Vérification des autorisations…' : !enabled
      ? 'Désactivé dans Zwanga. Votre choix reste mémorisé.' : permission
        ? 'Suivi automatique autorisé, sans activation supplémentaire.'
        : 'Autorisation du téléphone nécessaire. Seule votre position récente dans l’app est utilisée.'}</Text>
    {loadError ? <TouchableOpacity accessibilityRole="button" style={styles.button}
      onPress={() => { setLoadError(false); setAttempt(value => value + 1); }}>
      <Text style={styles.buttonText}>Réessayer</Text>
    </TouchableOpacity> : <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled, busy }}
      disabled={disabled} onPress={() => { void toggle(); }}
      style={[styles.button, canDisable && styles.secondary]}>
      {busy ? <ActivityIndicator color={canDisable ? Colors.primary : Colors.white} />
        : <Text style={[styles.buttonText, canDisable && styles.secondaryText]}>{canDisable
          ? 'Désactiver la localisation en veille' : permission ? 'Réactiver le suivi en veille' : 'Autoriser la localisation en veille'}</Text>}
    </TouchableOpacity>}
    {loaded && enabled && !permission ? <TouchableOpacity accessibilityRole="button"
      disabled={busy} accessibilityState={{ disabled: busy }} style={styles.optOut}
      onPress={() => { void toggle(true); }}>
      <Text style={styles.optOutText}>Désactiver le suivi automatique</Text>
    </TouchableOpacity> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{message}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 12 }, title: { fontSize: 17, fontWeight: '600', color: Colors.gray[900] },
  copy: { fontSize: 14, lineHeight: 20, color: Colors.gray[700] },
  status: { fontSize: 13, lineHeight: 19, color: Colors.gray[600] },
  button: { padding: 16, borderRadius: 14, backgroundColor: Colors.primary },
  secondary: { backgroundColor: Colors.gray[100] }, secondaryText: { color: Colors.primary },
  optOut: { minHeight: 44, justifyContent: 'center' },
  optOutText: { textAlign: 'center', fontSize: 14, color: Colors.gray[700] },
  buttonText: { textAlign: 'center', fontSize: 14, fontWeight: '700', color: Colors.white },
});
