const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const policy = loader()('features/request-detail/requestResponseWindow.ts');
const sample = (phase = 'driver', duration = 40000) => ({ phase,
  serverNow: new Date(1800000000000).toISOString(), expiresAt: new Date(1800000000000 + duration).toISOString() });

test('remaining time uses the server duration and subtracts request latency', () => {
  assert.equal(policy.requestResponseDeadline(sample(), 1000), 41000);
  assert.equal(policy.requestResponseDeadline(sample(), undefined), null);
  assert.equal(policy.requestResponseDeadline({ ...sample(), expiresAt: 'invalid' }, 1000), null);
  assert.equal(policy.requestResponseDeadline(sample('driver', -1000), 1000), 1000);
});
test('copy distinguishes driver silence, passenger decision and acceptance processing', () => {
  assert.match(policy.requestResponseLabel('driver', 12), /12 s/);
  assert.match(policy.requestResponseLabel('passenger', 90), /passager.*90 s/);
  assert.match(policy.requestResponseLabel('passenger', 90, true), /Choisissez/);
  assert.match(policy.requestResponseLabel('driver', 0), /plus disponible/);
  assert.match(policy.requestResponseLabel('passenger', 0, true), /expiré/);
  assert.match(policy.requestResponseLabel('accepting', 0), /Confirmation/);
});
function setup(t) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  let now = 1000; t.mock.method(Date, 'now', () => now);
  let calls = 0;
  const refetch = async () => { calls++; };
  const { useRequestResponseWindow } = loader({ react: hooks.react,
    '@/features/request-detail/requestResponseWindow': policy,
  })('hooks/request-detail/useRequestResponseWindow.ts');
  return { render: (request, active = true, started = 1000) => hooks.render(() => useRequestResponseWindow(request, started, active, refetch)),
    advance: ms => { now += ms; t.mock.timers.tick(ms); }, calls: () => calls };
}
test('expiry disables responding and refreshes only once even after a failed or stale read', t => {
  const env = setup(t), request = { id: 'one', responseWindow: sample() };
  assert.equal(env.render(request).closed, false);
  env.advance(40001);
  assert.equal(env.render(request).closed, true);
  env.render(request); env.render(request);
  assert.equal(env.calls(), 1);
});
test('a refetch start with old response data cannot extend its deadline', t => {
  const env = setup(t), request = { id: 'one', responseWindow: sample() };
  env.render(request); env.advance(39000);
  assert.match(env.render(request, true, 40000).label, /1 s/);
  env.advance(1001); assert.equal(env.render(request, true, 40000).closed, true);
});
test('background does not refetch; returning reconciles elapsed time once', t => {
  const env = setup(t), request = { id: 'one', responseWindow: sample() };
  env.render(request); env.render(request, false); env.advance(45000);
  env.render(request, false); assert.equal(env.calls(), 0);
  assert.equal(env.render(request, true).blocked, true); assert.equal(env.calls(), 1);
});
test('passenger and acceptance phases block direct acceptance, while old server responses still work', t => {
  const env = setup(t);
  const passenger = env.render({ id: 'one', responseWindow: sample('passenger', 120000) });
  assert.equal(passenger.blocked, true); assert.equal(passenger.closed, false);
  assert.equal(env.render({ id: 'one', responseWindow: sample('accepting', 120000) }).closed, true);
  assert.equal(env.render({ id: 'one' }).closed, false);
});
test('malformed timing blocks actions and triggers one reconciliation', t => {
  const env = setup(t), request = { id: 'one', responseWindow: { ...sample(), serverNow: 'invalid' } };
  assert.equal(env.render(request).closed, true); env.render(request);
  assert.equal(env.calls(), 1);
});
