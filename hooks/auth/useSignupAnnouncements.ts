import { useState } from 'react';

/** Explicit choice for this signup, never inherited from another account/device preference. */
export function useSignupAnnouncements(scope: string) {
  const [choice, setChoice] = useState({ scope, accepted: false });
  // A different signup must also discard the previous choice when returning to it.
  if (choice.scope !== scope) setChoice({ scope, accepted: false });
  return {
    updatesAccepted: choice.scope === scope && choice.accepted,
    setUpdatesAccepted: (accepted: boolean) => setChoice({ scope, accepted }),
  };
}
