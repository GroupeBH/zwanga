const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader();
const { isSuccessfulBooking, passengerReviewCompletion, driverReviewCompletion } = load('features/store-review/reviewEligibility.ts');
const { newReviewHistory, recordReviewCompletions, reviewIsDue, reserveReviewAttempt,
  parseReviewHistory, REVIEW_YEAR_MS, MAX_REVIEW_RECEIPTS } = load('features/store-review/reviewPolicy.ts');
const start = Date.parse('2026-09-22T10:00:00Z');
const date = new Date(start + 1000).toISOString();
const booking = (patch = {}) => ({ id: 'booking', tripId: 'trip', passengerId: 'passenger', numberOfSeats: 3,
  status: 'completed', pickedUp: true, droppedOff: true, droppedOffAt: date,
  paymentMode: 'electronic', paymentStatus: 'succeeded', paymentAmount: 5000, ...patch });
const completion = (id, role = 'passenger', completedAt = start + 1000) => ({ role, tripId: String(id), completedAt });

test('requires full dropoff and confirmed electronic/points payment, not pre-arrival payment', () => {
  assert.equal(isSuccessfulBooking(booking()), true);
  assert.equal(isSuccessfulBooking(booking({ paymentMode: 'points' })), true);
  for (const patch of [{ status: 'accepted' }, { pickedUp: false }, { droppedOff: false }, { droppedOffAt: null },
    { paymentStatus: 'initiated' }, { paymentStatus: 'failed' }, { paymentStatus: undefined }, { paymentMode: undefined },
    { interruptionFareLocked: true }, { interruptionRequest: { status: 'completed' } },
    { tripInterruptionRequest: { status: 'confirmed' } }]) assert.equal(isSuccessfulBooking(booking(patch)), false, JSON.stringify(patch));
  assert.equal(passengerReviewCompletion(booking(), 'other'), null);
  assert.deepEqual(passengerReviewCompletion(booking(), 'passenger'), completion('trip'));
});

test('cash needs an explicit matching receipt; free means known zero, never an absent amount', () => {
  const cash = booking({ paymentMode: 'cash', paymentStatus: 'not_required' });
  assert.equal(isSuccessfulBooking(cash), false);
  const received = { ...cash, cashReceivedAt: date, cashReceivedByDriverId: 'driver', cashReceivedAmount: 5000 };
  assert.equal(isSuccessfulBooking(received), true);
  assert.equal(isSuccessfulBooking({ ...received, cashReceivedAmount: 3000 }), false);
  assert.equal(isSuccessfulBooking({ ...received, cashReceivedByDriverId: null }), false);
  assert.equal(isSuccessfulBooking({ ...cash, paymentAmount: '0' }), true);
  for (const amount of [null, undefined, '', ' ', 'invalid']) assert.equal(isSuccessfulBooking({ ...cash, paymentAmount: amount }), false);
});

test('driver requires a completed trip, actual passengers and ALL their completed paid bookings', () => {
  const trip = { id: 'trip', status: 'completed', completedAt: date };
  assert.deepEqual(driverReviewCompletion(trip, [booking()]), completion('trip', 'driver'));
  assert.equal(driverReviewCompletion(trip, []), null);
  assert.equal(driverReviewCompletion({ ...trip, status: 'ongoing' }, [booking()]), null);
  assert.equal(driverReviewCompletion(trip, [booking(), booking({ id: 'second', paymentStatus: 'pending' })]), null);
  assert.equal(driverReviewCompletion(trip, [booking(), booking({ id: 'second', status: 'accepted' })]), null);
  assert.ok(driverReviewCompletion(trip, [booking(), booking({ id: 'cancelled', status: 'cancelled', pickedUp: false })]));
  assert.equal(driverReviewCompletion(trip, [booking({ interruptionFareLocked: true })]), null);
});

test('no first-use prompt from old history; duplicate bookings, repeated responses and seats count once per trip/role', () => {
  const initial = newReviewHistory(start);
  assert.equal(recordReviewCompletions(initial, [completion('old', 'passenger', start)], start + 5000), initial);
  const next = recordReviewCompletions(initial, [completion(1), completion(1), completion(1, 'driver')], start + 5000);
  assert.equal(next.passenger.count, 1); assert.equal(next.driver.count, 1);
  assert.equal(recordReviewCompletions(next, [completion(1)], start + 5000), next);
  assert.equal(recordReviewCompletions(initial, [completion(2, 'passenger', start + 99999)], start + 5000), initial);
});

test('milestones are exactly 1, 10, 20 and attempts are shared between roles over rolling 365 days', () => {
  let state = newReviewHistory(start);
  const now = start + 10000;
  for (let i = 1; i <= 21; i++) {
    state = recordReviewCompletions(state, [completion(i)], now);
    assert.equal(reviewIsDue(state, now), [1, 10, 20].includes(i), `trip ${i}`);
    if (reviewIsDue(state, now)) state = reserveReviewAttempt(state, now);
  }
  state = recordReviewCompletions(state, [completion('driver-first', 'driver')], now);
  assert.equal(reviewIsDue(state, now), false);
  assert.equal(reviewIsDue(state, now + REVIEW_YEAR_MS - 1), false);
  assert.equal(reviewIsDue(state, now + REVIEW_YEAR_MS), true);
  state = reserveReviewAttempt(state, now + REVIEW_YEAR_MS);
  assert.equal(state.attempts.length, 1);
  assert.equal(reviewIsDue(state, now + REVIEW_YEAR_MS), false);
});

test('batch catchup and both roles coalesce into a single request rather than a burst', () => {
  let state = recordReviewCompletions(newReviewHistory(start),
    [...Array.from({ length: 21 }, (_, index) => completion(index)), completion('driver', 'driver')], start + 5000);
  state = reserveReviewAttempt(state, start + 5000);
  assert.equal(state.attempts.length, 1); assert.equal(reviewIsDue(state, start + 5000), false);
  state = recordReviewCompletions(state, Array.from({ length: 9 }, (_, i) => completion(i + 21)), start + 5000);
  assert.equal(reviewIsDue(state, start + 5000), true);
});

test('deduplication stays bounded and pruning never allows old rides to be counted again', () => {
  const items = Array.from({ length: MAX_REVIEW_RECEIPTS + 20 }, (_, i) => completion(i, 'passenger', start + i + 1));
  const state = recordReviewCompletions(newReviewHistory(start), items, start + 5000);
  assert.ok(Object.keys(state.passenger.seen).length <= MAX_REVIEW_RECEIPTS);
  assert.equal(recordReviewCompletions(state, items, start + 5000), state);
  assert.equal(state.passenger.count, items.length);
  assert.deepEqual(parseReviewHistory(JSON.stringify(state), start), state);
});

test('invalid storage never silently resets the attempt quota', () => {
  for (const raw of ['bad json', 'null', '{}', JSON.stringify({ ...newReviewHistory(start), version: 2 }),
    JSON.stringify({ ...newReviewHistory(start), attempts: [1, 2, 3, 4] })]) assert.throws(() => parseReviewHistory(raw, start));
  assert.equal(reviewIsDue(parseReviewHistory(null, start), start), false);
});
