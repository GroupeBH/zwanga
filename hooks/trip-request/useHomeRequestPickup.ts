import { useCallback, useEffect, useRef, useState } from 'react';
import { getPickerCoordinate } from '@/features/location-picker/locationPickerModel';
import { buildCurrentLocationSelection } from '@/utils/currentLocationSelection';
import type { RequestTripController } from './useRequestTripController';

// Native permission/address lookups can stall. Detach timed-out/obsolete results without mutating the draft.
function bounded<T>(promise: Promise<T>, ms: number, signal: AbortSignal): Promise<T | null> {
  return new Promise(resolve => {
    const finish = (value: T | null) => { clearTimeout(timer); signal.removeEventListener('abort', cancel); resolve(value); };
    const cancel = () => finish(null);
    const timer = setTimeout(cancel, ms);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    void promise.then(finish, cancel);
  });
}

/** Home uses GPS for pickup; the flow offers a manual map only when acquisition fails. */
export function useHomeRequestPickup(form: RequestTripController) {
  const latest = useRef(form); latest.current = form;
  const mounted = useRef(false), attempted = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [source, setSource] = useState<'gps' | 'manual'>(form.departureLocation ? 'manual' : 'gps');
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.abort(); pending.current = null; };
  }, []);

  const retry = async () => {
    const current = latest.current;
    if (!mounted.current || !current.isScreenActive || pending.current || current.departureLocation ||
        current.isCreating || current.createdRequestId || current.submissionRecoveryMessage) return;
    attempted.current = true;
    current.departureTouchedRef.current = false;
    const controller = new AbortController(); pending.current = controller;
    const valid = () => mounted.current && !controller.signal.aborted && !latest.current.departureTouchedRef.current;
    setStatus('loading');
    try {
      const position = await bounded(current.getCurrentLocation(), 20_000, controller.signal);
      if (!valid()) return;
      const age = position ? Date.now() - position.timestamp : Infinity;
      const point = position && getPickerCoordinate(position.coords.latitude, position.coords.longitude);
      // Never call a 15-minute fallback (or an inaccurate/unknown fix) the current pickup.
      if (!point || age < 0 || age > 120_000 || !Number.isFinite(age) ||
          position?.coords.accuracy == null || !Number.isFinite(position.coords.accuracy) ||
          position.coords.accuracy < 0 || position.coords.accuracy > 250) {
        setStatus('unavailable'); return;
      }
      const selection = await bounded(buildCurrentLocationSelection(point), 2_000, controller.signal);
      if (!valid()) return;
      const pickup = selection ?? { ...point, title: 'Ma position', address: 'Ma position' };
      latest.current.setDepartureLocation(pickup);
      latest.current.setDepartureManualAddress(pickup.title || pickup.address);
      setSource('gps'); setStatus('ready');
    } catch {
      if (valid()) setStatus('unavailable');
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  };
  useEffect(() => {
    if (!form.isHomeEntry || !form.hasAppliedRoutePrefill || !form.isScreenActive || attempted.current || form.departureLocation) return;
    void retry();
  }, [form.isHomeEntry, form.hasAppliedRoutePrefill, form.isScreenActive, form.departureLocation]);

  const chooseManually = useCallback(() => {
    pending.current?.abort(); pending.current = null;
    setStatus('unavailable');
  }, []);
  const confirmManual = () => { setSource('manual'); setStatus('ready'); };
  return { status: form.departureLocation ? 'ready' as const : status,
    source: attempted.current ? source : 'manual' as const, retry, chooseManually, confirmManual };
}
