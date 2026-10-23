import type { StoredPaymentState } from './paymentTypes';
import { waitForPaymentStorage } from './paymentStorage';

export const SETTLED_PAYMENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Never age out an unresolved payment, a provider reference, or an unconfirmed cash receipt. */
export function prunePaymentState(state: StoredPaymentState, now = Date.now()): StoredPaymentState {
  const result: StoredPaymentState = {};
  for (const [id, value] of Object.entries(state)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const settled = Date.parse(value.settledAt ?? '');
    const acknowledged = Date.parse(value.acknowledgedAt ?? '');
    const pending = value.bookingPaymentOrderNumber || value.walletTopUpOrderNumber || value.walletTopUpIntent || value.mixedCashIntent || value.requiredActionAt;
    if (!pending && Number.isFinite(settled) && Number.isFinite(acknowledged) &&
        now - Math.max(settled, acknowledged) > SETTLED_PAYMENT_RETENTION_MS) continue;
    if (Object.keys(value).length) result[id] = value;
  }
  return result;
}

/** At most one active write and one latest snapshot, not one serialized history per update. */
export function createPaymentStateWriter(write: (state: StoredPaymentState) => Promise<unknown>,
  onResult: (ok: boolean) => void = () => {}) {
  let pending: StoredPaymentState | null = null;
  let running = false;
  let latest: StoredPaymentState | null = null;
  let observed = Promise.resolve(true);
  return (state: StoredPaymentState) => {
    if (running && latest === state) return observed;
    latest = state;
    pending = state;
    if (running) return observed;
    running = true;
    const task = (async () => {
      let ok = true;
      try {
        while (pending) {
          const next = pending;
          pending = null;
          try { await write(next); ok = true; }
          catch { ok = false; }
        }
        onResult(ok);
        return ok;
      } finally { running = false; }
    })();
    // Keep the raw writer locked after a timeout. A late older write cannot race a new snapshot.
    observed = waitForPaymentStorage(task).catch(() => { onResult(false); return false; });
    return observed;
  };
}
