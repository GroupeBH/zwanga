import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { publishRideEntrySource, removeRideEntrySource, type RideEntryMessage } from '@/services/rideEntryAnnouncement';

/** Publish already loaded screen data; no fetch, navigation, or native audio here. */
export function useRideEntryAnnouncement(userId: string | undefined, active: boolean, ready: boolean, message: RideEntryMessage | null) {
  const path = usePathname();
  const token = useRef({}).current;
  const key = message?.key;
  const text = message?.text;
  useEffect(() => {
    if (!userId || !active) { removeRideEntrySource(token); return; }
    publishRideEntrySource(token, { userId, path, ready, message: key && text ? { key, text } : null });
  }, [userId, path, active, ready, key, text, token]);
  useEffect(() => () => removeRideEntrySource(token), [token]);
}
