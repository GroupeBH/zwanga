import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { BackgroundLocationApproval } from '@/components/location/BackgroundLocationApproval';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { ACTION_COLORS } from '@/constants/actionColors';
import { useNearbyLocationPermission } from '@/hooks/profile/useNearbyLocationPermission';
import { useLocationPermissionPulse } from '@/hooks/home/useLocationPermissionPulse';

/** Mounted only for the current, server-confirmed driver on Home. */
export function HomeBackgroundLocationButton({ userId, active }: { userId: string; active: boolean }) {
  const version = getTokenSessionVersion();
  const [openedFor, setOpenedFor] = useState<{ userId: string; version: number } | null>(null);
  const open = openedFor?.userId === userId && openedFor.version === version;
  const native = Platform.OS === 'android' || Platform.OS === 'ios';
  const flow = useNearbyLocationPermission({ userId, driver: true, active: active && native, available: true,
    deferTrackingToCoordinator: true });
  const missing = flow.loaded && (!flow.permission || !flow.enabled);
  const authorized = flow.loaded && flow.permission && flow.enabled && !flow.busy && !flow.loadError;
  const opacity = useLocationPermissionPulse(native && active && missing && !open && !flow.busy && !flow.loadError);
  useEffect(() => { if (authorized) setOpenedFor(null); }, [authorized]);
  if (!native || !active || authorized || (!missing && !flow.loadError && !open)) return null;

  const confirm = async () => {
    if (!open || !active || flow.busy || version !== getTokenSessionVersion()) return;
    if (flow.loadError) { flow.retry(); return; }
    flow.setConsent(true);
    // Never send someone to general Settings from a stale permission snapshot.
    // A blocked grant is explained in the sheet and requires this explicit action.
    await (flow.settingsRequired ? flow.openSettings() : flow.authorize());
  };
  return <><View style={styles.container}>
    <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
      style={[styles.halo, { opacity }]} />
    <TouchableOpacity accessibilityRole="button" activeOpacity={0.9}
      onPress={() => { if (active && !flow.busy) setOpenedFor({ userId, version }); }}
      accessibilityLabel={flow.loadError ? 'Vérifier ma localisation' : 'Activer ma localisation en arrière-plan'}
      accessibilityHint="Pour recevoir les demandes proches même écran éteint"
      accessibilityState={{ disabled: flow.busy, busy: flow.busy }} disabled={flow.busy} style={styles.button}>
      {flow.busy ? <ActivityIndicator size="small" color="#FFFFFF" />
        : <Ionicons name="location-outline" size={24} color="#FFFFFF" />}
    </TouchableOpacity>
  </View><BackgroundLocationApproval visible={open} busy={flow.busy} loaded={flow.loaded} loadError={flow.loadError}
    permission={flow.permission} foregroundPermission={flow.foregroundPermission} settingsRequired={flow.settingsRequired}
    message={flow.message} onConfirm={confirm} onClose={() => {
      flow.defer(); setOpenedFor(null);
    }} /></>;
}

const styles = StyleSheet.create({
  container: { width: 44, height: 44, marginHorizontal: 10 },
  halo: { position: 'absolute', top: -4, bottom: -4, left: -4, right: -4,
    borderRadius: 28, borderWidth: 3, borderColor: ACTION_COLORS.orange },
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: ACTION_COLORS.orange },
});
