import { useEffect, useState } from 'react';
import { usePaymentAnnouncement } from '@/hooks/notifications/usePaymentAnnouncement';
import { walletAnnouncement, type WalletWithdrawalIssue } from '@/features/wallet/walletAnnouncement';
import type { RideEntryMessage } from '@/services/rideEntryAnnouncement';
import type { WalletSummary } from '@/types';

export function useWalletAnnouncement({ summary, userId, visible, loading, fetching, error, issue }: {
  summary?: WalletSummary; userId?: string; visible: boolean;
  loading: boolean; fetching: boolean; error: boolean; issue?: WalletWithdrawalIssue;
}) {
  const [snapshot, setSnapshot] = useState<{ userId: string; message: RideEntryMessage } | null>(null);
  const message = walletAnnouncement(summary, userId, issue);
  const key = message?.key, text = message?.text;
  const eligible = visible && !loading && !error && Boolean(userId && key && text);
  useEffect(() => {
    if (!eligible) { setSnapshot(null); return; }
    // Wait for the balance read, not for unrelated ledger pages. An unchanged
    // background refresh must not cut a sentence already in progress.
    if (!fetching && userId && key && text) setSnapshot(previous =>
      previous?.userId === userId && previous.message.key === key ? previous : { userId, message: { key, text } });
  }, [eligible, fetching, userId, key, text]);
  usePaymentAnnouncement(snapshot?.message ?? null,
    eligible && snapshot?.userId === userId, 'wallet');
}
