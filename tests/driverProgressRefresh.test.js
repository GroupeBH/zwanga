const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { createDriverProgressRefresh } = loader()('features/driver-navigation/progressRefresh.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const events = type => [{ type, tripId: 'trip', bookingId: 'booking' }];

test('proximity samples do not continuously refresh trip and bookings', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let reads = 0;
  const gate = createDriverProgressRefresh(async () => reads++);
  for (let i = 0; i < 100; i++) gate.receive(events('driver_near_pickup'));
  t.mock.timers.tick(60_000); await tick(); assert.equal(reads, 0);
  gate.receive(events('pickup_confirmed')); gate.receive(events('dropoff_confirmed'));
  t.mock.timers.tick(1000); await tick(); assert.equal(reads, 1);
  gate.dispose();
});

test('a business event during a pending refresh gets one trailing read; blur discards queued work', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let reads = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const gate = createDriverProgressRefresh(async () => { reads++; if (reads === 1) await pending; });
  gate.receive(events('pickup_confirmed')); t.mock.timers.tick(1000); await tick();
  for (let i = 0; i < 20; i++) gate.receive(events('dropoff_confirmed'));
  t.mock.timers.tick(10_000); await tick(); assert.equal(reads, 1);
  release(); await tick(); t.mock.timers.tick(1000); await tick(); assert.equal(reads, 2);
  gate.receive(events('driver_arrived_destination')); gate.dispose();
  t.mock.timers.tick(10_000); await tick(); assert.equal(reads, 2);
});

test('a failed REST read releases the refresh lock for the next event', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let reads = 0;
  const gate = createDriverProgressRefresh(async () => { reads++; throw new Error('offline'); });
  for (let i = 0; i < 2; i++) { gate.receive(events('pickup_confirmed')); t.mock.timers.tick(1000); await tick(); }
  assert.equal(reads, 2); gate.dispose();
});
