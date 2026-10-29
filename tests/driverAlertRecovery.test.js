const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const model = loader()('features/notifications/driverAlertRecovery.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = 100000, iso = ms => new Date(ms).toISOString();
const row = (type = 'new_booking', patch = {}) => ({ id: id(10), userId: id(1), createdAt: iso(now - 10000), isRead: false,
  data: { type, driverId: id(1), passengerId: id(2), bookingId: id(3), tripRequestId: id(4),
    ...(type !== 'new_booking' ? { ringAlert: 'nearby-request-v1', alertExpiresAt: iso(now + 20000) } : {}),
    ...(type === 'driver_dispatch_offer' ? { offerId: id(5), expiresAt: iso(now + 20000) } : {}), ...patch } });
const booking = () => ({ id: id(3), status: 'pending', passengerId: id(2), trip: { driverId: id(1), status: 'upcoming' } });
const request = () => ({ id: id(4), passenger: { id: id(2) }, status: 'pending', selectedDriver: null, tripId: null });
const offer = () => ({ id: id(5), requestId: id(4), driverId: id(1), status: 'pending', actionable: true,
  expiresAt: iso(now + 15000), serverNow: iso(now) });
const candidate = (type = 'new_booking', patch) => model.driverRecoveryCandidates([row(type, patch)], id(1), now)[0];
const tick = () => new Promise(resolve => setImmediate(resolve));

test('REST reconstructs booking, dispatch and nearby protocols from the original server time', () => {
  for (const type of ['new_booking', 'driver_dispatch_offer', 'trip_request_nearby']) {
    const value = candidate(type);
    assert.ok(value); assert.equal(value.recipientId, id(1));
    assert.equal(Date.parse(value.data.ringUntil), now + (type === 'new_booking' ? 50000 : 20000));
  }
  const value = candidate('new_booking', { ringUntil: iso(now + 5000), nativeSoundStartedAt: iso(now), nativeSoundUntil: iso(now + 60000) });
  assert.equal(value.data.ringUntil, iso(now + 5000)); assert.equal(value.data.nativeSoundUntil, undefined);
  assert.equal(model.driverRecoveryCandidates([{ ...row(), isRead: true }], id(1), now).length, 1,
    'viewing an inbox entry is not accepting/refusing a booking');
});

test('recovery rejects stale, malformed, foreign, self and unrelated notifications', () => {
  const invalid = [null, [], { ...row(), userId: id(9) }, { ...row(), isActive: false },
    { ...row(), createdAt: iso(now - 60000) }, { ...row(), createdAt: iso(now + 6000) }, { ...row(), createdAt: 'bad' },
    row('new_booking', { driverId: id(9) }), row('new_booking', { passengerId: id(1) }),
    row('new_booking', { bookingId: '../x' }), row('new_booking', { actionProtocol: 'future' }),
    row('new_booking', { ringUntil: iso(now - 1) }), row('new_booking', { expiresAt: 'invalid' }),
    row('booking_response'), row('app_update'), row('trip_request_nearby', { ringAlert: 'invalid' }),
    row('driver_dispatch_offer', { expiresAt: undefined })];
  for (const item of invalid) assert.deepEqual(model.driverRecoveryCandidates([item], id(1), now), []);
  assert.deepEqual(model.driverRecoveryCandidates([row()], '../bad', now), []);
});

test('inbox scan, duplicate identities and detail fan-out are bounded', () => {
  assert.equal(model.driverRecoveryCandidates(Array(25).fill(row()), id(1), now).length, 1);
  assert.equal(model.driverRecoveryCandidates(Array.from({ length: 25 }, (_, i) => row('new_booking', { bookingId: id(100 + i) })), id(1), now).length, 3);
  assert.deepEqual(model.driverRecoveryCandidates([...Array(25).fill(null), row()], id(1), now), []);
});

test('booking recovery requires the right pending booking, passenger and still-live driver trip', () => {
  const alert = candidate(); assert.ok(model.validateRecoveredDriverAlert(alert, booking(), now));
  for (const status of ['accepted', 'rejected', 'cancelled', 'completed', 'expired'])
    assert.equal(model.validateRecoveredDriverAlert(alert, { ...booking(), status }, now), null);
  for (const patch of [{ id: id(9) }, { passengerId: id(1) }, { passengerId: null }, { trip: null },
    { trip: { driverId: id(9), status: 'upcoming' } }, { trip: { driverId: id(1), status: 'completed' } }])
    assert.equal(model.validateRecoveredDriverAlert(alert, { ...booking(), ...patch }, now), null);
  assert.equal(model.validateRecoveredDriverAlert(alert, booking(), now + 60000), null);
});

test('sequential nearby recovery validates its offer, not just visibility of the request', () => {
  for (const type of ['trip_request_nearby', 'driver_dispatch_offer']) {
    const alert = candidate(type, { offerId: id(5) });
    assert.equal(model.driverRecoveryDetailUrl(alert), `/driver-dispatch/offers/${id(5)}`);
    const value = model.validateRecoveredDriverAlert(alert, offer(), now);
    assert.equal(value.expiresAt, iso(now + 15000));
    assert.equal(value.data.ringUntil, iso(now + 15000));
    for (const patch of [{ status: 'accepted' }, { actionable: false }, { driverId: id(9) }, { id: id(6) },
      { requestId: id(9) }, { expiresAt: iso(now) }, { serverNow: 'bad' }, { serverNow: iso(now + 20000) }])
      assert.equal(model.validateRecoveredDriverAlert(alert, { ...offer(), ...patch }, now), null);
  }
  assert.equal(model.driverRecoveryDetailUrl(candidate('trip_request_nearby', { offerId: '../invalid' })), undefined);
});

test('non-sequential request must remain unassigned, non-self and available to that driver', () => {
  const alert = candidate('trip_request_nearby');
  assert.equal(model.driverRecoveryDetailUrl(alert), `/trip-requests/${id(4)}`);
  assert.ok(model.validateRecoveredDriverAlert(alert, request(), now));
  for (const patch of [{ status: 'driver_selected' }, { status: 'cancelled' }, { status: 'expired' }, { id: id(9) },
    { selectedDriver: { id: id(9) } }, { tripId: id(9) }, { passenger: { id: id(1) } }, { passenger: null },
    { targetDriverId: id(9) }, { targetDriverDeclined: true }, { responseWindow: { phase: 'passenger' } },
    { responseWindow: { phase: 'accepting' } }])
    assert.equal(model.validateRecoveredDriverAlert(alert, { ...request(), ...patch }, now), null);
});

function apiFixture(t) {
  t.mock.timers.enable({ apis: ['Date'], now });
  const io = { version: 0, calls: [], rows: [row()], detail: booking(), handler: null };
  const api = createApi({ reducerPath: 'recovery', baseQuery: async args => {
    io.calls.push(args);
    return io.handler ? io.handler(args) : { data: args.url === '/notifications' ? { notifications: io.rows } : io.detail };
  }, endpoints: () => ({}) });
  const load = loader({ './baseApi': { baseApi: api }, '@/services/tokenSession': { getTokenSessionVersion: () => io.version } });
  const actual = load('store/api/driverAlertRecoveryApi.ts').driverAlertRecoveryApi;
  const store = configureStore({ reducer: { recovery: api.reducer, auth: () => ({ user: { id: id(1) } }) },
    middleware: defaults => defaults().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  return { io, store, actual, start: () => store.dispatch(actual.endpoints.readDriverAlertRecovery.initiate({ userId: id(1), session: 0 })) };
}

test('installed RTK performs fresh GETs only, and a second read never replays a cached pending booking', async t => {
  const f = apiFixture(t), read = f.start();
  const first = await read.unwrap(); read.reset();
  assert.equal(first.alerts.length, 1); assert.equal(first.retry, false);
  assert.deepEqual(f.io.calls.map(call => call.url), ['/notifications', `/bookings/${id(3)}`]);
  assert.deepEqual(f.io.calls[0].params, { limit: 25, offset: 0 });
  assert(f.io.calls.every(call => !call.method && call.timeout === 3500));
  f.io.detail = { ...booking(), status: 'rejected' };
  const second = f.start(); assert.deepEqual((await second.unwrap()).alerts, []); second.reset();
  assert.equal(f.io.calls.length, 4);
});

test('one detail failure does not hide another fresh alert; inaccessible offers are not retried', async t => {
  const f = apiFixture(t); f.io.rows = [row(), row('trip_request_nearby')];
  f.io.handler = async args => args.url === '/notifications' ? { data: { notifications: f.io.rows } } :
    args.url.startsWith('/bookings') ? { error: { status: 503 } } : { data: request() };
  const read = f.start(), result = await read.unwrap(); read.reset();
  assert.equal(result.alerts.length, 1); assert.equal(result.alerts[0].kind, 'nearby'); assert.equal(result.retry, true);
  f.io.handler = async args => args.url === '/notifications' ? { data: { notifications: f.io.rows } } : { error: { status: 404 } };
  const retry = f.start(); assert.deepEqual(await retry.unwrap(), { alerts: [], retry: false }); retry.reset();
});

test('session changes during inbox loading cannot trigger detail GETs or restore the old account', async t => {
  const f = apiFixture(t); let finish;
  f.io.handler = () => new Promise(resolve => { finish = resolve; });
  const read = f.start(); await tick(); f.io.version++;
  finish({ data: { notifications: [row()] } });
  await assert.rejects(read.unwrap()); read.reset(); assert.equal(f.io.calls.length, 1);
});

test('an offer expiring while its detail is loading never becomes a recovered alert', async t => {
  const f = apiFixture(t); f.io.rows = [row('driver_dispatch_offer')]; let finish;
  f.io.handler = args => args.url === '/notifications' ? { data: { notifications: f.io.rows } } :
    new Promise(resolve => { finish = resolve; });
  const read = f.start(); await tick();
  t.mock.timers.tick(21000); finish({ data: offer() });
  assert.deepEqual(await read.unwrap(), { alerts: [], retry: false }); read.reset();
});

test('a wrong account or malformed inbox cannot authorize sound', async t => {
  const f = apiFixture(t);
  const foreign = f.store.dispatch(f.actual.endpoints.readDriverAlertRecovery.initiate({ userId: id(9), session: 0 }));
  await assert.rejects(foreign.unwrap()); foreign.reset(); assert.equal(f.io.calls.length, 0);
  f.io.handler = async () => ({ data: { notifications: 'bad' } });
  const read = f.start(); await assert.rejects(read.unwrap()); read.reset(); assert.equal(f.io.calls.length, 1);
});

test('private recovery service releases RTK data and aborts only its own pending read', async t => {
  const f = apiFixture(t), controller = new AbortController(); let finish;
  f.io.handler = () => new Promise(resolve => { finish = resolve; });
  const service = loader({ '@/store': { store: f.store }, '@/store/api/driverAlertRecoveryApi': { driverAlertRecoveryApi: f.actual } })('services/driverAlertRecovery.ts');
  const work = service.readDriverAlertRecovery(id(1), controller.signal); await tick();
  const rejected = assert.rejects(work); controller.abort(); await rejected;
  finish({ data: { notifications: [row()] } }); await tick();
  assert.equal(f.io.calls.length, 1); assert.deepEqual(f.store.getState().recovery.mutations, {});
});

test('a pre-aborted recovery never issues an authenticated request', async t => {
  const f = apiFixture(t), controller = new AbortController(); controller.abort();
  const service = loader({ '@/store': { store: f.store }, '@/store/api/driverAlertRecoveryApi': { driverAlertRecoveryApi: f.actual } })('services/driverAlertRecovery.ts');
  await assert.rejects(service.readDriverAlertRecovery(id(1), controller.signal));
  assert.equal(f.io.calls.length, 0);
});
