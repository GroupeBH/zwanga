const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100_000 });
  const load = loader();
  const delivery = load('services/locationDelivery.ts');
  const { sendConfirmedTrackingLocation } = load('services/trackingLocationDelivery.ts');
  const socket = new EventEmitter();
  let ack;
  socket.timeout = () => ({ emit: (_event, _payload, callback) => { ack = callback; } });
  const payload = { tripId: 'trip', coordinates: [15.3, -4.32], recordedAt: new Date().toISOString() };
  const echo = { ...payload, updatedAt: payload.recordedAt };
  return { ...delivery, socket, payload, echo, send: value => sendConfirmedTrackingLocation(socket, value), ack: value => ack(null, value) };
}

for (const role of ['driver', 'passenger']) {
  test(`${role}: the matching server echo confirms delivery without a gateway acknowledgement`, async t => {
    const env = fixture(t);
    const payload = role === 'driver' ? env.payload : { ...env.payload, bookingId: 'booking' };
    const key = role === 'driver' ? 'driver:trip' : 'passenger:booking';
    const pending = env.send(payload);
    assert.equal(env.isLocationDeliveryPending(key), true);
    env.ack(undefined);
    env.socket.emit(`${role}_location`, { ...env.echo, bookingId: payload.bookingId });
    await pending;
    assert.equal(env.isLocationDeliveryPending(key), false);
    assert.equal(env.wasLocationDeliveredRecently(key, 4000, 'rest'), true);
    assert.equal(env.socket.listenerCount(`${role}_location`), 0);
    assert.equal(env.socket.listenerCount('disconnect'), 0);
    t.mock.timers.tick(3000); // no late timeout or duplicate completion
  });
}

test('missing confirmations, stale snapshots and other bookings never masquerade as success', async t => {
  const env = fixture(t);
  const pending = env.send({ ...env.payload, bookingId: 'booking' });
  const rejection = assert.rejects(pending, /confirmation/);
  for (const echo of [null, env.echo, { ...env.echo, bookingId: 'other' },
    { ...env.echo, bookingId: 'booking', updatedAt: new Date(90_000).toISOString() },
    { ...env.echo, bookingId: 'booking', coordinates: [16, -4] }]) {
    env.socket.emit('passenger_location', echo);
  }
  env.ack(undefined);
  t.mock.timers.tick(2500);
  await rejection;
  assert.equal(env.wasLocationDeliveredRecently('passenger:booking', 6000, 'rest'), false);
  assert.equal(env.isLocationDeliveryPending('passenger:booking'), false);
  assert.equal(env.socket.eventNames().length, 0);
});

test('disconnects and negative acknowledgements release HTTP fallback immediately', async t => {
  const env = fixture(t);
  let rejection = assert.rejects(env.send(env.payload), /interrompu/);
  env.socket.emit('disconnect');
  await rejection;
  assert.equal(env.isLocationDeliveryPending('driver:trip'), false);
  rejection = assert.rejects(env.send(env.payload), /enregistrée/);
  env.ack({ ok: false });
  await rejection;
  assert.equal(env.wasLocationDeliveredRecently('driver:trip', 4000, 'rest'), false);
  assert.equal(env.socket.eventNames().length, 0);
});

test('positive acknowledgements and bounded pending leases remain compatible', async t => {
  const env = fixture(t);
  const pending = env.send(env.payload);
  env.ack({ success: true });
  await pending;
  assert.equal(env.wasLocationDeliveredRecently('driver:trip', 4000, 'rest'), true);
  const old = env.beginPendingLocationDelivery('driver:trip');
  env.beginPendingLocationDelivery('driver:trip');
  old();
  assert.equal(env.isLocationDeliveryPending('driver:trip'), true);
  t.mock.timers.tick(3000);
  assert.equal(env.isLocationDeliveryPending('driver:trip'), false);
  env.clearLocationDeliveries();
  assert.equal(env.wasLocationDeliveredRecently('driver:trip', 4000, 'rest'), false);
});

test('sub-metre coordinate serialization differences do not trigger a redundant HTTP upload', async t => {
  const env = fixture(t);
  const pending = env.send(env.payload);
  env.socket.emit('driver_location', { ...env.echo, coordinates: [15.30000001, -4.31999999] });
  await pending;
  assert.equal(env.wasLocationDeliveredRecently('driver:trip', 4000, 'rest'), true);
});
