/** Bound a registration attempt without letting late native results revive it. */
export const PUSH_REGISTRATION_TIMEOUT_MS = 30_000;

export function createPushRegistrationAttempt() {
  let active = true;
  let rejectWait: (error: Error) => void = () => {};
  const cancellations = new Set<() => void>();
  const interrupted = new Promise<never>((_, reject) => { rejectWait = reject; });
  // Cleanup may happen between awaits; a cancellation must never be unhandled.
  void interrupted.catch(() => {});
  const cancel = () => {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    rejectWait(new Error('PUSH_REGISTRATION_INTERRUPTED'));
    for (const abort of cancellations) { try { abort(); } catch { /* best effort */ } }
    cancellations.clear();
  };
  const timer = setTimeout(cancel, PUSH_REGISTRATION_TIMEOUT_MS);
  return {
    current: () => active,
    cancel,
    async wait<T>(start: () => Promise<T>, abort?: () => void): Promise<T> {
      if (!active) throw new Error('PUSH_REGISTRATION_INTERRUPTED');
      if (abort) cancellations.add(abort);
      try { return await Promise.race([start(), interrupted]); }
      finally { if (abort) cancellations.delete(abort); }
    },
    finish() { active = false; clearTimeout(timer); cancellations.clear(); },
  };
}
