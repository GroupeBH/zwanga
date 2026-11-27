const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { requestDriverWaitDeadline: deadline, REQUEST_DRIVER_WAIT_MS: delay } = loader()('features/request-detail/requestDriverWait.ts');
const selectedAt = '2026-11-25T10:00:00.000Z', start = Date.parse(selectedAt);
const request = { id: 'order', passengerId: 'passenger', status: 'driver_selected', selectedAt,
  selectedDriverId: 'driver', tripId: 'trip', immediateDispatch: true,
  createdAt: '2026-11-25T08:00:00.000Z', departureDateMax: '2026-11-25T10:30:00.000Z' };
const trip = { id: 'trip', driverId: 'driver', status: 'upcoming' };
const booking = { id: 'booking', passengerId: 'passenger', tripId: 'trip', status: 'accepted' };

test('immediate-order advice starts 15 minutes after selection, not creation or the search expiry', () => {
  assert.equal(delay, 15 * 60_000);
  assert.equal(deadline(request, 'passenger', booking, trip), start + delay);
  assert.equal(deadline({ ...request, departureDateMax: '2026-11-25T11:00:00Z' }, 'passenger', booking, trip), start + delay);
  assert.equal(deadline({ ...request, selectedAt: '2026-11-25T10:20:00Z', selectedDriverId: 'next' }, 'passenger', booking,
    { ...trip, driverId: 'next' }), start + 20 * 60_000 + delay);
});

test('a driver already on the way remains changeable before boarding; the clock does not expire that trip', () => {
  assert.equal(deadline(request, 'passenger', booking, { ...trip, status: 'ongoing', departureTime: '2000-01-01T00:00:00Z' }), start + delay);
});

for (const patch of [{ immediateDispatch: false }, { immediateDispatch: undefined }, { selectedAt: null },
  { selectedAt: 'invalid' }, { selectedDriverId: null }, { status: 'pending' }, { status: 'offers_received' },
  { status: 'cancelled' }, { status: 'expired' }, { tripId: 'other' }]) {
  test(`no wait suggestion for request ${JSON.stringify(patch)}`, () => {
    assert.equal(deadline({ ...request, ...patch }, 'passenger', booking, trip), null);
  });
}

for (const patch of [{ pickedUp: true }, { pickedUpAt: selectedAt }, { pickedUpConfirmedByPassenger: true },
  { pickedUpConfirmedAt: selectedAt }, { droppedOff: true }, { droppedOffConfirmedByPassenger: true },
  { status: 'cancelled' }, { status: 'rejected' }, { paymentStatus: 'initiated' }, { paymentStatus: 'succeeded' },
  { cashReceivedAmount: 500 }, { paidAt: selectedAt }, { passengerId: 'other' }]) {
  test(`no wait suggestion after boarding/payment/closed booking ${JSON.stringify(patch)}`, () => {
    assert.equal(deadline(request, 'passenger', { ...booking, ...patch }, trip), null);
  });
}

test('foreign accounts, missing linked data and closed/mismatched trips cannot receive the suggestion', () => {
  for (const userId of ['driver', 'other', undefined]) assert.equal(deadline(request, userId, booking, trip), null);
  assert.equal(deadline(request, 'passenger', undefined, trip), null);
  assert.equal(deadline(request, 'passenger', booking, undefined), null);
  for (const patch of [{ status: 'cancelled' }, { status: 'completed' }, { driverId: 'other' }, { id: 'other' }]) {
    assert.equal(deadline(request, 'passenger', booking, { ...trip, ...patch }), null);
  }
});

function clockFixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: start });
  const hooks = hookHarness(); let ticks = 0;
  t.after(() => hooks.unmount());
  const { useRequestDriverWait } = loader({ react: { ...hooks.react, useState: initial => {
    const [value, set] = hooks.react.useState(initial);
    return [value, next => { ticks++; set(next); }];
  } } })('hooks/request-detail/useRequestDriverWait.ts');
  return { hooks, ticks: () => ticks,
    render: (at = start + delay, active = true) => hooks.render(() => useRequestDriverWait(at, active)) };
}

test('a single wake-up makes the suggestion visible exactly at 15 minutes, not before; it stays at 20 minutes', t => {
  const f = clockFixture(t);
  assert.equal(f.render(), false);
  t.mock.timers.tick(delay - 1); assert.equal(f.render(), false); assert.equal(f.ticks(), 0);
  t.mock.timers.tick(1); assert.equal(f.render(), true); assert.equal(f.ticks(), 1);
  t.mock.timers.tick(5 * 60_000); assert.equal(f.render(), true); assert.equal(f.ticks(), 1);
});

test('background/offline/unfocused screens stop the timer and catch up immediately on return', t => {
  const f = clockFixture(t); f.render();
  t.mock.timers.tick(2 * 60_000);
  assert.equal(f.render(start + delay, false), false);
  t.mock.timers.tick(20 * 60_000); assert.equal(f.ticks(), 0);
  assert.equal(f.render(), true); assert.equal(f.ticks(), 0);
});

test('a new selection resets the delay; boarding removes advice and cleans up the pending timer', t => {
  const f = clockFixture(t); f.render();
  t.mock.timers.tick(10 * 60_000);
  const next = Date.now() + delay;
  assert.equal(f.render(next), false);
  t.mock.timers.tick(5 * 60_000); assert.equal(f.render(next), false); assert.equal(f.ticks(), 0);
  assert.equal(f.render(null), false);
  t.mock.timers.tick(delay); assert.equal(f.ticks(), 0);
});

test('unmount stops the pending timer', t => {
  const f = clockFixture(t); f.render(); f.hooks.unmount();
  t.mock.timers.tick(delay); assert.equal(f.ticks(), 0);
});

test('a past deadline is visible immediately on first entry, with no persisted flag from another driver', t => {
  const f = clockFixture(t);
  assert.equal(f.render(start - 1), true);
  assert.equal(f.ticks(), 0);
});
