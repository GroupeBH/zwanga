import { useEffect, useRef } from 'react';
import { createSignupPhoneProof } from '@/features/auth/signupPhoneProof';

export function useSignupPhoneProof(scope: string) {
  const holder = useRef<ReturnType<typeof createSignupPhoneProof> | null>(null);
  if (!holder.current) holder.current = createSignupPhoneProof();
  const proof = holder.current;
  // Invalidate late responses immediately when the form's identity changes.
  proof.setScope(scope);
  useEffect(() => () => proof.clear(), [proof]);
  return proof;
}
