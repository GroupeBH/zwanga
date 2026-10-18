import type { StoredPaymentState } from './paymentTypes';

export const SETTLED_PAYMENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Never age out an unresolved payment, a provider reference, or an unconfirmed cash receipt. */
export function prunePaymentState(state: StoredPaymentState, now = Date.now()): StoredPaymentState {
  const result: StoredPaymentState = {};
  for (const [id, value] of Object.entries(state)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const settled = Date.parse(value.settledAt ?? '');
    const acknowledged = Date.parse(value.acknowledgedAt ?? '');
    const pending = value.bookingPaymentOrderNumber || value.walletTopUpOrderNumber || value.requiredActionAt;
    if (!pending && Number.isFinite(settled) && Number.isFinite(acknowledged) &&
        now - Math.max(settled, acknowledged) > SETTLED_PAYMENT_RETENTION_MS) continue;
    if (Object.keys(value).length) result[id] = value;
  }
  return result;
}

/** At most one active write and one latest snapshot, not one serialized history per update. */
export function createPaymentStateWriter(write: (state: StoredPaymentState) => Promise<unknown>) {
  let pending: StoredPaymentState | null = null;
  let running = false;
  return (state: StoredPaymentState) => {
    pending = state;
    if (running) return;
    running = true;
    void (async () => {
      try {
        while (pending) {
          const next = pending;
          pending = null;
          try { await write(next); }
          catch { console.warn('[ArrivalPayment] Sauvegarde locale du paiement indisponible.'); }
        }
      } finally { running = false; }
    })();
  };
}
