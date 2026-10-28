import { useEffect, useRef, useState } from 'react';
import type { TripRequest } from '@/types';
import { requestResponseDeadline, requestResponseLabel } from '@/features/request-detail/requestResponseWindow';

export function useRequestResponseWindow(request: TripRequest | undefined, readStartedAt: number | undefined,
  active: boolean, refetch: () => Promise<unknown>, passenger = false) {
  const [, tick] = useState(0);
  const refreshed = useRef('');
  const window = request?.responseWindow;
  const measured = requestResponseDeadline(window, readStartedAt);
  const anchor = useRef<{ key: string; deadline: number | null }>({ key: '', deadline: null });
  const sampleKey = `${request?.id}:${window?.serverNow}:${window?.expiresAt}`;
  if (anchor.current.key !== sampleKey) anchor.current = { key: sampleKey, deadline: measured };
  else if (measured !== null) anchor.current.deadline = Math.min(anchor.current.deadline ?? measured, measured);
  const deadline = anchor.current.deadline;
  const seconds = deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const key = `${request?.id}:${window?.phase}:${window?.expiresAt}`;
  const running = active && seconds !== null && seconds > 0;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running, deadline]);
  useEffect(() => {
    if (!active || !window || (seconds !== 0 && deadline !== null) || refreshed.current === key) return;
    refreshed.current = key;
    void refetch().catch(() => undefined);
  }, [active, seconds, deadline, window, key, refetch]);
  return {
    blocked: !!window && (window.phase !== 'driver' || seconds === null || seconds === 0),
    closed: !!window && (window.phase === 'accepting' || seconds === null || seconds === 0),
    label: window ? seconds === null ? 'Actualisation de la demande…' : requestResponseLabel(window.phase, seconds, passenger) : null,
  };
}
