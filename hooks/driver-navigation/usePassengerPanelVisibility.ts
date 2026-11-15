import { useEffect, useState } from 'react';
import type { LocationObject } from 'expo-location';
import type { Waypoint } from '@/features/driver-navigation/navigationModel';
import { passengerPanelApproach } from '@/features/driver-navigation/driverPassengerPanelVisibility';

export function usePassengerPanelVisibility(tripId: string, stop: Waypoint | undefined, fix: LocationObject | null, enabled: boolean) {
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [, recheck] = useState(0);
  const approach = enabled ? passengerPanelApproach(tripId, stop, fix) : null;
  const key = approach?.key ?? null;
  const near = approach?.near ?? false;
  useEffect(() => {
    if (near && key) setRevealedKey(key);
    // GPS loss must show the card, but must not erase an already reached threshold.
    else if (key) setRevealedKey(previous => previous === key ? previous : null);
  }, [key, near]);
  const hidden = Boolean(approach && !near && revealedKey !== key);
  const expiresAt = approach?.expiresAt;
  useEffect(() => {
    if (!hidden || !expiresAt) return;
    // Do not leave manual actions hidden indefinitely when GPS samples stop.
    const timer = setTimeout(() => recheck(value => value + 1), Math.max(1, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [hidden, expiresAt]);
  return hidden;
}
