const test = require('node:test');
const assert = require('node:assert/strict');
const { observeLiveRide } = require('../scripts/audits/observe-live-ride.cjs');
const payload = { ringUntil: new Date(60000).toISOString(), alertExpiresAt: new Date(25000).toISOString() };

test('live observations preserve false results instead of masking a native failure', async () => {
  assert.equal(await observeLiveRide(payload, () => false, () => 24000), false);
});

test('a slow audit observation fails distinctly when it crosses the alert deadline', async () => {
  let now = 8000;
  await assert.rejects(observeLiveRide(payload, async () => {
    now = 26000;
    return false;
  }, () => now), { code: 'RIDE_AUDIT_WINDOW_EXPIRED' });
  assert.equal(Date.parse(payload.alertExpiresAt), 25000, 'the guard never extends a lease');
});

test('no observation starts at or after either expiry boundary', async () => {
  for (const value of [payload, { ...payload, ringUntil: new Date(20000).toISOString() }]) {
    const deadline = Math.min(Date.parse(value.ringUntil), Date.parse(value.alertExpiresAt));
    for (const time of [deadline, deadline + 1]) {
      await assert.rejects(observeLiveRide(value, () => assert.fail('must not observe'), () => time),
        { code: 'RIDE_AUDIT_WINDOW_EXPIRED' });
    }
  }
});

test('invalid synthetic deadlines and emulator clocks fail closed', async () => {
  await assert.rejects(observeLiveRide({ ...payload, alertExpiresAt: 'invalid' }, () => true), /deadline/);
  await assert.rejects(observeLiveRide(payload, () => true, () => NaN), /clock/);
});

test('native probe errors are not swallowed or retried as timing failures', async () => {
  const error = Error('probe failure');
  await assert.rejects(observeLiveRide(payload, async () => { throw error; }, () => 8000),
    failure => failure === error);
});
