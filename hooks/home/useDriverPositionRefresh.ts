import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { refreshDriverPosition, type DriverPositionRefreshResult } from '@/features/home/refreshDriverPosition';

const messages = {
  sent: { title: 'Position envoyée', detail: 'Votre position a bien été actualisée.', settings: false },
  permission: { title: 'Localisation non autorisée', detail: 'Touchez pour autoriser la localisation.', settings: true },
  disabled: { title: 'Partage de position désactivé', detail: 'Touchez pour choisir de l’activer.', settings: true },
  gps: { title: 'Position introuvable', detail: 'Vérifiez le GPS, puis touchez pour réessayer.', settings: false },
  retry: { title: 'Envoi non confirmé', detail: 'Vérifiez la connexion, puis réessayez.', settings: false },
};

export function useDriverPositionRefresh({ userId, active, online }: {
  userId?: string; active: boolean; online: boolean;
}) {
  const version = getTokenSessionVersion();
  const latest = useRef({ userId, active, online, version });
  latest.current = { userId, active, online, version };
  const mounted = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DriverPositionRefreshResult | null>(null);
  useEffect(() => {
    mounted.current = true;
    setBusy(false); setResult(null);
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        pending.current?.abort(); pending.current = null;
        setBusy(false); setResult(null);
      }
    });
    return () => { mounted.current = false; pending.current?.abort(); pending.current = null; subscription.remove(); };
  }, [userId, version, active, online]);
  useEffect(() => {
    if (result !== 'sent') return;
    const timer = setTimeout(() => setResult(null), 5_000);
    return () => clearTimeout(timer);
  }, [result]);

  const refresh = async () => {
    if (!mounted.current || !userId || !active || !online || pending.current || AppState.currentState !== 'active') return;
    const controller = new AbortController(); pending.current = controller;
    const current = () => mounted.current && !controller.signal.aborted && pending.current === controller &&
      latest.current.userId === userId && latest.current.active && latest.current.online &&
      latest.current.version === version && version === getTokenSessionVersion() && AppState.currentState === 'active';
    if (!current()) { pending.current = null; return; }
    setBusy(true); setResult(null);
    try {
      const next = await refreshDriverPosition(userId, controller.signal, current);
      if (current()) setResult(next);
    } catch {
      if (current()) setResult('retry');
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        // Account/foreground changes already reset the UI in the effect above.
        if (!controller.signal.aborted && latest.current.userId === userId && version === getTokenSessionVersion()) setBusy(false);
      }
      controller.abort();
    }
  };
  return { busy, refresh, result, feedback: result && result !== 'cancelled' ? messages[result] : null };
}
