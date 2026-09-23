import React, { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Modal, Platform, type ModalProps, type NativeSyntheticEvent } from 'react-native';
import { RideOverlayContext, RideOverlayScopeContext } from './rideOverlayContext';
import { RIDE_OVERLAY_PRIORITY } from './rideOverlayStore';

const subscribeNothing = () => () => {};
const noNavigation = () => false;

/** During navigation, render in the shared screen overlay instead of another UIKit modal controller. */
export type RideModalProps = ModalProps & { priority?: number; inApp?: boolean };
export function RideModal({ priority = RIDE_OVERLAY_PRIORITY.panel, inApp = false, ...props }: RideModalProps) {
  const store = useContext(RideOverlayContext);
  const scope = useContext(RideOverlayScopeContext);
  const navigationActive = useSyncExternalStore(store?.subscribe ?? subscribeNothing, store?.hasNavigation ?? noNavigation, noNavigation);
  const id = useId();
  const callbacks = useRef(props);
  callbacks.current = props;
  const mode = useRef<'native' | 'overlay' | null>(null);
  const visible = props.visible !== false;
  const requested = visible && (!scope || scope.active);
  if (requested && mode.current === null) mode.current = store && (inApp || scope || navigationActive) ? 'overlay' : 'native';
  const overlay = mode.current === 'overlay' || Boolean(scope && store);
  const wasRequested = useRef(false);
  const nativePresented = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [forceUnmount, setForceUnmount] = useState(false);
  const finishDismiss = useCallback(() => {
    if (!nativePresented.current) return;
    if (dismissTimer.current !== null) clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
    nativePresented.current = false;
    mode.current = null;
    store?.blockNative(id, false);
    callbacks.current.onDismiss?.();
  }, [id, store]);

  // Recovery is ordered: first REMOVE the native element, then release its blocker.
  // Never just hide the blocker with a timer while leaving a UIKit controller mounted.
  useEffect(() => {
    if (requested) { setForceUnmount(false); return; }
    if (overlay || !nativePresented.current || Platform.OS !== 'ios') return;
    dismissTimer.current = setTimeout(() => {
      dismissTimer.current = null;
      setForceUnmount(true);
    }, 2000);
    return () => {
      if (dismissTimer.current !== null) clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    };
  }, [overlay, requested]);
  useLayoutEffect(() => {
    if (forceUnmount && !requested) finishDismiss();
  }, [finishDismiss, forceUnmount, requested]);

  useLayoutEffect(() => {
    if (overlay && requested) {
      store?.put({ id, scope: scope?.key ?? 'global', priority, children: props.children,
        onRequestClose: () => callbacks.current.onRequestClose?.({} as NativeSyntheticEvent<any>) });
    } else store?.remove(id);
    if (!overlay && requested) {
      nativePresented.current = true;
      store?.blockNative(id, true);
    }
  }, [store, id, overlay, requested, scope?.key, priority, props.children]);

  useEffect(() => {
    const closed = wasRequested.current && !requested;
    wasRequested.current = requested;
    // Overlay removal is synchronous; no native onDismiss or arbitrary delay to wait for.
    if (closed && (overlay || Platform.OS !== 'ios')) {
      mode.current = null;
      nativePresented.current = false;
      store?.blockNative(id, false);
      callbacks.current.onDismiss?.();
    }
  }, [id, overlay, requested, store]);
  useLayoutEffect(() => () => {
    store?.remove(id);
    store?.blockNative(id, false);
  }, [store, id]);

  if (overlay || (forceUnmount && !requested)) return null;
  return <Modal {...props} visible={requested} onDismiss={() => {
    // Ignore a late close event if this component has already been reopened.
    if (callbacks.current.visible !== false) return;
    finishDismiss();
  }} />;
}
