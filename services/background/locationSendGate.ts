/** One active ride, with a lease which cannot affect a replacement session. */
export function createLocationSendGate() {
  let state: { key: string; inFlight: boolean; lastSentAt: number; backoffUntil: number } | null = null;
  return {
    reset(key?: string | null) {
      if (!key || state?.key === key) state = null;
    },
    acquire(key: string, now: number, intervalMs: number) {
      if (state?.key !== key) state = { key, inFlight: false, lastSentAt: -Infinity, backoffUntil: 0 };
      const owned = state;
      if (owned.inFlight || now < owned.backoffUntil || now - owned.lastSentAt < intervalMs) return null;
      owned.inFlight = true;
      return {
        isCurrent: () => state === owned,
        record(at: number, backoffMs = 0) {
          if (state !== owned) return;
          owned.lastSentAt = at;
          owned.backoffUntil = backoffMs ? at + backoffMs : 0;
        },
        release() { if (state === owned) owned.inFlight = false; },
      };
    },
  };
}
