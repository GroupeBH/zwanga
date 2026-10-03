import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReferralSummary } from '@/types';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { referralQrLink, type ReferralQrState } from '@/features/referrals/referralQrModel';

export type ReferralQrSource = {
  summary?: ReferralSummary;
  refetchSummary: () => { unwrap: () => Promise<ReferralSummary> };
};

export function useReferralQr({ summary, refetchSummary, userId, active }: ReferralQrSource & {
  userId?: string; active: boolean;
}) {
  const [state, setState] = useState<ReferralQrState | null>(null);
  const scope = useMemo(() => ({ userId, active }), [userId, active]);
  const latest = useRef(scope);
  latest.current = scope;
  const mounted = useRef(false);
  const sequence = useRef(0);
  const pending = useRef(false);
  const invalidate = useCallback(() => {
    sequence.current++;
    pending.current = false;
  }, []);
  const close = useCallback(() => {
    invalidate();
    setState(null);
  }, [invalidate]);
  useLayoutEffect(() => {
    mounted.current = true;
    close();
    return () => { mounted.current = false; invalidate(); };
  }, [scope, close, invalidate]);

  const open = async () => {
    if (!active || !userId || pending.current) return;
    pending.current = true;
    const request = ++sequence.current;
    const version = getTokenSessionVersion();
    const current = () => mounted.current && latest.current === scope && request === sequence.current &&
      version === getTokenSessionVersion();
    setState({ phase: 'loading' });
    try {
      const source = referralQrLink(summary?.shareLink) ? summary! : await refetchSummary().unwrap();
      if (!current()) return;
      const link = referralQrLink(source.shareLink);
      if (!link) throw new Error('Invitation URL unavailable');
      setState({ phase: 'ready', link, code: source.code });
    } catch {
      if (current()) setState({ phase: 'error' });
    } finally {
      if (request === sequence.current) pending.current = false;
    }
  };
  return { state: active && userId ? state : null, open, close };
}
