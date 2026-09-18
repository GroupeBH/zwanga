import { useEffect, useRef, useState } from 'react';
import { useDialog } from '@/components/ui/DialogProvider';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { useCheckWalletWithdrawalMutation, useGetWalletWithdrawalsQuery, useRequestWalletWithdrawalMutation } from '@/store/api/walletApi';
import { clearWalletWithdrawalIntent, prepareWalletWithdrawalIntent, readWalletWithdrawalIntent, type WalletWithdrawalIntent } from '@/services/walletWithdrawalIntent';
import { normalizePayoutPhone } from '@/features/driver-earnings/payoutModel';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { WalletSummary, WalletWithdrawal } from '@/types';

export function useWalletWithdrawal(summary: WalletSummary | undefined, isActive: boolean) {
  const user = useAppSelector(selectUser);
  const userId = user?.id;
  const { showDialog } = useDialog();
  const [tokens, setTokens] = useState('');
  const [phone, setPhone] = useState('');
  const [intent, setIntent] = useState<WalletWithdrawalIntent | null>(null);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const current = useRef({ userId, isActive, mounted: true });
  current.current.userId = userId;
  current.current.isActive = isActive;
  useEffect(() => { current.current.mounted = true; return () => { current.current.mounted = false; }; }, []);
  const [request] = useRequestWalletWithdrawalMutation();
  const [check] = useCheckWalletWithdrawalMutation();
  const { data: withdrawals = [], isError: historyError } = useGetWalletWithdrawalsQuery(undefined, {
    skip: !userId || !summary?.withdrawal || !isActive, pollingInterval: 30000, refetchOnFocus: true,
  });

  useEffect(() => {
    let active = true;
    setIntent(null); setReadyFor(null); setStorageError(false); setTokens(''); setPhone(user?.phone ?? '');
    if (userId) void readWalletWithdrawalIntent(userId).then(value => {
      if (active) { setIntent(value); setReadyFor(userId); }
    }).catch(() => { if (active) setStorageError(true); });
    return () => { active = false; };
  }, [userId, user?.phone]);

  const stillHere = () => current.current.mounted && current.current.userId === userId;
  const present = (value: WalletWithdrawal) => showDialog({
    variant: value.status === 'succeeded' ? 'success' : 'info',
    title: value.status === 'succeeded' ? 'Retrait effectué' : 'Suivi du retrait',
    message: `${value.tokens} jetons · ${value.amount} ${value.currency}\n${value.message}\nRéférence : ${value.id}`,
  });
  const clear = async (value: WalletWithdrawalIntent) => {
    await clearWalletWithdrawalIntent(value);
    if (stillHere()) setIntent(old => old?.idempotencyKey === value.idempotencyKey ? null : old);
  };
  useEffect(() => {
    if (!intent || intent.userId !== userId || inFlight.current) return;
    if (withdrawals.some(value => value.idempotencyKey === intent.idempotencyKey)) {
      void clear(intent).catch(() => { if (stillHere()) setStorageError(true); });
    }
    // Reading the server history resolves responses lost on this device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawals, intent, userId]);

  const activeIntent = intent?.userId === userId ? intent : null;
  const available = Number(summary?.account.withdrawableBalance ?? 0);
  const canSubmit = Boolean(isActive && userId && readyFor === userId && !storageError && !busy &&
    (activeIntent || (summary?.withdrawal?.enabled && !summary.withdrawal.blocked && available >= 1)));

  const submit = async (count: number, destination: string, restored: WalletWithdrawalIntent | null) => {
    if (!userId || !stillHere() || !current.current.isActive || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    let stored: WalletWithdrawalIntent | undefined;
    try {
      try {
        stored = restored ?? await prepareWalletWithdrawalIntent(userId, count, destination);
      } catch {
        if (stillHere()) setStorageError(true);
        return; // No POST unless the idempotency key was persisted successfully.
      }
      if (!stillHere() || !current.current.isActive) return;
      setIntent(stored);
      const result = await request({ tokens: stored.tokens, phone: stored.phone, idempotencyKey: stored.idempotencyKey }).unwrap();
      try { await clear(stored); } catch { if (stillHere()) setStorageError(true); }
      if (stillHere() && current.current.isActive) { setTokens(''); present(result); }
    } catch (error) {
      // Clear only a backend-proven rollback BEFORE submission. All ambiguous
      // errors retain the same amount, destination and key, including app restart.
      if (stored && (error as { data?: { code?: string } })?.data?.code === 'WALLET_WITHDRAWAL_NOT_RESERVED') {
        try { await clear(stored); } catch { if (stillHere()) setStorageError(true); }
      }
      if (stillHere() && current.current.isActive) showDialog({
        variant: 'info', title: 'Retrait à vérifier',
        message: getApiErrorMessage(error, 'La réponse est inconnue. Vérifiez cette même demande ; ne créez pas un second retrait.'),
      });
    } finally {
      inFlight.current = false;
      if (stillHere()) setBusy(false);
    }
  };

  const confirm = () => {
    if (!canSubmit || inFlight.current) return;
    const count = activeIntent?.tokens ?? Number(tokens.replace(',', '.'));
    const destination = activeIntent?.phone ?? normalizePayoutPhone(phone);
    if (!destination || !Number.isFinite(count) || count < 1 || Math.round(count * 100) / 100 !== count || (!activeIntent && count > available)) {
      showDialog({ variant: 'warning', title: 'Vérifiez le retrait', message: 'Saisissez au moins 1 jeton, sans dépasser le solde retirable, et un numéro Mobile Money valide.' });
      return;
    }
    let consumed = false;
    showDialog({
      variant: 'info', title: activeIntent ? 'Vérifier la même demande' : 'Confirmer le retrait',
      message: activeIntent
        ? `Vérifier la demande de ${count} jetons vers ${destination}, sans lancer un second versement.`
        : `${count} jetons achetés seront convertis en ${(Math.round(count * Number(summary?.withdrawal?.moneyPerToken ?? 0) * 100) / 100).toLocaleString('fr-FR')} ${summary?.withdrawal?.currency} et envoyés vers ${destination}. Votre KYC doit être validé. Les jetons de fidélité ne sont pas retirables.`,
      actions: [{ label: 'Annuler', variant: 'ghost' }, { label: activeIntent ? 'Vérifier' : 'Confirmer', variant: 'primary', onPress: () => {
        if (consumed) return;
        consumed = true;
        return submit(count, destination, activeIntent);
      } }],
    });
  };

  const checkStatus = async (value: WalletWithdrawal) => {
    if (inFlight.current || !stillHere() || !current.current.isActive) return;
    inFlight.current = true; setBusy(true);
    try { const result = await check(value.id).unwrap(); if (stillHere() && current.current.isActive) present(result); }
    catch { if (stillHere() && current.current.isActive) showDialog({ variant: 'info', title: 'Vérification indisponible', message: 'Le retrait n’a pas été relancé. Vérifiez à nouveau plus tard.' }); }
    finally { inFlight.current = false; if (stillHere()) setBusy(false); }
  };

  return { tokens: activeIntent ? String(activeIntent.tokens) : tokens, phone: activeIntent?.phone ?? phone,
    setTokens, setPhone, activeIntent, canSubmit, busy, storageError, withdrawals, historyError, confirm, checkStatus };
}
