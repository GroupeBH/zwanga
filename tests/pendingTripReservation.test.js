const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture() {
  const h = hookHarness(), calls = [], env = { version: 1, enabled: true, result: true };
  const booking = { id: 'a', tripId: 'trip', passengerId: 'passenger', status: 'pending', numberOfSeats: 2 };
  const w = { ready: true, busy: false, feedback: null, dismissFeedback() { w.feedback = null; },
    state: { userId: 'owner', isOwner: true, isScreenActive: true, trip: { id: 'trip', driverId: 'owner', status: 'upcoming' }, bookings: [booking] },
    bookingsActions: { handleAcceptBooking: async id => { calls.push(['accept', id]); return env.result; },
      handleRejectBooking: async value => { calls.push(['reject', value.id]); return env.result; } } };
  const { usePendingTripReservation } = loader({ react: h.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => env.version },
  })('hooks/trip-detail/usePendingTripReservation.ts');
  return { h, env, w, calls, booking, render: () => h.render(() => usePendingTripReservation(w, env.enabled)) };
}

test('REST discovery opens pending reservation; accept once advances to the next passenger without starting a trip', async () => {
  const f = fixture(); f.w.state.bookings.push({ ...f.booking, id: 'b' });
  const panel = f.render(); assert.equal(panel.visible, true); assert.equal(panel.booking.id, 'a');
  await Promise.all([panel.answer(true), panel.answer(true)]);
  assert.deepEqual(f.calls, [['accept', 'a']]); assert.equal(f.render().booking.id, 'b'); f.h.unmount();
});

test('refuse is a single explicit decision, close is not a rejection and a refresh does not reopen it', async () => {
  const f = fixture(); f.render().dismiss(); assert.equal(f.render().visible, false); assert.deepEqual(f.calls, []);
  f.w.state.bookings = [{ ...f.booking }]; assert.equal(f.render().visible, false);
  f.w.state.bookings = [{ ...f.booking, proposedPricePerSeat: 1800 }]; assert.equal(f.render().visible, true);
  await f.render().answer(false); assert.deepEqual(f.calls, [['reject', 'a']]); assert.equal(f.render().visible, false); f.h.unmount();
});

test('failure remains actionable; only confirmed or reconciled success dismisses the reservation', async () => {
  const f = fixture(); f.env.result = false;
  await f.render().answer(true); f.w.feedback = { type: 'error', message: 'Connexion interrompue' };
  const panel = f.render(); assert.equal(panel.visible, true); assert.equal(panel.error, 'Connexion interrompue');
  f.env.result = true; await panel.answer(true); assert.equal(f.render().visible, false); f.h.unmount();
});

for (const reason of ['blur', 'session', 'offline', 'read-error', 'not-owner', 'expired', 'completed', 'foreign-booking', 'self-booking', 'cancelled-booking', 'finished-booking', 'overlay']) {
  test(`no automatic panel or write for ${reason}`, async () => {
    const f = fixture(), old = f.render();
    if (reason === 'blur') f.w.state.isScreenActive = false;
    if (reason === 'session') f.env.version++;
    if (reason === 'offline') { f.w.state.bookingsOffline = true; f.w.ready = false; }
    if (reason === 'read-error') { f.w.state.bookingsError = true; f.w.ready = false; }
    if (reason === 'not-owner') f.w.state.isOwner = false;
    if (reason === 'expired') f.w.state.trip.isExpired = true;
    if (reason === 'completed') f.w.state.trip.status = 'completed';
    if (reason === 'foreign-booking') f.w.state.bookings = [{ ...f.booking, tripId: 'other' }];
    if (reason === 'self-booking') f.w.state.bookings = [{ ...f.booking, passengerId: 'owner' }];
    if (reason === 'cancelled-booking') f.w.state.bookings = [{ ...f.booking, status: 'cancelled' }];
    if (reason === 'finished-booking') f.w.state.bookings = [{ ...f.booking, droppedOff: true }];
    if (reason === 'overlay') f.env.enabled = false;
    assert.equal(f.render().visible, false);
    await old.answer(true); assert.equal(f.calls.length, 0); f.h.unmount();
  });
}

test('refresh keeps the panel but disables decisions, and cancelled bookings disappear', async () => {
  const f = fixture(); f.render(); f.w.ready = false; f.w.state.bookingsFetching = true;
  assert.equal(f.render().visible, true); assert.equal(f.render().disabled, true);
  await f.render().answer(true); assert.equal(f.calls.length, 0);
  f.w.state.bookings = []; assert.equal(f.render().visible, false); f.h.unmount();
});

test('notification booking focus wins and no stale price can be accepted', async () => {
  const f = fixture(); f.w.state.bookings.push({ ...f.booking, id: 'b' }); f.w.state.focusBookingId = 'b';
  const old = f.render(); assert.equal(old.booking.id, 'b');
  f.w.state.bookings = [{ ...f.booking, id: 'b', proposedPricePerSeat: 1000 }]; f.render();
  await old.answer(true); assert.equal(f.calls.length, 0); f.h.unmount();
});

test('unmount during answer cannot mark another screen reservation as handled', async () => {
  const f = fixture(); let done; f.env.result = new Promise(resolve => { done = resolve; });
  const task = f.render().answer(true); f.h.unmount(); done(true); await task;
  assert.deepEqual(f.calls, [['accept', 'a']]);
});

test('a new reservation never replaces the passenger currently being reviewed', () => {
  const f = fixture(); f.w.state.bookings = [{ ...f.booking, id: 'b' }]; assert.equal(f.render().booking.id, 'b');
  f.w.state.bookings.push(f.booking); assert.equal(f.render().booking.id, 'b');
  f.render().dismiss(); assert.equal(f.render().booking.id, 'a'); f.h.unmount();
});
