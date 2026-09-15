import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from '@/components/ui/DialogProvider';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { useLazyCheckDriverPayoutStatusQuery, useRequestDriverPayoutMutation } from '@/store/api/driverSettlementsApi';
import type { DriverPayout, DriverSettlementSummary } from '@/types';
import {
  clearDriverPayoutIntent, prepareDriverPayoutIntent, readDriverPayoutIntent,
  type DriverPayoutIntent,
} from '@/services/driverPayoutIntent';
import {
  formatAmount, getPayoutErrorMessage, getPayoutMessage, isPayoutOutcomeUncertain,
  isPayoutPending, maskPhone, normalizePayoutPhone,
} from '@/features/driver-earnings/payoutModel';

type Params = {
  summary?: DriverSettlementSummary;
  payouts: DriverPayout[];
  refresh: () => Promise<unknown>;
};

export function useDriverPayout({ summary, payouts, refresh }: Params) {
  const userId = useAppSelector(selectUser)?.id;
  const { showDialog } = useDialog();
  const [requestPayout] = useRequestDriverPayoutMutation();
  const [checkPayoutStatus] = useLazyCheckDriverPayoutStatusQuery();
  const [intent, setIntent] = useState<DriverPayoutIntent | null>(null);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const account = useRef(userId);
  account.current = userId;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setReadyFor(null);
    setIntent(null);
    setStorageError(false);
    if (userId) {
      void readDriverPayoutIntent(userId).then((stored) => {
        if (active) { setIntent(stored); setReadyFor(userId); }
      }).catch(() => { if (active) setStorageError(true); });
    }
    return () => { active = false; };
  }, [userId]);

  const clearIntent = useCallback(async (stored: DriverPayoutIntent) => {
    await clearDriverPayoutIntent(stored);
    if (mounted.current && account.current === stored.userId) {
      setIntent((current) => current?.idempotencyKey === stored.idempotencyKey ? null : current);
    }
  }, []);

  // A response lost on the phone may already be visible in the server history.
  useEffect(() => {
    if (!intent || intent.userId !== userId || inFlight.current) return;
    if (payouts.some((payout) => payout.idempotencyKey === intent.idempotencyKey)) {
      void clearIntent(intent).catch(() => {
        if (mounted.current && account.current === intent.userId) setStorageError(true);
      });
    }
  }, [intent, payouts, userId, clearIntent]);

  const present = (payout: DriverPayout) => {
    const pending = isPayoutPending(payout);
    const reference = payout.reference ?? payout.orderNumber ?? payout.id;
    showDialog({
      variant: payout.status === 'succeeded' ? 'success' : pending ? 'info' : 'warning',
      title: payout.status === 'succeeded' ? 'Gains versés' : pending ? 'Versement en cours' : 'Versement non effectué',
      message: `${formatAmount(payout.amount, payout.currency)} · ${maskPhone(payout.phone)}\n${getPayoutMessage(payout)}\nRéférence : ${reference}`,
    });
  };

  const submit = async (amount: number, phone: string, restored?: DriverPayoutIntent) => {
    if (!userId || !mounted.current || inFlight.current || account.current !== userId) return;
    inFlight.current = true;
    setBusy(true);
    let stored: DriverPayoutIntent | undefined;
    const stillHere = () => mounted.current && account.current === userId;
    try {
      try {
        stored = restored ?? await prepareDriverPayoutIntent(userId, amount, phone);
        if (!stillHere()) return;
        setIntent(stored);
      } catch {
        if (stillHere()) {
          setStorageError(true);
          showDialog({ variant: 'warning', title: 'Versement non lancé', message: 'Impossible de sécuriser la demande sur ce téléphone. Contactez l’assistance avant de réessayer.' });
        }
        return;
      }
      const payout = await requestPayout({ amount: stored.amount, phone: stored.phone, idempotencyKey: stored.idempotencyKey }).unwrap();
      try { await clearIntent(stored); } catch { if (stillHere()) setStorageError(true); }
      if (!stillHere()) return;
      present(payout);
      await refresh();
    } catch (error) {
      // Known 4xx rejections can be retried as a new intention. Lost responses cannot.
      if (stored && !restored && !isPayoutOutcomeUncertain(error)) {
        try { await clearIntent(stored); } catch { if (stillHere()) setStorageError(true); }
      }
      if (stillHere()) {
        showDialog({
          variant: isPayoutOutcomeUncertain(error) ? 'info' : 'warning',
          title: isPayoutOutcomeUncertain(error) ? 'Confirmation à vérifier' : 'Versement indisponible',
          message: getPayoutErrorMessage(error),
        });
        await refresh();
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const activeIntent = intent?.userId === userId ? intent : null;
  const available = Number(summary?.availableBalance ?? 0);
  const minimum = Number(summary?.minimumPayoutAmount ?? 1);
  const canSubmit = Boolean(userId && readyFor === userId && !storageError && !busy &&
    (activeIntent || (summary && Number.isFinite(available) && available >= minimum)));

  const handlePayout = (amount = available) => {
    if (!canSubmit) return;
    const phone = activeIntent?.phone ?? normalizePayoutPhone(summary?.payoutPhone);
    if (!phone) {
      showDialog({ variant: 'warning', title: 'Numéro Mobile Money à vérifier', message: 'Ajoutez un numéro valide dans votre profil (par exemple 0891234567). Il doit posséder un compte Mobile Money actif.' });
      return;
    }
    if (!activeIntent && !summary?.kycApproved) {
      showDialog({ variant: 'warning', title: 'Vérification d’identité requise', message: 'Votre identité doit être vérifiée avant le versement de vos gains.' });
      return;
    }
    if (!activeIntent && (!Number.isFinite(amount) || amount < minimum || amount > available)) {
      showDialog({ variant: 'warning', title: 'Montant indisponible', message: `Le minimum est de ${formatAmount(minimum, summary?.currency)}. Actualisez vos revenus pour vérifier le solde disponible.` });
      return;
    }
    let consumed = false;
    showDialog({
      variant: 'info', icon: 'phone-portrait-outline',
      title: activeIntent ? 'Vérifier le versement demandé' : 'Recevoir mes gains',
      message: activeIntent
        ? `Vérifier la même demande de ${formatAmount(activeIntent.amount, summary?.currency)} vers ${maskPhone(phone)}, sans créer un second versement.`
        : `Zwanga vous enverra ${formatAmount(amount, summary?.currency)} depuis son compte marchand vers ${maskPhone(phone)}. Aucun paiement ni compte FlexPay ne vous est demandé.`,
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        { label: activeIntent ? 'Vérifier cette demande' : 'Demander le versement', variant: 'primary', onPress: () => {
          if (consumed) return;
          consumed = true;
          return submit(activeIntent?.amount ?? amount, phone, activeIntent ?? undefined);
        } },
      ],
    });
  };

  const checkPayout = async (payout: DriverPayout) => {
    if (!userId || inFlight.current) return;
    if (!payout.orderNumber) { present(payout); return; }
    inFlight.current = true;
    setBusy(true);
    try {
      const checked = await checkPayoutStatus(payout.orderNumber, false).unwrap();
      if (mounted.current && account.current === userId) { present(checked); await refresh(); }
    } catch {
      if (mounted.current && account.current === userId) showDialog({ variant: 'info', title: 'Vérification indisponible', message: 'Impossible de confirmer le résultat pour le moment. Le versement n’a pas été relancé ; vérifiez à nouveau plus tard.' });
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };

  return { canSubmit, busy, handlePayout, checkPayout, storageError, hasUnconfirmedIntent: Boolean(activeIntent) };
}
