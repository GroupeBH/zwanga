import { useEffect, useRef, useState } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';
import { boundedRideAudio } from '@/services/rideAudioDiagnostics';
import { openDriverAlertSettings } from '@/services/driverAlertChannel';

export type DriverFullScreenPermission = { optIn: boolean; allowed: boolean; notificationsAllowed: boolean };
function parseState(value: unknown): DriverFullScreenPermission | null {
  const state = value as DriverFullScreenPermission | null;
  return state && typeof state.optIn === 'boolean' && typeof state.allowed === 'boolean' &&
    typeof state.notificationsAllowed === 'boolean' ? state : null;
}

/** Shared by contextual onboarding and settings: consent only on a user tap. */
export function useDriverFullScreenPermission(driverId: string | undefined, active: boolean) {
  const [status, setStatus] = useState<{ owner: string; permission: DriverFullScreenPermission } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, retry] = useState(0);
  const bridge = NativeModules?.ZwangaDriverAlerts;
  const owner = useRef(driverId); owner.current = driverId;
  const foreground = useRef(active); foreground.current = active;
  const generation = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    const lifecycle = generation;
    const epoch = ++lifecycle.current;
    let retry: ReturnType<typeof setTimeout> | undefined;
    mounted.current = true;
    inFlight.current = false; setBusy(false); setError(false); setStatus(null);
    if (active && Platform.OS === 'android' && driverId && bridge?.getFullScreenStatus) {
      const read = (attempt: number) => {
        if (generation.current !== epoch || AppState.currentState !== 'active') return;
        void boundedRideAudio(Promise.resolve().then(() => bridge.getFullScreenStatus(driverId)), 1500).then(value => {
          if (generation.current !== epoch || owner.current !== driverId) return;
          const permission = parseState(value);
          if (value !== null && !permission) throw new Error('Invalid full-screen permission status');
          setStatus(permission ? { owner: driverId, permission } : null);
          setError(false);
        }).catch(() => {
          if (generation.current !== epoch) return;
          setError(true);
          if (attempt === 0) retry = setTimeout(() => read(1), 2000);
        });
      };
      read(0);
    }
    return () => { clearTimeout(retry); ++lifecycle.current; mounted.current = false; };
  }, [active, bridge, driverId, attempt]);

  const openNotifications = async () => {
    const epoch = generation.current;
    let cancelled = false;
    const current = () => !cancelled && mounted.current && generation.current === epoch && owner.current === driverId &&
      foreground.current && AppState.currentState === 'active';
    if (Platform.OS !== 'android' || !driverId || inFlight.current || !current()) return;
    inFlight.current = true; setBusy(true); setError(false);
    try {
      await boundedRideAudio(openDriverAlertSettings({ application: true, current }), 2000);
    } catch { if (current()) setError(true); }
    finally {
      cancelled = true;
      if (mounted.current && generation.current === epoch && owner.current === driverId) {
        inFlight.current = false; setBusy(false);
      }
    }
  };

  const setOptIn = async (value: boolean) => {
    if (AppState.currentState !== 'active' || Platform.OS !== 'android' || !driverId || !mounted.current || !foreground.current ||
        owner.current !== driverId || inFlight.current || !bridge?.setFullScreenOptIn) return;
    const epoch = generation.current;
    const current = () => mounted.current && generation.current === epoch && owner.current === driverId && foreground.current && AppState.currentState === 'active';
    inFlight.current = true; setBusy(true); setError(false);
    try {
      const saved = await boundedRideAudio(Promise.resolve().then(() => current() ? bridge.setFullScreenOptIn(driverId, value) : false), 2000);
      if (!current()) return;
      if (saved !== true) throw new Error('Permission unavailable');
      const permission = parseState(await boundedRideAudio(bridge.getFullScreenStatus(driverId), 1500));
      if (current()) {
        if (permission) setStatus({ owner: driverId, permission });
        else setError(true);
      }
    } catch { if (current()) setError(true); }
    finally {
      if (mounted.current && generation.current === epoch && owner.current === driverId) {
        inFlight.current = false; setBusy(false);
      }
    }
  };
  return { permission: Platform.OS === 'android' && active && status?.owner === driverId ? status?.permission : null,
    busy, error, setOptIn, openNotifications,
    retry: () => {
      if (mounted.current && foreground.current && AppState.currentState === 'active' && !inFlight.current)
        retry(value => value + 1);
    } };
}
