import React, { useContext, useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
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

  if (overlay) return null;
  return <Modal {...props} visible={requested} onDismiss={() => {
    if (!nativePresented.current) return;
    nativePresented.current = false;
    mode.current = null;
    store?.blockNative(id, false);
    callbacks.current.onDismiss?.();
  }} />;
}
