import { Colors } from '@/constants/styles';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import React, { useCallback, useContext, useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RideOverlayContext } from './rideOverlayContext';

const subscribeNothing = () => () => {};
const noNotice = () => null;
export function RideNoticeBanner({ scope }: { scope: string }) {
  const store = useContext(RideOverlayContext);
  const foreground = useAppIsActive();
  const insets = useSafeAreaInsets();
  const snapshot = useCallback(() => store?.getNotice(scope) ?? null, [scope, store]);
  const notice = useSyncExternalStore(store?.subscribe ?? subscribeNothing, snapshot, noNotice);
  const close = useCallback(() => store?.clearNotice(scope, notice ?? undefined), [store, scope, notice]);
  useEffect(() => {
    if (!notice) return;
    if (!foreground) { store?.clearNotices(scope); return; }
    const timer = setTimeout(close, Math.max(0, notice.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [notice, foreground, close, store, scope]);
  if (!notice || !foreground || notice.expiresAt <= Date.now()) return null;
  return <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 12 }]}>
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <Ionicons name="information-circle-outline" size={23} color={Colors.primary} />
      <View style={styles.copy}>
        <Text style={styles.title}>{notice.title}</Text>
        {notice.message ? <Text style={styles.message} numberOfLines={3}>{notice.message}</Text> : null}
      </View>
      <TouchableOpacity onPress={close} style={styles.close} accessibilityRole="button" accessibilityLabel="Fermer l’information">
        <Ionicons name="close" size={22} color={Colors.gray[600]} />
      </TouchableOpacity>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  host: { position: 'absolute', left: 12, right: 12, zIndex: 9000, elevation: 9000 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200] },
  copy: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.gray[900] },
  message: { fontSize: 13, lineHeight: 18, marginTop: 3, color: Colors.gray[600] },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
