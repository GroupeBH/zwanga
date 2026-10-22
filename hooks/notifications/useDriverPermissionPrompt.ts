import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getAppActiveSince, isAppActive } from '@/services/appActivity';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { driverPermissionRepository, getDriverPublicationRevision, subscribeDriverPublication } from '@/services/driverPermissionOnboarding';
import { DRIVER_PERMISSION_DELAY_MS, isDriverPermissionPromptDue, isDriverPermissionVisitEligible,
  type DriverPermissionHistory, type DriverPermissionKind } from '@/features/permissions/driverPermissionRepository';

type Options = {
  userId: string; active: boolean; safe: boolean; overlayBusy: boolean;
  locationReady: boolean; locationNeeded: boolean; fullScreenNeeded: boolean;
};

/** One foreground timer, no polling/fetch; a native permission screen preserves the chosen step. */
export function useDriverPermissionPrompt(options: Options) {
  const { userId, active, safe, overlayBusy, locationReady, locationNeeded, fullScreenNeeded } = options;
  const visit = getAppActiveSince();
  const version = getTokenSessionVersion();
  const revision = useSyncExternalStore(subscribeDriverPublication, getDriverPublicationRevision, getDriverPublicationRevision);
  const [history, setHistory] = useState<DriverPermissionHistory | null>(null);
  const [stayed, setStayed] = useState(false);
  const [selected, setSelected] = useState<DriverPermissionKind | null>(null);
  const handled = useRef(new Set<DriverPermissionKind>());
  const selecting = useRef(false);
  const latest = useRef(options); latest.current = options;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!active) { setStayed(false); return; }
    const timer = setTimeout(() => setStayed(true), DRIVER_PERMISSION_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active, visit]);
  useEffect(() => {
    if (!active) return;
    let current = true;
    setHistory(null);
    void driverPermissionRepository.visit(userId, visit).then(value => {
      if (current) setHistory(value);
    }).catch(() => { if (current) setHistory(null); });
    return () => { current = false; };
  }, [active, userId, visit, revision]);
  useEffect(() => { handled.current.clear(); }, [visit]);
  const eligible = Boolean(history && isDriverPermissionVisitEligible(history, visit, stayed));
  useEffect(() => {
    if (selecting.current || !history || !eligible || !active || !safe || overlayBusy || selected || !locationReady) return;
    const kind = (['location', 'fullScreen'] as const).find(value =>
      !handled.current.has(value) && (value === 'location' ? locationNeeded : fullScreenNeeded) &&
      isDriverPermissionPromptDue(history, value, Date.now()));
    if (!kind) return;
    selecting.current = true;
    handled.current.add(kind);
    void driverPermissionRepository.prompted(userId, visit, kind, Date.now()).then(value => {
      if (!mounted.current || !isAppActive() || version !== getTokenSessionVersion() || getAppActiveSince() !== visit ||
          latest.current.userId !== userId || !latest.current.safe || latest.current.overlayBusy ||
          !(kind === 'location' ? latest.current.locationNeeded : latest.current.fullScreenNeeded)) return;
      setHistory(value);
      setSelected(kind);
    }).catch(() => { /* Fail closed, without blocking Home or retrying in a loop. */ })
      .finally(() => { selecting.current = false; });
  }, [active, eligible, fullScreenNeeded, history, locationNeeded, locationReady, overlayBusy, safe, selected, userId, version, visit]);
  const close = () => { if (mounted.current && getTokenSessionVersion() === version) setSelected(null); };
  return { selected, close, eligible };
}
