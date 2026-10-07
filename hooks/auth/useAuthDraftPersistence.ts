import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { clearAuthFlowDraft, flushAuthFlowDraft, saveAuthFlowDraft, selectAuthDraftState } from '@/services/authFlowDraft';
import type { useAuthFormState } from './useAuthFormState';

/** Writes only whitelisted navigation/profile changes, not every OTP/PIN keystroke. */
export function useAuthDraftPersistence(form: ReturnType<typeof useAuthFormState>, authenticated: boolean) {
  const serialized = JSON.stringify(selectAuthDraftState(form));
  const [saveFailed, setSaveFailed] = useState(false);
  const current = useRef({ serialized, authenticated });
  current.current = { serialized, authenticated };
  useEffect(() => {
    let active = true;
    const save = async () => {
      try {
        const value = current.current;
        if (value.authenticated) await clearAuthFlowDraft();
        else await saveAuthFlowDraft(JSON.parse(value.serialized));
        if (active) setSaveFailed(false);
      } catch { if (active) setSaveFailed(true); }
    };
    void save();
    const subscription = AppState.addEventListener('change', state => {
      // The draft is already queued before leaving for WhatsApp; retry a failed write on return.
      if (state === 'active') void save();
      else void flushAuthFlowDraft();
    });
    return () => { active = false; subscription.remove(); };
  }, [serialized, authenticated]);
  return { saveFailed };
}
