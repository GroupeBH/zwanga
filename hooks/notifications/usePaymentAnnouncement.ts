import { useEffect, useRef } from 'react';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { publishPaymentSpeech, removePaymentSpeech, type ScreenSpeechKind } from '@/services/paymentSpeechSource';
import type { RideEntryMessage } from '@/services/rideEntryAnnouncement';

/** The existing foreground voice owns playback, interruption and deduplication. */
export function usePaymentAnnouncement(message: RideEntryMessage | null, visible: boolean, kind: ScreenSpeechKind = 'payment') {
  const active = useAppIsActive();
  const user = useAppSelector(selectUser);
  const token = useRef({});
  const version = getTokenSessionVersion();
  const key = message?.key, text = message?.text;
  useEffect(() => {
    const source = token.current;
    if (visible && active && user?.id && key && text) publishPaymentSpeech(source, user.id, version, { key, text }, kind);
    else removePaymentSpeech(source);
    return () => removePaymentSpeech(source);
  }, [active, visible, user?.id, version, key, text, kind]);
}
