import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useNearbyLocationPermission } from '@/hooks/profile/useNearbyLocationPermission';
import { BackgroundLocationConsent } from '@/components/location/BackgroundLocationConsent';
import { Colors } from '@/constants/styles';
import { ACTION_COLORS } from '@/constants/actionColors';
import { isDriverAccount } from '@/utils/accountRole';
import { getNearbyDriverLocationHealth, subscribeNearbyDriverHealth } from '@/services/nearbyDriverLocationHealth';

/** Explicit choice first, followed by the real system permission. */
export function NearbyDriverLocationPermission({ available }: { available: boolean }) {
  const user = useAppSelector(selectUser);
  const userId = user?.id;
  const driver = isDriverAccount(user);
  const active = useScreenIsActive();
  const flow = useNearbyLocationPermission({ userId, driver, active, available });
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [showUsage, setShowUsage] = useState(false);
  useEffect(() => {
    setDeliveryMessage('');
    if (!active || !userId || !driver || !flow.enabled || !flow.permission) return;
    const refresh = () => {
      const health = getNearbyDriverLocationHealth(userId);
      if (health.lastSentAt === null) { setDeliveryMessage('En attente du premier envoi de votre position.'); return; }
      const minutes = Math.max(0, Math.floor((Date.now() - health.lastSentAt) / 60_000));
      const oldPosition = health.lastSentFixAt === null || Date.now() - health.lastSentFixAt > 6 * 60_000;
      setDeliveryMessage(oldPosition
        ? 'Votre position est ancienne. Vérifiez le GPS et votre connexion.'
        : minutes === 0 ? 'Position envoyée il y a moins d’une minute.'
          : `Dernier envoi : il y a ${minutes} min.`);
    };
    refresh();
    const unsubscribe = subscribeNearbyDriverHealth(refresh);
    const timer = setInterval(refresh, 30_000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [active, driver, userId, flow.enabled, flow.permission]);

  if (!driver) return null;
  const authorized = flow.loaded && flow.enabled && flow.permission;
  const disabled = flow.busy || !flow.loaded || (!authorized && (!available || !flow.consent));
  const settingsChoice = Platform.OS === 'ios' ? '« Toujours »' : '« Toujours autoriser »';
  return <View style={styles.section}>
    <Text style={styles.title}>Localisation en arrière-plan</Text>
    {authorized ? <>
      <View style={styles.authorized}>
        <View style={styles.dot} />
        <Text accessibilityLiveRegion="polite" style={styles.authorizedText}>Autorisé sur ce téléphone</Text>
      </View>
      {deliveryMessage ? <Text accessibilityLiveRegion="polite" style={styles.status}>{deliveryMessage}</Text> : null}
    </> : flow.loaded && !flow.loadError ? <>
      {!flow.enabled && <Text style={styles.status}>Vous avez désactivé le partage hors trajet.</Text>}
      <Text style={styles.copy}>Hors trajet, Zwanga collecte et envoie votre position au serveur environ toutes les 3 minutes pour trouver les commandes proches, même quand l’écran est éteint ou dans une autre application. Le téléphone peut retarder ces envois.</Text>
      <BackgroundLocationConsent checked={flow.consent} disabled={flow.busy || !available}
        onChange={flow.setConsent} />
      <Text style={styles.copy}>{flow.permission
        ? 'Validez pour reprendre le partage hors trajet.'
        : flow.settingsRequired
        ? `Dans les réglages de position de Zwanga, choisissez ${settingsChoice}, puis revenez ici.`
        : `Sur le téléphone, choisissez ${settingsChoice}. La case seule ne donne pas cette autorisation.`}</Text>
      {!available && <Text style={styles.status}>Le service est momentanément indisponible. Vous pourrez réessayer plus tard.</Text>}
    </> : <Text accessibilityLiveRegion="polite" style={styles.status}>{flow.loadError
      ? 'Impossible de vérifier les autorisations.' : 'Vérification des autorisations…'}</Text>}
    {flow.loadError ? <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={flow.retry}>
      <Text style={styles.buttonText}>Réessayer</Text>
    </TouchableOpacity> : <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled, busy: flow.busy }}
      disabled={disabled} onPress={() => { void (authorized ? flow.disable()
        : flow.settingsRequired ? flow.openSettings() : flow.authorize()); }}
      style={[styles.button, authorized && styles.secondary, disabled && styles.disabled]}>
      {flow.busy ? <View style={styles.progress}>
        <ActivityIndicator color={authorized ? Colors.gray[700] : Colors.white} />
        <Text style={[styles.buttonText, authorized && styles.secondaryText]}>Un instant…</Text>
      </View> : <Text style={[styles.buttonText, authorized && styles.secondaryText]}>{authorized
        ? 'Désactiver hors trajet' : flow.settingsRequired ? 'Ouvrir les réglages'
          : flow.permission ? 'Activer et continuer' : 'Autoriser et continuer'}</Text>}
    </TouchableOpacity>}
    {!authorized || flow.busy ? <TouchableOpacity accessibilityRole="button" style={styles.optOut}
      onPress={flow.defer}>
      <Text style={styles.optOutText}>Pas maintenant</Text>
    </TouchableOpacity> : null}
    {authorized ? <>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showUsage }}
        style={styles.optOut} onPress={() => setShowUsage(value => !value)}>
        <Text style={styles.usageText}>{showUsage ? 'Masquer les détails' : 'Utilisation de ma position'}</Text>
      </TouchableOpacity>
      {showUsage && <Text style={styles.copy}>Hors trajet, Zwanga collecte et envoie votre position au serveur environ toutes les 3 minutes pour trouver les commandes proches, même en veille. Le téléphone peut retarder ces envois. Désactiver ce partage ne coupe pas le suivi d’un trajet en cours.</Text>}
    </> : <Text style={styles.footnote}>Facultatif et modifiable à tout moment. L’application reste accessible sans cette autorisation.</Text>}
    {flow.message ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{flow.message}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 10 }, title: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: Colors.gray[900] },
  copy: { fontSize: 14, lineHeight: 21, color: Colors.gray[700] },
  status: { fontSize: 14, lineHeight: 20, color: Colors.gray[600] },
  authorized: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACTION_COLORS.green },
  authorizedText: { fontSize: 15, fontWeight: '600', color: Colors.gray[900] },
  button: { minHeight: 54, padding: 16, borderRadius: 16, justifyContent: 'center', backgroundColor: ACTION_COLORS.orange },
  secondary: { backgroundColor: Colors.gray[100] }, secondaryText: { color: Colors.gray[700] },
  disabled: { opacity: 0.45 },
  progress: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  optOut: { minHeight: 44, justifyContent: 'center' },
  optOutText: { textAlign: 'center', fontSize: 15, color: Colors.gray[700] },
  usageText: { fontSize: 14, fontWeight: '600', color: Colors.gray[700] },
  buttonText: { textAlign: 'center', fontSize: 16, fontWeight: '700', color: Colors.white },
  footnote: { fontSize: 13, lineHeight: 19, color: Colors.gray[600] },
});
