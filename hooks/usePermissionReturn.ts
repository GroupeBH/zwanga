import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

/** Recheck native grants on return, including Android focus-only interruptions.
 * Never requests permissions or brings the app to the foreground. */
export function usePermissionReturn(onReturn: () => void) {
  const callback = useRef(onReturn); callback.current = onReturn;
  useEffect(() => {
    if (!AppState?.addEventListener) return;
    let away = AppState.currentState !== 'active';
    const resume = () => {
      if (!away || AppState.currentState !== 'active') return;
      away = false; callback.current();
    };
    const change = AppState.addEventListener('change', state => {
      if (state !== 'active') away = true;
      else resume();
    });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { away = true; }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', resume) : null;
    return () => { change.remove(); blur?.remove(); focus?.remove(); };
  }, []);
}
