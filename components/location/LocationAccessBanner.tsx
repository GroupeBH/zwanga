import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { useLocationRecovery } from '@/hooks/location-picker/useLocationRecovery';
import { useNearbyLocationPermission } from '@/hooks/profile/useNearbyLocationPermission';
import { BackgroundLocationApproval } from './BackgroundLocationApproval';
import { locationAccessMessage } from '@/features/location-picker/locationAccessMessage';

type Props = { active: boolean; background?: 'ride' | 'discovery' };

/** Read-only until tapped. No recurring modal, no automatic system prompt. */
export function LocationAccessBanner(props: Props) {
  const userId = useAppSelector(selectUser)?.id;
  return userId ? <LocationAccessContent key={`${userId}:${getTokenSessionVersion()}:${props.background ?? 'foreground'}`}
    {...props} userId={userId} /> : null;
}

function LocationAccessContent({ active, background, userId }: Props & { userId: string }) {
  const native = Platform.OS === 'android' || Platform.OS === 'ios';
  const enabled = active && native;
  const [open, setOpen] = useState(false);
  const flow = useNearbyLocationPermission({ userId, driver: background === 'discovery',
    purpose: background === 'ride' ? 'passenger-trip' : 'nearby-driver',
    active: enabled && Boolean(background), available: true, deferTrackingToCoordinator: true });
  const recovery = useLocationRecovery(() => flow.retry(), enabled, true);
  const authorized = flow.loaded && flow.permission && flow.enabled && !flow.loadError && !flow.busy;
  useEffect(() => { if (authorized) setOpen(false); }, [authorized]);
  const foregroundMissing = Boolean(recovery.issue || recovery.error);
  const backgroundMissing = Boolean(background && ((flow.loaded && !authorized) || flow.loadError));
  if (!enabled || (!foregroundMissing && !backgroundMissing && !open)) return null;
  const busy = recovery.busy || flow.busy;
  const title = foregroundMissing
    ? recovery.error ? 'Vérifier la localisation' : 'Activer la localisation'
    : flow.loadError ? 'Vérifier le suivi en veille' : 'Activer le suivi en veille';
  const description = foregroundMissing ? recovery.issue ? locationAccessMessage(recovery.issue) : recovery.error
    : background === 'ride' ? 'Pour suivre le trajet et détecter les arrivées, même écran éteint.'
      : 'Pour recevoir les commandes proches, même écran éteint.';
  return <>
    <TouchableOpacity testID="location-access-banner" accessibilityRole="button" accessibilityLabel={title}
      accessibilityHint={description} accessibilityState={{ disabled: busy, busy }} disabled={busy}
      style={styles.banner} onPress={() => {
        if (foregroundMissing) void recovery.recover(); else setOpen(true);
      }}>
      {busy ? <ActivityIndicator color="#C34412" /> : <Ionicons name="location-outline" size={22} color="#C34412" />}
      <View style={styles.copy}><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text></View>
      <Ionicons name="chevron-forward" size={18} color="#C34412" />
    </TouchableOpacity>
    <BackgroundLocationApproval visible={open && !foregroundMissing} audience={background === 'ride' ? 'ride' : 'driver'}
      busy={flow.busy} loaded={flow.loaded} loadError={flow.loadError} permission={flow.permission}
      foregroundPermission={flow.foregroundPermission} settingsRequired={flow.settingsRequired} message={flow.message}
      onClose={() => { flow.defer(); setOpen(false); }} onConfirm={() => {
        if (flow.busy || !enabled) return;
        if (flow.loadError) { flow.retry(); return; }
        flow.setConsent(true);
        void (flow.settingsRequired ? flow.openSettings() : flow.authorize());
      }} />
  </>;
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginTop: 6,
    borderRadius: 14, backgroundColor: '#FFF3E9', minHeight: 48 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: '#9A3412', fontSize: 14, fontWeight: '700' },
  description: { color: '#4B5563', fontSize: 12 },
});
