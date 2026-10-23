import { useEffect, useRef, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import { boundedRideAudio } from '@/services/rideAudioDiagnostics';

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
  const bridge = NativeModules?.ZwangaDriverAlerts;
  const owner = useRef(driverId); owner.current = driverId;
  const foreground = useRef(active); foreground.current = active;
  const generation = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    const lifecycle = generation;
    const epoch = ++lifecycle.current;
    mounted.current = true;
    inFlight.current = false; setBusy(false); setError(false); setStatus(null);
    if (active && Platform.OS === 'android' && driverId && bridge?.getFullScreenStatus) {
      void boundedRideAudio(Promise.resolve().then(() => bridge.getFullScreenStatus(driverId)), 1500).then(value => {
        if (generation.current !== epoch || owner.current !== driverId) return;
        const permission = parseState(value);
        setStatus(permission ? { owner: driverId, permission } : null);
      }).catch(() => { if (generation.current === epoch) setError(true); });
    }
    return () => { ++lifecycle.current; mounted.current = false; };
  }, [active, bridge, driverId]);

  const setOptIn = async (value: boolean) => {
    if (Platform.OS !== 'android' || !driverId || !mounted.current || !foreground.current ||
        owner.current !== driverId || inFlight.current || !bridge?.setFullScreenOptIn) return;
    const epoch = generation.current;
    const current = () => mounted.current && generation.current === epoch && owner.current === driverId && foreground.current;
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
    finally { if (current()) { inFlight.current = false; setBusy(false); } }
  };
  return { permission: Platform.OS === 'android' && active && status?.owner === driverId ? status?.permission : null,
    busy, error, setOptIn };
}
