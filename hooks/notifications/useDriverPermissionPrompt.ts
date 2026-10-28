import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getAppActiveSince, isAppActive } from '@/services/appActivity';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { driverPermissionRepository, getDriverPublicationRevision, subscribeDriverPublication } from '@/services/driverPermissionOnboarding';
import { isDriverPermissionPromptDue,
  type DriverPermissionHistory, type DriverPermissionKind } from '@/features/permissions/driverPermissionRepository';

type Options = {
  userId: string; active: boolean; safe: boolean; overlayBusy: boolean;
  locationReady: boolean; locationNeeded: boolean; fullScreenNeeded: boolean;
};

/** Contextual sequence from first login; no polling or automatic native settings. */
export function useDriverPermissionPrompt(options: Options) {
  const { userId, active, safe, overlayBusy, locationReady, locationNeeded, fullScreenNeeded } = options;
  const visit = getAppActiveSince();
  const version = getTokenSessionVersion();
  const revision = useSyncExternalStore(subscribeDriverPublication, getDriverPublicationRevision, getDriverPublicationRevision);
  const [history, setHistory] = useState<DriverPermissionHistory | null>(null);
  const [selected, setSelected] = useState<DriverPermissionKind | null>(null);
  const handled = useRef(new Set<DriverPermissionKind>());
  const presentation = useRef<{ kind: DriverPermissionKind; shown: boolean } | null>(null);
  const latest = useRef(options); latest.current = options;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
  const eligible = Boolean(history);
  useEffect(() => {
    if (!history || !active || !safe || overlayBusy || selected) return;
    // One explanation at a time, including fullscreen on the first login.
    const kind = (['location', 'fullScreen'] as const).find(value =>
      !handled.current.has(value) && (value === 'location' ? locationReady && locationNeeded : fullScreenNeeded) &&
      isDriverPermissionPromptDue(history, value, Date.now()));
    if (!kind) return;
    handled.current.add(kind);
    presentation.current = { kind, shown: false };
    setSelected(kind);
  }, [active, eligible, fullScreenNeeded, history, locationNeeded, locationReady, overlayBusy, safe, selected, userId, version, visit]);
  // RideModal reports actual presentation, including overlay priority arbitration.
  // A lock, incoming ride or route change before onShow must not consume 24 hours.
  const onShown = (kind: DriverPermissionKind) => {
    const step = presentation.current;
    if (!step || step.kind !== kind || step.shown || !mounted.current || !isAppActive() ||
        !latest.current.safe || latest.current.userId !== userId || version !== getTokenSessionVersion()) return;
    step.shown = true;
    const now = Date.now();
    setHistory(value => value ? { ...value, promptedAt: { ...value.promptedAt, [kind]: now } } : value);
    void driverPermissionRepository.prompted(userId, visit, kind, now).catch(() => {
      // The in-memory guard still prevents a loop during this mounted session.
    });
  };
  const close = () => { if (mounted.current && getTokenSessionVersion() === version) setSelected(null); };
  return { selected, close, eligible, onShown };
}
