import { useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import type { Router } from 'expo-router';
import type { PublicationSuccess } from '@/features/publish/publishModel';
import { getTokenSessionVersion } from '@/services/tokenSession';

export function usePublishSuccessRedirect(success: PublicationSuccess, active: boolean, router: Router) {
  const navigated = useRef(false);
  const version = useRef(getTokenSessionVersion());
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!success || !active || navigated.current || version.current !== getTokenSessionVersion()) return;
    let cancelled = false;
    // The success render has already removed the publication's optional native map.
    // Wait for the current interaction, not an arbitrary UIKit/modal timeout.
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled || navigated.current || version.current !== getTokenSessionVersion()) return;
      navigated.current = true;
      try {
        if (success.recurring) router.replace('/recurring-trips');
        else if (success.id) router.replace({ pathname: '/trip/[id]', params: { id: success.id } });
        else router.replace('/trips'); // Older server: do not invent an id or repeat the POST.
      } catch {
        navigated.current = false;
        setFailed(true);
      }
    });
    return () => { cancelled = true; task.cancel(); };
  }, [success, active, router, attempt]);
  return { failed, retry: () => { setFailed(false); setAttempt(value => value + 1); } };
}
