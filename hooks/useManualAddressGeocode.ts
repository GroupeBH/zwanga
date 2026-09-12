import type { MapLocationSelection } from '@/components/LocationPickerModal';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import { buildManualGeocodeQuery, MANUAL_GEOCODE_DEBOUNCE_MS, mapGeocodeResponseToSelection, type ManualGeocodeStatus } from '@/utils/manualAddressGeocode';
import { useEffect, useRef, useState } from 'react';

interface Options {
  enabled: boolean;
  address: string;
  selection: MapLocationSelection | null;
  onResolved: (selection: MapLocationSelection) => void;
  onMissing?: () => void;
}

/** Shared by request/publication. Only obsolete reads are aborted, never a business mutation. */
export function useManualAddressGeocode({ enabled, address, selection, onResolved, onMissing }: Options) {
  const [geocode] = useGeocodeMutation();
  const [status, setStatus] = useState<ManualGeocodeStatus>('idle');
  const callbacks = useRef({ onResolved, onMissing });
  useEffect(() => { callbacks.current = { onResolved, onMissing }; }, [onResolved, onMissing]);
  useEffect(() => {
    const query = address.trim();
    if (!enabled || query.length < 3) { setStatus('idle'); return; }
    if (selection) { setStatus('found'); return; }
    let current = true;
    let request: ReturnType<typeof geocode> | undefined;
    setStatus('searching');
    const timer = setTimeout(() => {
      request = geocode({ address: buildManualGeocodeQuery(query), region: 'cd' });
      void request.unwrap().then((response) => {
        if (!current) return;
        const resolved = mapGeocodeResponseToSelection(query, response);
        if (resolved) { callbacks.current.onResolved(resolved); setStatus('found'); }
        else { callbacks.current.onMissing?.(); setStatus('missing'); }
      }).catch(() => { if (current) setStatus('missing'); });
    }, MANUAL_GEOCODE_DEBOUNCE_MS);
    return () => { current = false; clearTimeout(timer); request?.abort(); };
  }, [address, enabled, geocode, selection]);
  return [status, setStatus] as const;
}
