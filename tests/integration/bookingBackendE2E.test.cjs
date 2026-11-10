const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi, fetchBaseQuery } = require('@reduxjs/toolkit/query');
const { loader } = require('../helpers/loadTypeScript.cjs');
const { startBookingBackend } = require('../helpers/bookingBackendFixture.cjs');
const load = loader();
const policy = load('features/trip-detail/bookingPriceProposal.ts');
const navigation = load('features/navigation/pendingBookingEntry.ts');
const card = load('features/notifications/driverNotificationCard.ts');
let backend;
const clients = [];
before(async () => { backend = await startBookingBackend(); }, { timeout: 180000 });
after(async () => {
  for (const { store, api } of clients) store.dispatch(api.util.resetApiState());
  await backend?.close();
});
afterEach(() => assert.equal(backend?.blockedConnections(), 0, 'No external connection attempted'));

// Uses the actual RTK endpoints, fetchBaseQuery, cache middleware and mobile mappers.
function mobile(actor) {
  const api = createApi({ reducerPath: 'bookingTest',
    baseQuery: fetchBaseQuery({ baseUrl: backend.baseUrl, prepareHeaders: headers => {
      headers.set('Authorization', 'Bearer ' + actor.token); return headers;
    } }), endpoints: () => ({}),
    tagTypes: ['Booking', 'Trip', 'Wallet', 'DriverSettlement', 'PaymentHistory', 'User', 'DriverPaymentNotice'],
  });
  const clientLoad = loader({ './baseApi': { baseApi: api } });
  clientLoad('store/api/bookingApi.ts');
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer },
    middleware: get => get({ serializableCheck: false, immutableCheck: false }).concat(api.middleware) });
  clients.push({ store, api });
  return { call: (name, arg) => store.dispatch(api.endpoints[name].initiate(arg,
    { subscribe: false, forceRefetch: true })).unwrap(), store, api };
}
async function raw(actor, path, method = 'GET', body) {
  const response = await fetch(backend.baseUrl + path, { method, redirect: 'error',
    signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json',
      ...(actor ? { Authorization: 'Bearer ' + actor.token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
async function create(f, proposedPricePerSeat = 2000, seats = 2) {
  const passenger = mobile(f.passenger), driver = mobile(f.driver);
  const booking = await passenger.call('createBooking', { tripId: f.trip.id,
    numberOfSeats: seats, paymentMode: 'cash',
    ...(proposedPricePerSeat == null ? {} : { proposedPricePerSeat }) });
  return { passenger, driver, booking };
}

test('mobile → HTTP → PostgreSQL → outbox → mobile routing → explicit consent → passenger fare', async () => {
  const f = await backend.fixture(), { passenger, driver, booking } = await create(f);
  assert.equal(booking.proposedPricePerSeat, 2000);
  assert.equal(booking.status, 'pending');
  assert.equal(policy.bookingPassengerTotal(booking, 3000), 4000);
  assert.equal((await backend.trip(f.trip.id)).availableSeats, 4);
  const [invitation] = await backend.notices(booking.id);
  assert.equal(invitation.userId, f.driver.id);
  assert.equal(invitation.data.type, 'new_booking');
  assert.equal(invitation.data.ridePricePerSeat, '2000');
  assert.equal(invitation.data.ridePriceKind, 'budget');
  assert.equal(card.driverNotificationActions('booking', invitation.data).at(-1).pressAction.id, 'default');
  const pending = await driver.call('getBookingById', booking.id);
  const destination = await navigation.verifyPendingBookingEntry({ id: booking.id, key: `booking:${booking.id}` },
    f.driver.id, async () => pending, () => { throw Error('Trip already included'); });
  assert.deepEqual(destination, { pathname: '/trip/[id]',
    params: { id: f.trip.id, bookingId: booking.id, section: 'passengers' } });
  const accepted = await driver.call('acceptBooking', policy.bookingAcceptanceArgument(pending));
  assert.equal(accepted.status, 'accepted');
  assert.equal(Number(accepted.grossPaymentAmount), 4000);
  // Real first-trip policy is applied to the negotiated fare, not the public fare.
  assert.equal(policy.bookingPassengerTotal(accepted, 3000), 1600);
  const mine = await passenger.call('getMyBookingsForTrip', f.trip.id);
  assert.equal(policy.bookingPassengerTotal(mine[0], 3000), 1600);
  assert.equal((await backend.trip(f.trip.id)).availableSeats, 2);
  assert.equal(Number((await backend.trip(f.trip.id)).pricePerSeat), 3000);
  const saved = await backend.booking(booking.id);
  assert.equal(saved.paidAt, null); assert.equal(saved.paymentTransactionId, null);
  assert.equal((await backend.notices(booking.id)).filter(n => n.data.type === 'booking_response').length, 1);
});

test('legacy/native acceptance cannot accept an unseen lower fare; exact acknowledgement succeeds', async () => {
  const f = await backend.fixture(), { driver, booking } = await create(f);
  for (const [route, body] of [['accept', {}], ['accept', { acceptedPricePerSeat: 1999 }],
    ['respond-invitation', { accept: true }], ['status', { status: 'accepted' }]]) {
    const r = await raw(f.driver, `/bookings/${booking.id}/${route}`, 'PUT', body);
    assert.equal(r.status, 409); assert.equal(r.body.code, 'BOOKING_PRICE_CONFIRMATION_REQUIRED');
  }
  assert.equal((await backend.booking(booking.id)).status, 'pending');
  assert.equal((await backend.notices(booking.id)).length, 1);
  await driver.call('acceptBooking', policy.bookingAcceptanceArgument(booking));
});

test('three concurrent acceptances and retry after lost response consume seats only once', async () => {
  const f = await backend.fixture(), { driver, booking } = await create(f);
  const arg = policy.bookingAcceptanceArgument(booking);
  const results = await Promise.all([1, 2, 3].map(() => driver.call('acceptBooking', arg)));
  assert.ok(results.every(b => b.status === 'accepted'));
  await driver.call('acceptBooking', arg); // simulate retry after committed response was lost
  assert.equal((await backend.trip(f.trip.id)).availableSeats, 2);
  assert.equal((await backend.notices(booking.id)).filter(n => n.data.type === 'booking_response').length, 1);
});

test('rejecting the proposed price releases the pending booking and permits a normal new reservation', async () => {
  const f = await backend.fixture(), { passenger, driver, booking } = await create(f);
  await driver.call('rejectBooking', { id: booking.id, reason: 'Prix refusé pendant essai local' });
  assert.equal((await backend.booking(booking.id)).status, 'rejected');
  assert.equal((await backend.trip(f.trip.id)).availableSeats, 4);
  const next = await passenger.call('createBooking', { tripId: f.trip.id, numberOfSeats: 1, paymentMode: 'cash' });
  assert.notEqual(next.id, booking.id); assert.equal(next.proposedPricePerSeat, null);
  const accepted = await driver.call('acceptBooking', next.id);
  assert.equal(Number(accepted.grossPaymentAmount), 3000);
  assert.equal(policy.bookingPassengerTotal(accepted), 1200);
});

test('unrelated driver cannot accept; passenger identity and total cannot be forged', async () => {
  const f = await backend.fixture(), { booking } = await create(f);
  assert.equal((await raw(f.stranger, `/bookings/${booking.id}/accept`, 'PUT', { acceptedPricePerSeat: 2000 })).status, 400);
  assert.equal((await raw(null, `/bookings/${booking.id}/accept`, 'PUT', {})).status, 401);
  const outsider = await backend.actor('passenger');
  for (const extra of [{ passengerId: f.passenger.id }, { paymentAmount: 1 }, { grossPaymentAmount: 1 }]) {
    assert.equal((await raw(outsider, '/bookings', 'POST', { tripId: f.trip.id,
      numberOfSeats: 1, proposedPricePerSeat: 2000, ...extra })).status, 400);
  }
  assert.equal((await backend.booking(booking.id)).status, 'pending');
});

test('invalid proposals fail through real DTO and business validation without an alert', async () => {
  const f = await backend.fixture(), start = (await backend.notifications()).length;
  for (const proposedPricePerSeat of [0, -1, 1.5, 3000, 4000, 100000000]) {
    const r = await raw(f.passenger, '/bookings', 'POST', { tripId: f.trip.id, numberOfSeats: 1, proposedPricePerSeat });
    assert.equal(r.status, 400, `Invalid proposal ${proposedPricePerSeat}`);
  }
  assert.equal((await backend.notifications()).length, start);
});

test('capacity race rolls back price and response; refresh shows unchanged pending booking', async () => {
  const f = await backend.fixture(), { driver, booking } = await create(f);
  const other = await backend.actor('passenger'), otherClient = mobile(other);
  const b2 = await otherClient.call('createBooking', { tripId: f.trip.id, numberOfSeats: 2, paymentMode: 'cash' });
  await driver.call('acceptBooking', b2.id);
  const third = await backend.actor('passenger'), thirdClient = mobile(third);
  const b3 = await thirdClient.call('createBooking', { tripId: f.trip.id, numberOfSeats: 1, paymentMode: 'cash' });
  await driver.call('acceptBooking', b3.id);
  await assert.rejects(driver.call('acceptBooking', policy.bookingAcceptanceArgument(booking)), e => e.status === 400);
  const refreshed = await driver.call('getBookingById', booking.id);
  assert.equal(refreshed.status, 'pending'); assert.equal(Number(refreshed.grossPaymentAmount), 6000);
  assert.equal((await backend.notices(booking.id)).length, 1);
  assert.equal((await backend.trip(f.trip.id)).availableSeats, 1);
});

test('closed or foreign booking never redirects the mobile to another driver trip', async () => {
  const f = await backend.fixture(), { driver, booking } = await create(f);
  const read = id => driver.call('getBookingById', id);
  const candidate = { id: booking.id, key: `booking:${booking.id}` };
  assert.equal(await navigation.verifyPendingBookingEntry(candidate, f.stranger.id, read, async () => null), null);
  await driver.call('rejectBooking', { id: booking.id, reason: 'Essai' });
  assert.equal(await navigation.verifyPendingBookingEntry(candidate, f.driver.id, read, async () => null), null);
});

test('HTTP booking details must not disclose another passenger reservation to an unrelated account', async () => {
  const f = await backend.fixture(), { booking, passenger, driver } = await create(f);
  const outsider = await backend.actor('passenger');
  // Prove both cold and shared warm-cache reads enforce the same ownership rules.
  for (const warm of [false, true]) {
    if (warm) {
      assert.equal((await passenger.call('getBookingById', booking.id)).id, booking.id);
      assert.equal((await driver.call('getBookingById', booking.id)).id, booking.id);
      assert.equal((await backend.cachedBooking(booking.id)).id, booking.id);
    }
    for (const actor of [f.stranger, outsider]) {
      const r = await raw(actor, `/bookings/${booking.id}`);
      const missing = await raw(actor, `/bookings/${randomUUID()}`);
      assert.equal(r.status, 404);
      assert.deepEqual(r.body, missing.body, 'Does not reveal whether the reservation exists');
      await assert.rejects(mobile(actor).call('getBookingById', booking.id), e => e.status === 404);
    }
  }
  assert.equal((await raw(null, `/bookings/${booking.id}`)).status, 401);
  assert.equal((await raw(f.passenger, '/bookings/not-a-uuid')).status, 400);
});

test('revoked trip ownership cannot be recovered from an old cached booking', async () => {
  const f = await backend.fixture(), { booking, driver } = await create(f);
  await driver.call('getBookingById', booking.id);
  assert.equal((await backend.cachedBooking(booking.id)).trip.driverId, f.driver.id);
  // Only this synthetic database row changes; deliberately leave its old cache intact.
  await backend.db.getRepository('Trip').update(f.trip.id, { driverId: f.stranger.id });
  await assert.rejects(driver.call('getBookingById', booking.id), e => e.status === 404);
  assert.equal((await backend.cachedBooking(booking.id)).trip.driverId, f.driver.id);
});
