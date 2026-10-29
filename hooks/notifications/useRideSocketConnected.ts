import { useEffect, useState } from 'react';
import { chatSocket } from '@/services/chatSocket';
import { useAppSelector } from '@/store/hooks';

/** Observe the existing authenticated socket; no timer, connection or room of our own. */
export function useRideSocketConnected(enabled: boolean) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const [connection, setConnection] = useState<{ userId: string; connected: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || !userId) { setConnection(null); return; }
    return chatSocket.subscribeToConnectionState(connected => {
      setConnection(previous => previous?.userId === userId && previous.connected === connected
        ? previous : { userId, connected });
    });
  }, [enabled, userId]);
  return enabled && !!userId && connection?.userId === userId && connection.connected === true;
}
