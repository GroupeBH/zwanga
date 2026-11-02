/* Audit-only timing guard: a slow diagnostic must not look like a native failure. */
async function observeLiveRide(payload, observe, now = Date.now) {
  const limits = [payload.ringUntil, payload.alertExpiresAt].map(value => Date.parse(value));
  if (!limits.every(Number.isFinite)) throw Error('Invalid synthetic ride deadline');
  const deadline = Math.min(...limits);
  const check = () => {
    const time = now();
    if (!Number.isFinite(time)) throw Error('Invalid emulator clock');
    if (time >= deadline) {
      const error = Error('Audit observation exceeded the synthetic alert deadline; rerun without competing diagnostics.');
      error.code = 'RIDE_AUDIT_WINDOW_EXPIRED';
      throw error;
    }
  };
  check();
  const value = await observe();
  check();
  return value;
}
module.exports = { observeLiveRide };
