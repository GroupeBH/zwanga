import React, { useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BackHandler, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { createRideOverlayStore } from './rideOverlayStore';
import { RideOverlayContext, RideOverlayScopeContext } from './rideOverlayContext';
import { RideNoticeBanner } from './RideNoticeBanner';

const subscribeNothing = () => () => {};
const noOverlay = () => null;
const emptyEntries: import('./rideOverlayStore').RideOverlayEntry[] = [];
const noEntries = () => emptyEntries;
export function useRideOverlay() {
  const store = useContext(RideOverlayContext);
  const active = useSyncExternalStore(store?.subscribe ?? subscribeNothing, store?.getActive ?? noOverlay, noOverlay);
  return { store, active };
}

function RideOverlayHost({ scope }: { scope: string }) {
  const { active, store } = useRideOverlay();
  const entries = useSyncExternalStore(store?.subscribe ?? subscribeNothing, store?.getEntries ?? noEntries, noEntries);
  const foreground = useAppIsActive();
  const shown = foreground && active?.scope === scope ? active : null;
  useEffect(() => {
    if (!shown || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      shown.onRequestClose?.(); return true;
    });
    return () => subscription.remove();
  }, [shown]);
  useEffect(() => {
    if (!shown?.id) return;
    return () => Keyboard.dismiss();
  }, [shown?.id]);
  // Keep suspended panels mounted: nested forms must not reset or repeatedly
  // register/unregister when a higher-priority panel takes their place.
  return <>{entries.filter(entry => entry.scope === scope).map(entry => {
    const visible = entry.id === shown?.id;
    return <View key={entry.id} style={[styles.overlay, !visible && styles.hidden]}
      pointerEvents={visible ? 'auto' : 'none'} accessibilityViewIsModal={visible}
      accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
      onAccessibilityEscape={entry.onRequestClose}>{entry.children}</View>;
  })}</>;
}

export function RideOverlayProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(createRideOverlayStore);
  return <RideOverlayContext.Provider value={store}>
    {children}
    <RideOverlayHost scope="global" />
  </RideOverlayContext.Provider>;
}

/** Host lives inside its navigation route: child hooks retain the correct focus/theme contexts. */
export function RideOverlayScope({ scopeKey, active, children }: {
  scopeKey: string; active: boolean; children: React.ReactNode;
}) {
  const { store, active: overlay } = useRideOverlay();
  const value = useMemo(() => ({ key: scopeKey, active }), [scopeKey, active]);
  useLayoutEffect(() => {
    store?.setScope(scopeKey, active);
    return () => store?.setScope(scopeKey, false);
  }, [store, scopeKey, active]);
  return <RideOverlayScopeContext.Provider value={value}>
    <View style={styles.fill}>
      <View style={styles.fill} pointerEvents={overlay ? 'none' : 'auto'}
        accessibilityElementsHidden={Boolean(overlay)} importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      <RideNoticeBanner scope={scopeKey} />
      <RideOverlayHost scope={scopeKey} />
    </View>
  </RideOverlayScopeContext.Provider>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 10000, elevation: 10000 },
  hidden: { display: 'none' },
});
